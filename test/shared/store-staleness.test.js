// The regression test for the bug that made the watch face read "Never sent" while the phone had
// the send recorded and Home Assistant had the data.
//
// Handling one reply from the phone runs a chain of separate whole-file read-modify-writes: the
// send outcome, then the phone's summary, then the config, then the service-start diagnostics. That
// chain is only correct if a write is visible to the very next read — and on device it was not. The
// fields written last (config, start result) survived; the send record, written first, was
// overwritten by every later call re-reading the file's pre-chain contents.
//
// The fake filesystem below reproduces exactly that: writes land, but reads keep returning the
// snapshot from before the chain started.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({
  files: new Map(),
  // When true, reads serve `stale` instead of what has actually been written.
  state: { lagging: false },
  stale: new Map(),
}))

vi.mock('@zos/fs', () => ({
  readFileSync: ({ path }) => {
    const source = fs.state.lagging ? fs.stale : fs.files
    return source.has(path) ? source.get(path) : undefined
  },
  writeFileSync: ({ path, data }) => {
    fs.files.set(path, data)
  },
}))

vi.mock('@zos/utils', () => ({ log: { getLogger: () => ({ log: () => {}, error: () => {} }) } }))

const { resetStoreCache } = await import('../../shared/store')
const { getSendStatus, recordBackgroundSummary, recordSendResult, recordServiceStartResult } =
  await import('../../shared/send-status')
const { readConfig, writeConfig } = await import('../../shared/config-storage')

beforeEach(() => {
  fs.files.clear()
  fs.stale.clear()
  fs.state.lagging = false
  resetStoreCache()
})

// Replays what page/index.js does with a single GET_CONFIG reply, in the order it does it.
function handleReplyFromPhone() {
  recordBackgroundSummary({ sendOk: true, sendTime: 1700000060, sendError: '' })
  writeConfig({ intervalMinutes: 15, configured: true, time: 1700000100 })
  recordServiceStartResult(0)
}

describe('a filesystem whose reads lag behind its writes', () => {
  it('keeps the send record that the rest of the chain used to overwrite', () => {
    // The store is loaded once, before the chain — the app open that precedes it.
    resetStoreCache()
    fs.state.lagging = true

    handleReplyFromPhone()

    const status = getSendStatus()
    expect(status.time).toBe(1700000060)
    expect(status.ok).toBe(true)
  })

  it('keeps every field the chain wrote, not just the last one', () => {
    resetStoreCache()
    fs.state.lagging = true

    handleReplyFromPhone()

    expect(getSendStatus().time).toBe(1700000060)
    expect(readConfig()).toMatchObject({ intervalMinutes: 15, configured: true, known: true })
  })

  // The same chain, run against a manual send: the local record is written first and so was the
  // most exposed of all.
  it('keeps a manual send that is followed by a config write', () => {
    resetStoreCache()
    fs.state.lagging = true

    recordSendResult({ ok: true, configured: true, time: 1700000000 })
    writeConfig({ intervalMinutes: 15, configured: true, time: 1700000100 })

    expect(getSendStatus()).toMatchObject({ ok: true, time: 1700000000 })
  })
})

describe('persistence across app opens', () => {
  it('still writes the accumulated state to the file, not just to memory', () => {
    handleReplyFromPhone()

    // A fresh VM: the cache is gone and the file is all there is.
    resetStoreCache()

    expect(getSendStatus().time).toBe(1700000060)
    expect(readConfig().intervalMinutes).toBe(15)
  })
})

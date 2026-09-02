import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({ files: new Map(), state: { readThrows: false, writeThrows: false } }))

vi.mock('@zos/fs', () => ({
  readFileSync: ({ path }) => {
    if (fs.state.readThrows) throw new Error('fs unavailable in this context')
    return fs.files.has(path) ? fs.files.get(path) : undefined
  },
  writeFileSync: ({ path, data }) => {
    if (fs.state.writeThrows) throw new Error('fs unavailable in this context')
    fs.files.set(path, data)
  },
}))

vi.mock('@zos/utils', () => ({ log: { getLogger: () => ({ log: () => {}, error: () => {} }) } }))

const {
  getBackgroundSummary,
  getLastPermissionQuery,
  getLastPermissionRequest,
  getLastServiceStartResult,
  getSendStatus,
  getServiceTrace,
  hasPromptedForPermission,
  recordBackgroundSummary,
  recordPermissionPrompted,
  recordPermissionQuery,
  recordPermissionRequest,
  recordServiceStartResult,
  recordSendResult,
} = await import('../../shared/send-status')
const { resetStoreCache } = await import('../../shared/store')

beforeEach(() => {
  fs.files.clear()
  resetStoreCache()
  fs.state.readThrows = false
  fs.state.writeThrows = false
})

describe('getSendStatus', () => {
  it('returns the "never sent" sentinel before any result has been recorded', () => {
    expect(getSendStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })

  it('reflects a successful send back', () => {
    recordSendResult({ ok: true, configured: true, time: 1700000000 })
    expect(getSendStatus()).toEqual({ ok: true, error: '', time: 1700000000, configured: true })
  })

  it('persists a failed send with its error message', () => {
    recordSendResult({ ok: false, error: 'timeout', configured: true, time: 1700000001 })
    expect(getSendStatus()).toEqual({ ok: false, error: 'timeout', time: 1700000001, configured: true })
  })

  it('leaves "configured" untouched when omitted (transport-level failure)', () => {
    recordSendResult({ ok: true, configured: true, time: 1700000000 })
    recordSendResult({ ok: false, error: 'BLE disconnected', time: 1700000002 })
    expect(getSendStatus()).toEqual({ ok: false, error: 'BLE disconnected', time: 1700000002, configured: true })
  })

  it('defaults time to the current time when not provided', () => {
    const before = Math.floor(Date.now() / 1000)
    recordSendResult({ ok: true, configured: true })
    expect(getSendStatus().time).toBeGreaterThanOrEqual(before)
  })

  it('degrades to the sentinel instead of throwing when the filesystem is unavailable', () => {
    fs.state.readThrows = true
    expect(getSendStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })
})

// The background service writes nothing on the watch — it cannot. Its history reaches the watch only
// in the phone's reply to a send, and is cached here so the next app open can show it without
// another round trip.
describe('background summary', () => {
  it('reports zeroes before the phone has ever reported one', () => {
    expect(getBackgroundSummary()).toEqual({ helloTime: 0, lastTime: 0, count: 0, alarmCount: 0, trigger: '', stage: '', timerMode: '' })
  })

  it('round-trips what the phone reported', () => {
    recordBackgroundSummary({ helloTime: 1700000000, lastTime: 1700000060, count: 3, alarmCount: 2, trigger: 'wd', stage: 'ok', timerMode: 'T' })
    expect(getBackgroundSummary()).toEqual({ helloTime: 1700000000, lastTime: 1700000060, count: 3, alarmCount: 2, trigger: 'wd', stage: 'ok', timerMode: 'T' })
  })

  // An older phone-side build, or a reply that never arrived, must not blank out a history the
  // watch has already been told about.
  it('ignores a missing or malformed summary rather than erasing what it knows', () => {
    recordBackgroundSummary({ helloTime: 1700000000, lastTime: 1700000060, count: 3, alarmCount: 2, trigger: 'wd', stage: 'ok', timerMode: 'T' })

    expect(recordBackgroundSummary(undefined)).toBe(false)
    expect(recordBackgroundSummary('nonsense')).toBe(false)

    expect(getBackgroundSummary()).toEqual({ helloTime: 1700000000, lastTime: 1700000060, count: 3, alarmCount: 2, trigger: 'wd', stage: 'ok', timerMode: 'T' })
  })

  // `hi:` present with `bg:`/`n:` empty is the signature of a service that starts but whose send
  // fails — the two must stay independently readable.
  it('keeps a hello with no sends distinguishable from no hello at all', () => {
    recordBackgroundSummary({ helloTime: 1700000000, lastTime: 0, count: 0, alarmCount: 0, trigger: 'page', stage: 'sensors', timerMode: 'T' })
    expect(getBackgroundSummary()).toEqual({ helloTime: 1700000000, lastTime: 0, count: 0, alarmCount: 0, trigger: 'page', stage: 'sensors', timerMode: 'T' })
  })

  it('does not make the app look sent', () => {
    recordBackgroundSummary({ helloTime: 1700000000, lastTime: 1700000060, count: 3, alarmCount: 2, trigger: 'wd', stage: 'ok', timerMode: 'T' })
    expect(getSendStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })
})

// A background send changes nothing on the watch — the service that ran it has no watch-side storage
// to write to. The phone's record of it, carried back on the next reply, is the only way the status
// line can ever move without someone pressing "Send now".
describe('send status from the phone', () => {
  it('shows a background send the watch never performed itself', () => {
    recordBackgroundSummary({ sendOk: true, sendTime: 1700000060, sendError: '' })
    expect(getSendStatus()).toMatchObject({ ok: true, error: '', time: 1700000060 })
  })

  it('prefers the phone when its record is the newer of the two', () => {
    recordSendResult({ ok: true, configured: true, time: 1700000000 })
    recordBackgroundSummary({ sendOk: false, sendTime: 1700000060, sendError: 'webhook responded with status 500' })
    expect(getSendStatus()).toEqual({
      ok: false,
      error: 'webhook responded with status 500',
      time: 1700000060,
      configured: true,
    })
  })

  // A round trip that never reached the phone leaves nothing there to find, so the local record is
  // the only witness that the attempt happened at all.
  it('keeps a local failure that is newer than anything the phone saw', () => {
    recordBackgroundSummary({ sendOk: true, sendTime: 1700000000, sendError: '' })
    recordSendResult({ ok: false, error: 'BLE request failed', time: 1700000060 })
    expect(getSendStatus()).toMatchObject({ ok: false, error: 'BLE request failed', time: 1700000060 })
  })

  // The webhook state comes from the config pull, not from either send record, and must survive a
  // summary that has nothing to say about it.
  it('leaves the known webhook state alone', () => {
    recordSendResult({ ok: true, configured: false, time: 1700000000 })
    recordBackgroundSummary({ sendOk: true, sendTime: 1700000060, sendError: '' })
    expect(getSendStatus().configured).toBe(false)
  })
})

describe('service start result', () => {
  it('returns null before the boot path has ever called start()', () => {
    expect(getLastServiceStartResult()).toBe(null)
  })

  it('persists a numeric success/error code', () => {
    recordServiceStartResult(0)
    expect(getLastServiceStartResult()).toBe(0)

    recordServiceStartResult(3)
    expect(getLastServiceStartResult()).toBe(3)
  })

  it('persists the non-numeric markers for the paths that never reached start()', () => {
    recordServiceStartResult('needs-permission')
    expect(getLastServiceStartResult()).toBe('needs-permission')

    recordServiceStartResult('threw:permission denied')
    expect(getLastServiceStartResult()).toBe('threw:permission denied')
  })

  // 0 is both a real start() return (success) and falsy — it must survive as itself rather than
  // collapsing into the "nothing recorded" sentinel the page renders as `st:?`.
  it('keeps a recorded 0 distinguishable from nothing recorded', () => {
    expect(getLastServiceStartResult()).toBe(null)
    recordServiceStartResult(0)
    expect(getLastServiceStartResult()).toBe(0)
  })
})

describe('permission diagnostics', () => {
  it('returns null before a boot attempt has recorded either code', () => {
    expect(getLastPermissionQuery()).toBe(null)
    expect(getLastPermissionRequest()).toBe(null)
  })

  it('persists the query and request codes independently', () => {
    recordPermissionQuery(0)
    recordPermissionRequest(2)
    expect(getLastPermissionQuery()).toBe(0)
    expect(getLastPermissionRequest()).toBe(2)
  })

  it('persists the non-numeric markers used when a permission call throws', () => {
    recordPermissionQuery('threw')
    recordPermissionRequest('threw')
    expect(getLastPermissionQuery()).toBe('threw')
    expect(getLastPermissionRequest()).toBe('threw')
  })
})

// The first-launch dialog is raised once and never again. The flag is recorded before the dialog
// goes up, not after it is answered, so that a prompt the user swipes away without answering still
// counts as spent — otherwise it would reappear on every single open.
describe('first-launch permission prompt', () => {
  it('reports not yet prompted on a fresh install', () => {
    expect(hasPromptedForPermission()).toBe(false)
  })

  it('stays recorded once the dialog has been raised', () => {
    recordPermissionPrompted()
    expect(hasPromptedForPermission()).toBe(true)
  })

  // The store is shared, and a prompt already spent must survive every later write — a flag that
  // got clobbered would put the dialog back on every open.
  it('survives other recorders writing to the same store', () => {
    recordPermissionPrompted()
    recordPermissionQuery(2)
    recordServiceStartResult(0)
    recordSendResult({ ok: true, time: 1700000000 })

    expect(hasPromptedForPermission()).toBe(true)
  })

  // A filesystem that stops answering mid-session no longer un-knows what this VM has already
  // recorded: the store serves its in-memory copy, and only a *fresh* VM would fall back to the
  // default. Losing the flag here would raise the first-launch permission dialog a second time.
  it('keeps what it already knows when the filesystem stops answering', () => {
    recordPermissionPrompted()
    fs.state.readThrows = true
    expect(hasPromptedForPermission()).toBe(true)
  })

  it('reports not prompted instead of throwing when the store cannot be read at all', () => {
    fs.state.readThrows = true
    resetStoreCache()
    expect(hasPromptedForPermission()).toBe(false)
  })
})

// Each recorder merges into one shared file; none may drop what another wrote.
describe('durability across recorders', () => {
  it('keeps every recorded field intact as others are written', () => {
    recordPermissionQuery(2)
    recordPermissionRequest(0)
    recordServiceStartResult(0)
    recordSendResult({ ok: true, configured: true, time: 1700000000 })
    recordBackgroundSummary({ helloTime: 1700000060, lastTime: 1700000120, count: 2, alarmCount: 1, trigger: 'wd', stage: 'ok', timerMode: 'T' })

    expect(getLastPermissionQuery()).toBe(2)
    expect(getLastPermissionRequest()).toBe(0)
    expect(getLastServiceStartResult()).toBe(0)
    expect(getSendStatus()).toMatchObject({ ok: true, time: 1700000000 })
    expect(getBackgroundSummary()).toEqual({ helloTime: 1700000060, lastTime: 1700000120, count: 2, alarmCount: 1, trigger: 'wd', stage: 'ok', timerMode: 'T' })
  })

  it('reports a failed write instead of throwing', () => {
    fs.state.writeThrows = true
    expect(recordSendResult({ ok: true, time: 1700000000 })).toBe(false)
    expect(recordServiceStartResult(0)).toBe(false)
    expect(recordBackgroundSummary({ helloTime: 1, lastTime: 2, count: 3 })).toBe(false)
  })
})

// The service's breadcrumb, written by app-service/index.js into its own file. It is what splits the
// alarm-to-send chain: every failure in it used to present identically as `a:0`.
describe('service trace', () => {
  it('reads zeroes when the watchdog has never written its file', () => {
    expect(getServiceTrace()).toEqual({ runs: 0, done: 0, last: '' })
  })

  it('reads back what the watchdog recorded', () => {
    fs.files.set('service-trace.json', JSON.stringify({ runs: 7, done: 5, last: 'ok' }))
    expect(getServiceTrace()).toEqual({ runs: 7, done: 5, last: 'ok' })
  })

  // `runs` without `done` is the interesting split, and the one this exists to detect: the alarm
  // woke the service and the run did not survive long enough to finish its round trip.
  it('keeps runs and done independent', () => {
    fs.files.set('service-trace.json', JSON.stringify({ runs: 4, last: 'ok' }))
    expect(getServiceTrace()).toEqual({ runs: 4, done: 0, last: 'ok' })
  })

  // `@zos/fs` is only documented to work in that context while the screen is off, so this file is
  // more likely than most to be unreadable. A diagnostic must never take the page down with it.
  it('reads zeroes instead of throwing when the filesystem is unavailable', () => {
    fs.state.readThrows = true
    expect(getServiceTrace()).toEqual({ runs: 0, done: 0, last: '' })
  })

  // `done` alone cannot say whether the round trip failed or the run was cut short — a killed run
  // leaves the previous code standing. The outcome text is what tells a BLE failure from a silence.
  it('carries the outcome code from the last completed run', () => {
    fs.files.set('service-trace.json', JSON.stringify({ runs: 3, done: 0, last: 'ble:timeout' }))
    expect(getServiceTrace()).toEqual({ runs: 3, done: 0, last: 'ble:timeout' })
  })
})

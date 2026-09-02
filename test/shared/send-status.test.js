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
  getSyncStatus,
  getServiceTrace,
  hasPromptedForPermission,
  recordBackgroundSummary,
  recordPermissionPrompted,
  recordPermissionQuery,
  recordPermissionRequest,
  recordServiceStartResult,
  recordSyncResult,
} = await import('../../shared/sync-status')

beforeEach(() => {
  fs.files.clear()
  fs.state.readThrows = false
  fs.state.writeThrows = false
})

describe('getSyncStatus', () => {
  it('returns the "never synced" sentinel before any result has been recorded', () => {
    expect(getSyncStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })

  it('reflects a successful sync back', () => {
    recordSyncResult({ ok: true, configured: true, time: 1700000000 })
    expect(getSyncStatus()).toEqual({ ok: true, error: '', time: 1700000000, configured: true })
  })

  it('persists a failed sync with its error message', () => {
    recordSyncResult({ ok: false, error: 'timeout', configured: true, time: 1700000001 })
    expect(getSyncStatus()).toEqual({ ok: false, error: 'timeout', time: 1700000001, configured: true })
  })

  it('leaves "configured" untouched when omitted (transport-level failure)', () => {
    recordSyncResult({ ok: true, configured: true, time: 1700000000 })
    recordSyncResult({ ok: false, error: 'BLE disconnected', time: 1700000002 })
    expect(getSyncStatus()).toEqual({ ok: false, error: 'BLE disconnected', time: 1700000002, configured: true })
  })

  it('defaults time to the current time when not provided', () => {
    const before = Math.floor(Date.now() / 1000)
    recordSyncResult({ ok: true, configured: true })
    expect(getSyncStatus().time).toBeGreaterThanOrEqual(before)
  })

  it('degrades to the sentinel instead of throwing when the filesystem is unavailable', () => {
    fs.state.readThrows = true
    expect(getSyncStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })
})

// The background service writes nothing on the watch — it cannot. Its history reaches the watch only
// in the phone's reply to a sync, and is cached here so the next app open can show it without
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

  // `hi:` present with `bg:`/`n:` empty is the signature of a service that starts but whose sync
  // fails — the two must stay independently readable.
  it('keeps a hello with no syncs distinguishable from no hello at all', () => {
    recordBackgroundSummary({ helloTime: 1700000000, lastTime: 0, count: 0, alarmCount: 0, trigger: 'page', stage: 'sensors', timerMode: 'T' })
    expect(getBackgroundSummary()).toEqual({ helloTime: 1700000000, lastTime: 0, count: 0, alarmCount: 0, trigger: 'page', stage: 'sensors', timerMode: 'T' })
  })

  it('does not make the app look synced', () => {
    recordBackgroundSummary({ helloTime: 1700000000, lastTime: 1700000060, count: 3, alarmCount: 2, trigger: 'wd', stage: 'ok', timerMode: 'T' })
    expect(getSyncStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
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
    recordSyncResult({ ok: true, time: 1700000000 })

    expect(hasPromptedForPermission()).toBe(true)
  })

  it('reports not prompted instead of throwing when the filesystem is unavailable', () => {
    recordPermissionPrompted()
    fs.state.readThrows = true
    expect(hasPromptedForPermission()).toBe(false)
  })
})

// Each recorder merges into one shared file; none may drop what another wrote.
describe('durability across recorders', () => {
  it('keeps every recorded field intact as others are written', () => {
    recordPermissionQuery(2)
    recordPermissionRequest(0)
    recordServiceStartResult(0)
    recordSyncResult({ ok: true, configured: true, time: 1700000000 })
    recordBackgroundSummary({ helloTime: 1700000060, lastTime: 1700000120, count: 2, alarmCount: 1, trigger: 'wd', stage: 'ok', timerMode: 'T' })

    expect(getLastPermissionQuery()).toBe(2)
    expect(getLastPermissionRequest()).toBe(0)
    expect(getLastServiceStartResult()).toBe(0)
    expect(getSyncStatus()).toMatchObject({ ok: true, time: 1700000000 })
    expect(getBackgroundSummary()).toEqual({ helloTime: 1700000060, lastTime: 1700000120, count: 2, alarmCount: 1, trigger: 'wd', stage: 'ok', timerMode: 'T' })
  })

  it('reports a failed write instead of throwing', () => {
    fs.state.writeThrows = true
    expect(recordSyncResult({ ok: true, time: 1700000000 })).toBe(false)
    expect(recordServiceStartResult(0)).toBe(false)
    expect(recordBackgroundSummary({ helloTime: 1, lastTime: 2, count: 3 })).toBe(false)
  })
})

// The service's breadcrumb, written by app-service/index.js into its own file. It is what splits the
// alarm-to-sync chain: every failure in it used to present identically as `a:0`.
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

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@zos/storage', () => ({
  localStorage: {
    getItem: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
    setItem: (key, value) => store.set(key, value),
  },
}))

const {
  getLastServiceStart,
  getLastServiceStartResult,
  getLastTimerAvailable,
  recordServiceStart,
  recordServiceStartResult,
  recordSyncResult,
  recordTimerAvailable,
  getSyncStatus,
} = await import('../../shared/sync-status')

beforeEach(() => {
  store.clear()
})

describe('getSyncStatus', () => {
  it('returns the "never synced" sentinel before any result has been recorded', () => {
    expect(getSyncStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })
})

describe('recordSyncResult / getSyncStatus', () => {
  it('persists a successful sync and reflects it back', () => {
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
    const status = getSyncStatus()
    expect(status.time).toBeGreaterThanOrEqual(before)
  })
})

describe('recordServiceStart / getLastServiceStart', () => {
  it('returns 0 before any service run has started', () => {
    expect(getLastServiceStart()).toBe(0)
  })

  it('persists the service start time independently of recordSyncResult', () => {
    recordServiceStart(1700000000)
    expect(getLastServiceStart()).toBe(1700000000)
    // A service that started but never reached recordSyncResult (e.g. cut off mid-cycle)
    // must not look "synced" — the two are deliberately separate keys.
    expect(getSyncStatus()).toEqual({ ok: null, error: '', time: 0, configured: null })
  })

  it('defaults time to the current time when not provided', () => {
    const before = Math.floor(Date.now() / 1000)
    recordServiceStart()
    expect(getLastServiceStart()).toBeGreaterThanOrEqual(before)
  })
})

describe('recordTimerAvailable / getLastTimerAvailable', () => {
  it('returns null before any cycle has recorded it', () => {
    expect(getLastTimerAvailable()).toBe(null)
  })

  it('persists true and false distinctly', () => {
    recordTimerAvailable(true)
    expect(getLastTimerAvailable()).toBe(true)

    recordTimerAvailable(false)
    expect(getLastTimerAvailable()).toBe(false)
  })
})

describe('recordServiceStartResult / getLastServiceStartResult', () => {
  it('returns null before app.js has ever called start()', () => {
    expect(getLastServiceStartResult()).toBe(null)
  })

  it('persists a numeric success/error code', () => {
    recordServiceStartResult(0)
    expect(getLastServiceStartResult()).toBe(0)

    recordServiceStartResult(3)
    expect(getLastServiceStartResult()).toBe(3)
  })

  it('persists a "threw:<message>" string when start() itself throws', () => {
    recordServiceStartResult('threw:permission denied')
    expect(getLastServiceStartResult()).toBe('threw:permission denied')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@zos/storage', () => ({
  localStorage: {
    getItem: (key, fallback) => (store.has(key) ? store.get(key) : fallback),
    setItem: (key, value) => store.set(key, value),
  },
}))

const { recordSyncResult, getSyncStatus } = await import('../../shared/sync-status')

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

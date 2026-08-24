import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_INTERVAL_MINUTES } from '../../shared/constants'

// Storage is deliberately configurable per test, the same way test/shared/alarm.test.js used to
// mock it: a firmware whose localStorage round-trips numbers as strings must not break parsing.
const storageStore = new Map()
let storageMode = 'typed'
let storageThrows = false

vi.mock('@zos/storage', () => ({
  localStorage: {
    getItem: (key, fallback) => {
      if (storageThrows) throw new Error('storage unavailable in this context')
      if (!storageStore.has(key)) return fallback
      const value = storageStore.get(key)
      return storageMode === 'stringified' ? String(value) : value
    },
    setItem: (key, value) => {
      if (storageThrows) throw new Error('storage unavailable in this context')
      storageStore.set(key, value)
    },
  },
}))

const { readStoredInterval, writeStoredInterval } = await import('../../shared/interval-storage')

beforeEach(() => {
  storageStore.clear()
  storageMode = 'typed'
  storageThrows = false
})

describe('readStoredInterval', () => {
  it('falls back to the default interval on a fresh install', () => {
    expect(readStoredInterval()).toBe(DEFAULT_INTERVAL_MINUTES)
  })

  it('returns a stored numeric interval', () => {
    storageStore.set(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, 15)
    expect(readStoredInterval()).toBe(15)
  })

  it('reads a stringified stored interval correctly', () => {
    storageStore.set(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, 15)
    storageMode = 'stringified'
    expect(readStoredInterval()).toBe(15)
  })

  it('falls back to the default interval when storage throws', () => {
    storageThrows = true
    expect(readStoredInterval()).toBe(DEFAULT_INTERVAL_MINUTES)
  })

  it('falls back to the default interval for garbage input', () => {
    storageStore.set(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, 'not-a-number')
    expect(readStoredInterval()).toBe(DEFAULT_INTERVAL_MINUTES)
  })
})

describe('writeStoredInterval', () => {
  it('persists the interval so a later read reflects it', () => {
    writeStoredInterval(20)
    expect(readStoredInterval()).toBe(20)
  })

  it('does not throw when storage is unavailable', () => {
    storageThrows = true
    expect(() => writeStoredInterval(20)).not.toThrow()
  })
})

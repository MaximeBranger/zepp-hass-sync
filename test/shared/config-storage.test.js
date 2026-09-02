import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  STATE_KEY_CONFIG_TIME,
  STATE_KEY_SEND_INTERVAL_MINUTES,
  STATE_KEY_WEBHOOK_CONFIGURED,
} from '../../shared/constants'

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

const { PAGE_STORE, resetStoreCache } = await import('../../shared/store')
const { readConfig, writeConfig } = await import('../../shared/config-storage')

// Writes straight to the fake filesystem, behind the store's back, to stand in for a file left by
// a previous app open. The cache reset is what makes that stand-in honest: the store loads a file
// once per VM, so a test that seeds a second time is describing a second app open, not a second
// read within one.
function seed(fields) {
  fs.files.set(PAGE_STORE, JSON.stringify(fields))
  resetStoreCache()
}

beforeEach(() => {
  fs.files.clear()
  resetStoreCache()
  fs.state.readThrows = false
  fs.state.writeThrows = false
})

describe('readConfig', () => {
  // The gate the background worker depends on. `known: false` is what stops the app starting a
  // service at the default pace before the phone has ever said what the user actually wants.
  it('reports the config unknown on a fresh install', () => {
    expect(readConfig()).toEqual({
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      configured: null,
      known: false,
    })
  })

  it('reports a pulled config as known', () => {
    seed({
      [STATE_KEY_SEND_INTERVAL_MINUTES]: 15,
      [STATE_KEY_WEBHOOK_CONFIGURED]: true,
      [STATE_KEY_CONFIG_TIME]: 1700000000,
    })

    expect(readConfig()).toEqual({ intervalMinutes: 15, configured: true, known: true })
  })

  // The whole reason a separate timestamp key exists: an interval that happens to equal the default
  // is indistinguishable from no interval at all if you only look at the value.
  it('tells a stored interval that equals the default apart from no interval at all', () => {
    seed({ [STATE_KEY_SEND_INTERVAL_MINUTES]: DEFAULT_INTERVAL_MINUTES, [STATE_KEY_CONFIG_TIME]: 1700000000 })

    expect(readConfig().known).toBe(true)
    expect(readConfig().intervalMinutes).toBe(DEFAULT_INTERVAL_MINUTES)
  })

  // `configured: false` blocks the worker; `configured: null` merely means nobody has said yet.
  // Collapsing the two would stop background send on a watch that has simply never been asked.
  it('keeps "no webhook" distinct from "not asked yet"', () => {
    seed({ [STATE_KEY_CONFIG_TIME]: 1700000000, [STATE_KEY_WEBHOOK_CONFIGURED]: false })
    expect(readConfig().configured).toBe(false)

    fs.files.clear()
    resetStoreCache()
    seed({ [STATE_KEY_CONFIG_TIME]: 1700000000 })
    expect(readConfig().configured).toBe(null)
  })

  // A firmware whose store round-trips numbers as strings must not break parsing.
  it('reads a stringified interval correctly', () => {
    seed({ [STATE_KEY_SEND_INTERVAL_MINUTES]: '15', [STATE_KEY_CONFIG_TIME]: 1700000000 })
    expect(readConfig().intervalMinutes).toBe(15)
  })

  it('clamps a stored interval that is out of range', () => {
    seed({ [STATE_KEY_SEND_INTERVAL_MINUTES]: 9999, [STATE_KEY_CONFIG_TIME]: 1 })
    expect(readConfig().intervalMinutes).toBe(MAX_INTERVAL_MINUTES)

    seed({ [STATE_KEY_SEND_INTERVAL_MINUTES]: 0, [STATE_KEY_CONFIG_TIME]: 1 })
    expect(readConfig().intervalMinutes).toBe(MIN_INTERVAL_MINUTES)
  })

  it('falls back to an unknown config when the filesystem is unavailable', () => {
    fs.state.readThrows = true
    expect(readConfig()).toEqual({
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      configured: null,
      known: false,
    })
  })

  it('falls back to the default interval for garbage input', () => {
    seed({ [STATE_KEY_SEND_INTERVAL_MINUTES]: 'not-a-number', [STATE_KEY_CONFIG_TIME]: 1 })
    expect(readConfig().intervalMinutes).toBe(DEFAULT_INTERVAL_MINUTES)
  })
})

describe('writeConfig', () => {
  it('persists a pulled config and marks it known', () => {
    writeConfig({ intervalMinutes: 20, configured: true, time: 1700000000 })

    expect(readConfig()).toEqual({ intervalMinutes: 20, configured: true, known: true })
  })

  // A reply that says nothing about the webhook must not be read as "no webhook" — that would stop
  // the background worker over a message-shape mismatch rather than a real configuration problem.
  it('leaves a known webhook state alone when the reply omits it', () => {
    writeConfig({ intervalMinutes: 20, configured: true, time: 1700000000 })
    writeConfig({ intervalMinutes: 25, time: 1700000060 })

    expect(readConfig()).toEqual({ intervalMinutes: 25, configured: true, known: true })
  })

  it('clamps on the way in', () => {
    writeConfig({ intervalMinutes: 9999, time: 1 })
    expect(readConfig().intervalMinutes).toBe(MAX_INTERVAL_MINUTES)
  })

  it('does not throw when the filesystem is unavailable', () => {
    fs.state.writeThrows = true
    expect(() => writeConfig({ intervalMinutes: 20, configured: true })).not.toThrow()
  })

  it('stamps the current time when none is given', () => {
    writeConfig({ intervalMinutes: 20, configured: true })
    expect(readConfig().known).toBe(true)
  })
})

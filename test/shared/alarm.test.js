import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_INTERVAL_MINUTES } from '../../shared/constants'

// Storage is deliberately configurable per test. The previous suite mocked it with a plain Map,
// which round-trips values with perfect type fidelity — and that assumption is precisely what hid
// the alarm leak, because `getAllAlarms().includes(storedId)` only fails when the stored id comes
// back as something other than a number. A mock that cannot reproduce the platform's behaviour
// cannot catch the platform's bug.
const storageStore = new Map()
let storageMode = 'typed'
let storageThrows = false
let nextAlarmId
let alarms

vi.mock('@zos/storage', () => ({
  localStorage: {
    getItem: (key, fallback) => {
      if (storageThrows) throw new Error('storage unavailable in this context')
      if (!storageStore.has(key)) return fallback
      const value = storageStore.get(key)
      // 'stringified' models a firmware whose localStorage serialises everything to strings, the
      // way the web platform's localStorage does.
      return storageMode === 'stringified' ? String(value) : value
    },
    setItem: (key, value) => {
      if (storageThrows) throw new Error('storage unavailable in this context')
      storageStore.set(key, value)
    },
  },
}))

vi.mock('@zos/alarm', () => ({
  REPEAT_ONCE: 'REPEAT_ONCE',
  set: vi.fn((opts) => {
    const id = nextAlarmId++
    alarms.set(id, opts)
    return id
  }),
  cancel: vi.fn((id) => {
    if (!alarms.has(id)) throw new Error(`no such alarm ${id}`)
    alarms.delete(id)
  }),
  getAllAlarms: vi.fn(() => [...alarms.keys()]),
}))

const { scheduleNext, ensureAlarmScheduled, cancelAllAlarms, getAlarmDiagnostics } = await import('../../shared/alarm')
const alarmMgr = await import('@zos/alarm')

beforeEach(() => {
  storageStore.clear()
  storageMode = 'typed'
  storageThrows = false
  alarms = new Map()
  nextAlarmId = 1
  vi.clearAllMocks()
})

describe('scheduleNext', () => {
  it('arms a new alarm and persists the interval', () => {
    const id = scheduleNext(10)
    expect(alarmMgr.set).toHaveBeenCalledWith(
      expect.objectContaining({ delay: 600, repeat_type: 'REPEAT_ONCE', store: true })
    )
    expect(id).toBe(1)
    expect(storageStore.get(LOCAL_STORAGE_KEY_INTERVAL_MINUTES)).toBe(10)
  })

  it('clamps the delay to at least 1 minute', () => {
    scheduleNext(0)
    expect(alarmMgr.set).toHaveBeenCalledWith(expect.objectContaining({ delay: 60 }))
  })

  it('leaves exactly one pending alarm however many times it is called', () => {
    scheduleNext(5)
    scheduleNext(5)
    scheduleNext(5)
    expect(alarms.size).toBe(1)
  })

  it('collapses an existing backlog of leaked alarms down to one', () => {
    for (let i = 0; i < 25; i++) alarms.set(nextAlarmId++, {})
    expect(alarms.size).toBe(25)

    scheduleNext(5)

    expect(alarms.size).toBe(1)
  })

  // The regression test for the actual bug. Under the old implementation this left 2 alarms per
  // call and compounded from there; the Map-based mock could never express it.
  it('does not leak when storage round-trips numbers as strings', () => {
    storageMode = 'stringified'

    scheduleNext(5)
    scheduleNext(5)
    scheduleNext(5)

    expect(alarms.size).toBe(1)
  })

  it('reports 0 when the OS refuses to arm the alarm', () => {
    alarmMgr.set.mockReturnValueOnce(0)
    expect(scheduleNext(5)).toBe(0)
  })

  it('still arms the alarm when storage is unavailable', () => {
    storageThrows = true
    expect(() => scheduleNext(5)).not.toThrow()
    expect(alarms.size).toBe(1)
  })

  it('survives a cancel that throws on an already-consumed alarm', () => {
    alarms.set(99, {})
    alarmMgr.cancel.mockImplementationOnce(() => {
      throw new Error('already consumed')
    })
    expect(() => scheduleNext(5)).not.toThrow()
    expect(alarmMgr.set).toHaveBeenCalled()
  })
})

describe('cancelAllAlarms', () => {
  it('cancels every pending alarm and reports how many', () => {
    for (let i = 0; i < 5; i++) alarms.set(nextAlarmId++, {})
    expect(cancelAllAlarms()).toBe(5)
    expect(alarms.size).toBe(0)
  })

  it('keeps going when one cancel throws', () => {
    for (let i = 0; i < 3; i++) alarms.set(nextAlarmId++, {})
    alarmMgr.cancel.mockImplementationOnce(() => {
      throw new Error('nope')
    })
    expect(cancelAllAlarms()).toBe(2)
  })

  it('returns 0 rather than throwing when the alarm API is unavailable', () => {
    alarmMgr.getAllAlarms.mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    expect(cancelAllAlarms()).toBe(0)
  })
})

describe('ensureAlarmScheduled', () => {
  it('does nothing when exactly one alarm is already pending', () => {
    scheduleNext(5)
    vi.clearAllMocks()
    ensureAlarmScheduled()
    expect(alarmMgr.set).not.toHaveBeenCalled()
  })

  it('reschedules using the stored interval when no alarm is pending', () => {
    storageStore.set(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, 15)
    ensureAlarmScheduled()
    expect(alarmMgr.set).toHaveBeenCalledWith(expect.objectContaining({ delay: 900 }))
  })

  it('reads a stringified stored interval correctly', () => {
    storageStore.set(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, 15)
    storageMode = 'stringified'
    ensureAlarmScheduled()
    expect(alarmMgr.set).toHaveBeenCalledWith(expect.objectContaining({ delay: 900 }))
  })

  it('falls back to the default interval on a fresh install', () => {
    ensureAlarmScheduled()
    expect(alarmMgr.set).toHaveBeenCalledWith(
      expect.objectContaining({ delay: DEFAULT_INTERVAL_MINUTES * 60 })
    )
  })

  it('falls back to the default interval when storage throws', () => {
    storageThrows = true
    ensureAlarmScheduled()
    expect(alarmMgr.set).toHaveBeenCalledWith(
      expect.objectContaining({ delay: DEFAULT_INTERVAL_MINUTES * 60 })
    )
  })

  it('collapses a backlog rather than leaving it in place', () => {
    for (let i = 0; i < 12; i++) alarms.set(nextAlarmId++, {})
    ensureAlarmScheduled()
    expect(alarms.size).toBe(1)
  })
})

describe('getAlarmDiagnostics', () => {
  it('reports the pending count and the storage type', () => {
    scheduleNext(5)
    expect(getAlarmDiagnostics()).toEqual({ pending: 1, storedIntervalType: 'number' })
  })

  it('reports string when storage stringifies', () => {
    scheduleNext(5)
    storageMode = 'stringified'
    expect(getAlarmDiagnostics().storedIntervalType).toBe('string')
  })

  it('degrades instead of throwing when both APIs are unavailable', () => {
    storageThrows = true
    alarmMgr.getAllAlarms.mockImplementationOnce(() => {
      throw new Error('unavailable')
    })
    expect(getAlarmDiagnostics()).toEqual({ pending: -1, storedIntervalType: 'throws' })
  })
})

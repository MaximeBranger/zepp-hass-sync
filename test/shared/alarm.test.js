import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_ALARM_ID, LOCAL_STORAGE_KEY_INTERVAL_MINUTES } from '../../shared/constants'

const storageStore = new Map()
let nextAlarmId
let alarms

vi.mock('@zos/storage', () => ({
  localStorage: {
    getItem: (key, fallback) => (storageStore.has(key) ? storageStore.get(key) : fallback),
    setItem: (key, value) => storageStore.set(key, value),
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

const { scheduleNext, ensureAlarmScheduled } = await import('../../shared/alarm')
const alarmMgr = await import('@zos/alarm')

beforeEach(() => {
  storageStore.clear()
  alarms = new Map()
  nextAlarmId = 1
  vi.clearAllMocks()
})

describe('scheduleNext', () => {
  it('arms a new alarm and persists its id and interval', () => {
    scheduleNext(10)
    expect(alarmMgr.set).toHaveBeenCalledWith(
      expect.objectContaining({ delay: 600, repeat_type: 'REPEAT_ONCE' })
    )
    expect(storageStore.get(LOCAL_STORAGE_KEY_ALARM_ID)).toBe(1)
    expect(storageStore.get(LOCAL_STORAGE_KEY_INTERVAL_MINUTES)).toBe(10)
  })

  it('clamps the delay to at least 1 minute', () => {
    scheduleNext(0)
    expect(alarmMgr.set).toHaveBeenCalledWith(expect.objectContaining({ delay: 60 }))
  })

  it('cancels the previous alarm when it is still pending', () => {
    scheduleNext(5)
    scheduleNext(5)
    expect(alarmMgr.cancel).toHaveBeenCalledWith(1)
    expect(alarms.has(1)).toBe(false)
    expect(alarms.has(2)).toBe(true)
  })

  it('does not attempt to cancel an alarm id that no longer exists', () => {
    storageStore.set(LOCAL_STORAGE_KEY_ALARM_ID, 999)
    expect(() => scheduleNext(5)).not.toThrow()
    expect(alarmMgr.cancel).not.toHaveBeenCalled()
  })
})

describe('ensureAlarmScheduled', () => {
  it('does nothing when the stored alarm is still active', () => {
    scheduleNext(5)
    vi.clearAllMocks()
    ensureAlarmScheduled()
    expect(alarmMgr.set).not.toHaveBeenCalled()
  })

  it('reschedules using the stored interval when the alarm is missing', () => {
    storageStore.set(LOCAL_STORAGE_KEY_ALARM_ID, 42)
    storageStore.set(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, 15)
    ensureAlarmScheduled()
    expect(alarmMgr.set).toHaveBeenCalledWith(expect.objectContaining({ delay: 900 }))
  })

  it('falls back to the default interval on a fresh install', () => {
    ensureAlarmScheduled()
    expect(alarmMgr.set).toHaveBeenCalledWith(
      expect.objectContaining({ delay: DEFAULT_INTERVAL_MINUTES * 60 })
    )
  })
})

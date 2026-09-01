import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_SERVICE_FILE } from '../../shared/constants'

const set = vi.fn()
const cancel = vi.fn()
const getAllAlarms = vi.fn()

vi.mock('@zos/alarm', () => ({
  REPEAT_ONCE: 1,
  set: (...args) => set(...args),
  cancel: (...args) => cancel(...args),
  getAllAlarms: (...args) => getAllAlarms(...args),
}))

const { armNextAlarm, cancelAllAlarms, scheduleSyncAlarm } = await import('../../shared/alarm')

beforeEach(() => {
  vi.clearAllMocks()
  getAllAlarms.mockReturnValue([])
  set.mockReturnValue(42)
})

describe('cancelAllAlarms', () => {
  it('cancels every alarm the mini program owns', () => {
    getAllAlarms.mockReturnValue([7, 8, 9])

    expect(cancelAllAlarms()).toBe(3)
    expect(cancel).toHaveBeenCalledTimes(3)
    expect(cancel.mock.calls.map(([id]) => id)).toEqual([7, 8, 9])
  })

  it('reports zero when there are none', () => {
    expect(cancelAllAlarms()).toBe(0)
    expect(cancel).not.toHaveBeenCalled()
  })

  // One alarm that refuses to cancel must not strand the rest — leaving them is how a backlog forms.
  it('keeps going when one cancellation throws', () => {
    getAllAlarms.mockReturnValue([1, 2, 3])
    cancel.mockImplementationOnce(() => {
      throw new Error('nope')
    })

    expect(cancelAllAlarms()).toBe(2)
    expect(cancel).toHaveBeenCalledTimes(3)
  })

  // getAllAlarms is gated on the alarm permission and can fail outright.
  it('reports zero instead of throwing when the API fails', () => {
    getAllAlarms.mockImplementation(() => {
      throw new Error('no permission')
    })

    expect(cancelAllAlarms()).toBe(0)
  })
})

describe('armNextAlarm', () => {
  // The alarm the service arms for itself. A one-shot, because `repeat_period` is documented only
  // through a worked example that contradicts the prose beside it — read one way, a one-minute
  // interval becomes `repeat_period: 0`, and on device that alarm never fired at all. A one-shot has
  // no configuration left to get wrong.
  it('arms a single non-repeating alarm at the requested delay', () => {
    expect(armNextAlarm(5)).toBe(42)

    expect(set).toHaveBeenCalledTimes(1)
    const option = set.mock.calls[0][0]
    expect(option.url).toBe(APP_SERVICE_FILE)
    expect(option.repeat_type).toBe(1)
    expect(option.delay).toBe(5 * 60)
    expect(option.repeat_period).toBeUndefined()
  })

  // The shortest interval the app allows, and the one that broke the repeating alarm.
  it('handles a one-minute interval', () => {
    armNextAlarm(1)
    expect(set.mock.calls[0][0].delay).toBe(60)
  })

  // Without this the chain breaks at the first reboot, silently, and only reopening the app revives
  // it.
  it('persists across reboots', () => {
    armNextAlarm(5)
    expect(set.mock.calls[0][0].store).toBe(true)
  })

  // The service has no storage: the pace it must arm the *next* alarm at can only reach it through
  // the param of the alarm that woke it. Losing it would silently collapse the interval to the
  // default, forever.
  it('carries the trigger and the interval forward in the param', async () => {
    const { decodeServiceParam, SERVICE_TRIGGER_ALARM } = await import('../../shared/constants')

    armNextAlarm(23)

    expect(decodeServiceParam(set.mock.calls[0][0].param)).toEqual({
      trigger: SERVICE_TRIGGER_ALARM,
      intervalMinutes: 23,
    })
  })

  // It runs in the App Service VM, where an escaping error ends the run — and the run is the thing
  // arming the next one.
  it('reports id 0 instead of throwing when setting fails', () => {
    set.mockImplementation(() => {
      throw new Error('no permission')
    })
    expect(armNextAlarm(5)).toBe(0)
  })

  // Sweeping is the page's job. Doing it here would spend budget the service may not have, and
  // there is nothing to sweep anyway: the alarm that woke this run was consumed by firing.
  it('does not sweep', () => {
    getAllAlarms.mockReturnValue([1, 2])
    armNextAlarm(5)
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('scheduleSyncAlarm', () => {
  // The regression that once buried the watch: set() adds an alarm rather than replacing one, and
  // this runs on every app open. Without the sweep first, alarms accumulate indefinitely.
  it('clears existing alarms before arming a new one', () => {
    getAllAlarms.mockReturnValue([1, 2])
    const calls = []
    cancel.mockImplementation(() => calls.push('cancel'))
    set.mockImplementation(() => {
      calls.push('set')
      return 42
    })

    expect(scheduleSyncAlarm(5)).toEqual({ id: 42, cancelled: 2 })
    expect(calls).toEqual(['cancel', 'cancel', 'set'])
  })

  // Pointing the alarm at anything but the syncing service has been tried twice and failed twice:
  // at a page it launches the UI, and at a second service that calls start() it returns 255.
  it('wakes the syncing service', () => {
    scheduleSyncAlarm(5)

    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0].url).toBe(APP_SERVICE_FILE)
  })

  it('reports id 0 instead of throwing when setting fails', () => {
    getAllAlarms.mockReturnValue([1])
    set.mockImplementation(() => {
      throw new Error('no permission')
    })

    expect(scheduleSyncAlarm(5)).toEqual({ id: 0, cancelled: 1 })
  })
})

// A sync's trigger decides whether the phone counts it as unattended, which is the only number that
// answers whether background sync works — the total climbs on every app open and proves nothing.
describe('trigger tagging', () => {
  it('counts an alarm-driven run as unattended, and an app open as not', async () => {
    const { isUnattendedTrigger, SERVICE_TRIGGER_PAGE, SERVICE_TRIGGER_ALARM } = await import(
      '../../shared/constants'
    )

    expect(isUnattendedTrigger(SERVICE_TRIGGER_ALARM)).toBe(true)
    // The app being opened must never be mistaken for background sync working; that is the whole
    // point of counting them apart.
    expect(isUnattendedTrigger(SERVICE_TRIGGER_PAGE)).toBe(false)
    expect(isUnattendedTrigger(undefined)).toBe(false)
  })
})

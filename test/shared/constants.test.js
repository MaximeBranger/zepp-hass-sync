import { describe, expect, it } from 'vitest'
import {
  clampIntervalMinutes,
  decodeServiceParam,
  encodeServiceParam,
  DEFAULT_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  SERVICE_TRIGGER_PAGE,
  SERVICE_TRIGGER_ALARM,
} from '../../shared/constants'

describe('clampIntervalMinutes', () => {
  it('passes through a value already in range', () => {
    expect(clampIntervalMinutes(10)).toBe(10)
  })

  it('parses numeric strings', () => {
    expect(clampIntervalMinutes('10')).toBe(10)
  })

  it('clamps values above the max', () => {
    expect(clampIntervalMinutes(MAX_INTERVAL_MINUTES + 50)).toBe(MAX_INTERVAL_MINUTES)
  })

  it('clamps finite non-positive values to the min instead of the default', () => {
    expect(clampIntervalMinutes(0)).toBe(MIN_INTERVAL_MINUTES)
    expect(clampIntervalMinutes(-5)).toBe(MIN_INTERVAL_MINUTES)
  })

  it('falls back to the default for non-finite input', () => {
    expect(clampIntervalMinutes('garbage')).toBe(DEFAULT_INTERVAL_MINUTES)
    expect(clampIntervalMinutes(undefined)).toBe(DEFAULT_INTERVAL_MINUTES)
    expect(clampIntervalMinutes(NaN)).toBe(DEFAULT_INTERVAL_MINUTES)
  })
})

// The App Service's only inbound channel. It can read neither watch-side storage nor the phone's
// settings, so what it knows about its own pace and about what started it arrives entirely through
// the single string `start()` and the alarm's `set()` are allowed to pass. A codec failure here is
// silent on device: the service simply syncs at the wrong pace, or reports every sync as if the app
// had been opened.
describe('service param codec', () => {
  it('round-trips a trigger and an interval', () => {
    expect(decodeServiceParam(encodeServiceParam(SERVICE_TRIGGER_PAGE, 30))).toEqual({
      trigger: SERVICE_TRIGGER_PAGE,
      intervalMinutes: 30,
    })
    expect(decodeServiceParam(encodeServiceParam(SERVICE_TRIGGER_ALARM, 1))).toEqual({
      trigger: SERVICE_TRIGGER_ALARM,
      intervalMinutes: 1,
    })
  })

  it('clamps an out-of-range interval on the way in and on the way out', () => {
    expect(decodeServiceParam(encodeServiceParam(SERVICE_TRIGGER_PAGE, 9999)).intervalMinutes).toBe(
      MAX_INTERVAL_MINUTES,
    )
    expect(decodeServiceParam(SERVICE_TRIGGER_PAGE + ':0').intervalMinutes).toBe(MIN_INTERVAL_MINUTES)
  })

  // A service started by an older build, or woken by an alarm restored across a reboot with a param
  // this build doesn't recognise, must still sync at a sane pace rather than not at all.
  it('falls back to a page trigger at the default interval for anything unparseable', () => {
    for (const param of [undefined, null, '', 42, {}]) {
      expect(decodeServiceParam(param)).toEqual({
        trigger: SERVICE_TRIGGER_PAGE,
        intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      })
    }
  })

  // The shape the previous build passed: a bare trigger with no interval appended.
  it('reads a legacy bare trigger as itself at the default interval', () => {
    expect(decodeServiceParam('page')).toEqual({
      trigger: SERVICE_TRIGGER_PAGE,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    })
  })

  it('defaults a missing interval rather than encoding NaN', () => {
    expect(decodeServiceParam(encodeServiceParam(SERVICE_TRIGGER_PAGE, undefined))).toEqual({
      trigger: SERVICE_TRIGGER_PAGE,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    })
  })
})

import { describe, expect, it } from 'vitest'
import { bodyTemperatureReading, maxHeartRateToday, stressValue } from '../../app-service/sensor-values'

describe('stressValue', () => {
  it('unwraps the documented { value, time } record', () => {
    expect(stressValue({ value: 42, time: 1700000000 })).toBe(42)
  })

  it('accepts a bare number', () => {
    expect(stressValue(37)).toBe(37)
  })

  it('returns undefined when there is no reading', () => {
    expect(stressValue(undefined)).toBeUndefined()
    expect(stressValue(null)).toBeUndefined()
    expect(stressValue({})).toBeUndefined()
  })
})

describe('maxHeartRateToday', () => {
  it('reads hr_value out of the daily summary', () => {
    expect(maxHeartRateToday({ maximum: { hr_value: 148, time: 1700000000 } }, null)).toBe(148)
  })

  it('accepts a summary whose maximum is already a number', () => {
    expect(maxHeartRateToday({ maximum: 148 }, null)).toBe(148)
  })

  it('falls back to the highest of the day samples when the summary is missing', () => {
    expect(maxHeartRateToday(null, [0, 62, 0, 131, 88])).toBe(131)
  })

  it('ignores the 0 placeholder for minutes with no reading', () => {
    expect(maxHeartRateToday(null, [0, 0, 0])).toBeUndefined()
  })

  it('returns undefined with neither summary nor samples', () => {
    expect(maxHeartRateToday(null, null)).toBeUndefined()
    expect(maxHeartRateToday({}, [])).toBeUndefined()
  })
})

describe('bodyTemperatureReading', () => {
  it('reads the documented { current, time } record', () => {
    expect(bodyTemperatureReading({ current: 36.6, time: 1700000000 }, null)).toEqual({
      value: 36.6,
      time: 1700000000,
    })
  })

  it('accepts a record keyed value, as other sensors are', () => {
    expect(bodyTemperatureReading({ value: 36.2, time: 1700000000 }, null)).toEqual({
      value: 36.2,
      time: 1700000000,
    })
  })

  it('accepts a bare number', () => {
    expect(bodyTemperatureReading(35.9, null)).toEqual({ value: 35.9, time: undefined })
  })

  it('falls back to the last measured sample of the day, without a timestamp', () => {
    expect(bodyTemperatureReading(null, [-1000, 35.1, 35.4, -1000, -1000])).toEqual({
      value: 35.4,
      time: undefined,
    })
  })

  it('treats the -1000 sentinel as no measurement', () => {
    expect(bodyTemperatureReading({ current: -1000, time: 0 }, [-1000, -1000])).toBeUndefined()
  })

  it('returns undefined when the sensor is unsupported', () => {
    expect(bodyTemperatureReading(null, null)).toBeUndefined()
    expect(bodyTemperatureReading({}, [])).toBeUndefined()
  })
})

import { describe, expect, it } from 'vitest'
import { formatForZepp2Hass } from '../../app-side/format'

describe('formatForZepp2Hass', () => {
  it('maps a fully populated payload to the zepp2hass shape', () => {
    const payload = {
      record_time: 1700000000,
      screen: { status: 'on', aodMode: false, light: 120 },
      device: {
        deviceName: 'GTS 4',
        width: 336,
        height: 336,
        screenShape: 'round',
        keyNumber: 1,
        keyType: 'physical',
        deviceSource: 1,
        deviceColor: 'black',
        uuid: 'abc-123',
      },
      user: { nickName: 'Max', age: 30, height: 180, weight: 75, gender: 'male', region: 'FR' },
      battery: 82,
      bodyTemperature: { value: 36.6, time: 1700000000 },
      stress: { current: 20, lastWeek: [10, 20, 30] },
      bloodOxygen: [{ value: 98, time: 1700000000 }],
      steps: { current: 4000, target: 8000 },
      calorie: { current: 300, target: 2000 },
      fatBurning: { current: 20, target: 30 },
      stand: { current: 5, target: 12 },
      distance: 3200,
      heartRate: { last: 70, resting: 60, maxToday: 140 },
      sleep: {
        info: { score: 82, startTime: 1380, endTime: 420, deepTime: 90, totalTime: 480 },
        status: 1,
        stageConstants: { WAKE_STAGE: 7, REM_STAGE: 8, LIGHT_STAGE: 9, DEEP_STAGE: 10 },
        stage: [{ model: 9, start: 1380, stop: 1400 }],
        nap: [{ length: 20, start: 800, stop: 820 }],
      },
      pai: { week: 100, day: 20, lastWeek: 90 },
      workout: { status: 'idle', history: [{ id: 1 }] },
      isWearing: true,
    }

    expect(formatForZepp2Hass(payload)).toEqual({
      record_time: 1700000000,
      screen: { status: 'on', aod_mode: false, light: 120 },
      device: {
        deviceName: 'GTS 4',
        width: 336,
        height: 336,
        screenShape: 'round',
        keyNumber: 1,
        keyType: 'physical',
        deviceSource: 1,
        deviceColor: 'black',
        uuid: 'abc-123',
      },
      user: { nickName: 'Max', age: 30, height: 180, weight: 75, gender: 'male', region: 'FR' },
      battery: { current: 82 },
      body_temperature: { current: { value: 36.6, time: 1700000000 } },
      stress: { current: { value: 20 }, last_week: [10, 20, 30] },
      blood_oxygen: { few_hours: [{ value: 98, time: 1700000000 }] },
      steps: { current: 4000, target: 8000 },
      calorie: { current: 300, target: 2000 },
      fat_burning: { current: 20, target: 30 },
      stands: { current: 5, target: 12 },
      distance: { current: 3200 },
      heart_rate: { last: 70, resting: 60, summary: { maximum: { hr_value: 140 } } },
      sleep: {
        info: { score: 82, startTime: 1380, endTime: 420, deepTime: 90, totalTime: 480 },
        status: 1,
        stg_list: { WAKE_STAGE: 7, REM_STAGE: 8, LIGHT_STAGE: 9, DEEP_STAGE: 10 },
        stage: [{ model: 9, start: 1380, stop: 1400 }],
        nap: [{ length: 20, start: 800, stop: 820 }],
      },
      pai: { week: 100, day: 20, last_week: 90 },
      workout: { status: 'idle', history: [{ id: 1 }] },
      is_wearing: true,
    })
  })

  it('omits body_temperature when not present in the payload', () => {
    const result = formatForZepp2Hass({})
    expect(result.body_temperature).toBeUndefined()
  })

  it('defaults blood_oxygen and workout history to empty arrays when missing', () => {
    const result = formatForZepp2Hass({})
    expect(result.blood_oxygen).toEqual({ few_hours: [] })
    expect(result.workout.history).toEqual([])
  })

  it('handles an empty payload without throwing, filling nested objects with undefined fields', () => {
    const result = formatForZepp2Hass()
    expect(result.record_time).toBeUndefined()
    expect(result.screen).toEqual({ status: undefined, aod_mode: undefined, light: undefined })
    expect(result.battery).toEqual({ current: undefined })
  })

  it('maps the leaf values zepp2hass reads for stress, max heart rate and sleep score', () => {
    const result = formatForZepp2Hass({
      stress: { current: 31 },
      heartRate: { maxToday: 152 },
      sleep: { info: { score: 74 } },
      screen: { light: 8 },
    })

    expect(result.stress.current.value).toBe(31)
    expect(result.heart_rate.summary.maximum.hr_value).toBe(152)
    expect(result.sleep.info.score).toBe(74)
    expect(result.screen.light).toBe(8)
  })

  it('handles a null payload the same as an empty object', () => {
    expect(formatForZepp2Hass(null)).toEqual(formatForZepp2Hass({}))
  })
})

import {
  Battery,
  Step,
  Calorie,
  HeartRate,
  Pai,
  Distance,
  Stand,
  FatBurning,
  BloodOxygen,
  Stress,
  Wear,
  Sleep,
  BodyTemperature,
  Workout,
  Screen,
} from '@zos/sensor'
import { getProfile } from '@zos/user'
import { getDeviceInfo } from '@zos/device'

// How many hours of SpO2 history to attach to each payload.
const SPO2_HISTORY_HOURS = 6

// Wrap sensor reads that may throw (unsupported on this firmware) or return
// undefined (no data yet) so a single bad sensor can't abort the whole payload.
function safe(fn, fallback) {
  try {
    const value = fn()
    return value === undefined || value === null ? fallback : value
  } catch (error) {
    return fallback
  }
}

// Fields with no API in the installed Zepp OS 3.0 SDK (verified by grepping the
// full @zeppos/device-types typings) are omitted entirely rather than faked:
// battery.is_charging, workout.history[].sportType, most of device.* (only the
// fields read below exist), user.birth/appVersion/appPlatform/uuid, screen.light
// (typed but @version 3.6, above GTR4's 3.0/3.5 target). See SPECIFICATIONS.md §7.
export function buildPayload() {
  const battery = new Battery()
  const step = new Step()
  const calorie = new Calorie()
  const heartRate = new HeartRate()
  const pai = new Pai()
  const distance = new Distance()
  const stand = new Stand()
  const fatBurning = new FatBurning()
  const bloodOxygen = new BloodOxygen()
  const stress = new Stress()
  const wear = new Wear()
  const sleep = new Sleep()
  const bodyTemperature = new BodyTemperature()
  const workout = new Workout()
  const screen = new Screen()

  const profile = safe(() => getProfile(), {})
  const device = safe(() => getDeviceInfo(), {})
  const dailyHrSummary = safe(() => heartRate.getDailySummary(), null)
  const sleepInfo = safe(() => sleep.getInfo(), null)
  const bodyTemp = safe(() => bodyTemperature.getCurrent(), null)
  const workoutStatus = safe(() => workout.getStatus(), null)

  return {
    record_time: Math.floor(Date.now() / 1000),

    screen: {
      status: safe(() => screen.getStatus(), undefined),
      aod_mode: safe(() => screen.getAodMode(), undefined),
    },

    device: {
      deviceName: device.deviceName,
      width: device.width,
      height: device.height,
      screenShape: device.screenShape,
      keyNumber: device.keyNumber,
      deviceSource: device.deviceSource,
      keyType: device.keyType,
      deviceColor: device.deviceColor,
      uuid: device.uuid,
    },

    user: {
      nickName: profile.nickName,
      age: profile.age,
      height: profile.height,
      weight: profile.weight,
      gender: profile.gender,
      region: profile.region,
    },

    battery: {
      current: safe(() => battery.getCurrent(), undefined),
    },

    body_temperature: bodyTemp
      ? { current: { value: bodyTemp.current, time: bodyTemp.time } }
      : undefined,

    stress: {
      current: safe(() => stress.getCurrent(), undefined),
      last_week: safe(() => stress.getLastWeek(), undefined),
    },

    blood_oxygen: {
      few_hours: safe(() => bloodOxygen.getLastFewHour(SPO2_HISTORY_HOURS), []),
    },

    steps: {
      current: safe(() => step.getCurrent(), undefined),
      target: safe(() => step.getTarget(), undefined),
    },
    calorie: {
      current: safe(() => calorie.getCurrent(), undefined),
      target: safe(() => calorie.getTarget(), undefined),
    },
    fat_burning: {
      current: safe(() => fatBurning.getCurrent(), undefined),
      target: safe(() => fatBurning.getTarget(), undefined),
    },
    stands: {
      current: safe(() => stand.getCurrent(), undefined),
      target: safe(() => stand.getTarget(), undefined),
    },
    distance: {
      current: safe(() => distance.getCurrent(), undefined),
    },

    heart_rate: {
      last: safe(() => heartRate.getLast(), undefined),
      resting: safe(() => heartRate.getResting(), undefined),
      summary: dailyHrSummary ? { maximum: dailyHrSummary.maximum } : undefined,
    },

    sleep: {
      info: sleepInfo
        ? {
            startTime: sleepInfo.startTime,
            endTime: sleepInfo.endTime,
            deepTime: sleepInfo.deepTime,
            totalTime: sleepInfo.totalTime,
          }
        : undefined,
      status: safe(() => sleep.getSleepingStatus(), undefined),
    },

    pai: {
      week: safe(() => pai.getTotal(), undefined),
      day: safe(() => pai.getToday(), undefined),
      last_week: safe(() => pai.getLastWeek(), undefined),
    },

    workout: {
      status: workoutStatus || undefined,
      history: safe(() => workout.getHistory(), []),
    },

    // 0: not worn, 1: worn/stationary, 2: worn/in motion, 3: uncertain.
    is_wearing: safe(() => wear.getStatus(), undefined),
  }
}

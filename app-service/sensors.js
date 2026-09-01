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
import { bodyTemperatureReading, maxHeartRateToday, stressValue } from './sensor-values'

// How many hours of SpO2 history to attach to each payload.
const SPO2_HISTORY_HOURS = 6

// How many of the most recent workouts to attach. `workout.getHistory()` takes no arguments and
// returns the device's *entire* history, so the payload silently grows with how long the watch
// has been worn — a watch owned for years sends a materially bigger payload than one set up last
// month, running the same build. Everything else in the payload is naturally bounded (a week of
// samples, a few hours of SpO2, single current values); this was the only unbounded field.
//
// It matters because `sendHmProtocol()` fragments the payload into a synchronous burst of BLE
// frames with no pacing or backpressure, two buffer allocations per frame, from a memory-
// constrained background context. Keeping the newest N preserves what the webhook consumer
// actually uses while making the cost independent of device age.
const WORKOUT_HISTORY_LIMIT = 20

// Newest entries, oldest-to-newest order preserved. `getHistory()` is documented to return
// `{ startTime, duration }` records but the ordering is not specified, so sort explicitly rather
// than assuming which end the recent ones are at.
function recentWorkouts(history) {
  if (!history || !history.length) return []
  const sorted = history.slice().sort((a, b) => (a.startTime || 0) - (b.startTime || 0))
  return sorted.length <= WORKOUT_HISTORY_LIMIT ? sorted : sorted.slice(-WORKOUT_HISTORY_LIMIT)
}

// Wrap sensor reads that may throw (unsupported on this firmware) or return
// undefined (no data yet) so a single bad sensor can't abort the whole payload.
function safe(fn, fallback) {
  try {
    const value = fn()
    return value === undefined || value === null ? fallback : value
  } catch {
    return fallback
  }
}

// Raw values read straight off the watch's sensors — no zepp2hass shaping here,
// that happens phone-side in app-side/format.js. The only exception is
// sensor-values.js, which flattens the readings whose record shape varies between
// firmwares so format.js can rely on a plain number. Fields with no API on Zepp OS 3.0
// (charging state, workout sportType, most of device.*, user.birth/appVersion/
// appPlatform/uuid) are simply absent.
export function readSensors() {
  // Each sensor is constructed independently so one failing constructor can't
  // take down the whole payload.
  const battery = safe(() => new Battery(), null)
  const step = safe(() => new Step(), null)
  const calorie = safe(() => new Calorie(), null)
  const heartRate = safe(() => new HeartRate(), null)
  const pai = safe(() => new Pai(), null)
  const distance = safe(() => new Distance(), null)
  const stand = safe(() => new Stand(), null)
  const fatBurning = safe(() => new FatBurning(), null)
  const bloodOxygen = safe(() => new BloodOxygen(), null)
  const stress = safe(() => new Stress(), null)
  const wear = safe(() => new Wear(), null)
  const sleep = safe(() => new Sleep(), null)
  const bodyTemperature = safe(() => new BodyTemperature(), null)
  const workout = safe(() => new Workout(), null)
  const screen = safe(() => new Screen(), null)

  const profile = safe(() => getProfile(), {})
  const device = safe(() => getDeviceInfo(), {})
  const dailyHrSummary = safe(() => heartRate.getDailySummary(), null)
  const sleepInfo = safe(() => sleep.getInfo(), null)
  const workoutStatus = safe(() => workout.getStatus(), null)
  const bodyTemp = bodyTemperatureReading(
    safe(() => bodyTemperature.getCurrent(), null),
    safe(() => bodyTemperature.getToday(), null),
  )

  return {
    record_time: Math.floor(Date.now() / 1000),

    screen: {
      status: safe(() => screen.getStatus(), undefined),
      aodMode: safe(() => screen.getAodMode(), undefined),
      // Ambient light in lux; zepp2hass surfaces it as "screen brightness".
      // Zepp OS 3.6+ only, so absent on older firmware.
      light: safe(() => screen.getLight(), undefined),
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

    battery: safe(() => battery.getCurrent(), undefined),

    bodyTemperature: bodyTemp,

    stress: {
      current: stressValue(safe(() => stress.getCurrent(), undefined)),
      lastWeek: safe(() => stress.getLastWeek(), undefined),
    },

    bloodOxygen: safe(() => bloodOxygen.getLastFewHour(SPO2_HISTORY_HOURS), []),

    steps: {
      current: safe(() => step.getCurrent(), undefined),
      target: safe(() => step.getTarget(), undefined),
    },
    calorie: {
      current: safe(() => calorie.getCurrent(), undefined),
      target: safe(() => calorie.getTarget(), undefined),
    },
    fatBurning: {
      current: safe(() => fatBurning.getCurrent(), undefined),
      target: safe(() => fatBurning.getTarget(), undefined),
    },
    stand: {
      current: safe(() => stand.getCurrent(), undefined),
      target: safe(() => stand.getTarget(), undefined),
    },
    distance: safe(() => distance.getCurrent(), undefined),

    heartRate: {
      last: safe(() => heartRate.getLast(), undefined),
      resting: safe(() => heartRate.getResting(), undefined),
      maxToday: maxHeartRateToday(
        dailyHrSummary,
        safe(() => heartRate.getToday(), null),
      ),
    },

    sleep: {
      info: sleepInfo
        ? {
            score: sleepInfo.score,
            startTime: sleepInfo.startTime,
            endTime: sleepInfo.endTime,
            deepTime: sleepInfo.deepTime,
            totalTime: sleepInfo.totalTime,
          }
        : undefined,
      status: safe(() => sleep.getSleepingStatus(), undefined),
      // zepp2hass reverse-maps the stage constants to name the phases it shows as
      // attributes on the sleep score sensor, so stages are useless without them.
      stageConstants: safe(() => sleep.getStageConstantObj(), undefined),
      stage: safe(() => sleep.getStage(), undefined),
      nap: safe(() => sleep.getNap(), undefined),
    },

    pai: {
      week: safe(() => pai.getTotal(), undefined),
      day: safe(() => pai.getToday(), undefined),
      lastWeek: safe(() => pai.getLastWeek(), undefined),
    },

    workout: {
      status: workoutStatus || undefined,
      history: safe(() => recentWorkouts(workout.getHistory()), []),
    },

    // 0: not worn, 1: worn/stationary, 2: worn/in motion, 3: uncertain.
    isWearing: safe(() => wear.getStatus(), undefined),
  }
}

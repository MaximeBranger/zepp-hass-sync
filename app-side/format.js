// Maps our raw watch->phone payload (page/sensors.js `readSensors()`) to the JSON
// shape zepp2hass expects (custom_components/zepp2hass/sensors/*.py — see
// SPECIFICATIONS.md §4). Fields with no API on Zepp OS 3.0 (battery.is_charging,
// workout.history[].sportType, most of device.*, user.birth/appVersion/
// appPlatform/uuid, trigger.*, last_error) are omitted rather than faked.
export function formatForZepp2Hass(payload) {
  const p = payload || {}
  const screen = p.screen || {}
  const device = p.device || {}
  const user = p.user || {}
  const stress = p.stress || {}
  const steps = p.steps || {}
  const calorie = p.calorie || {}
  const fatBurning = p.fatBurning || {}
  const stand = p.stand || {}
  const heartRate = p.heartRate || {}
  const sleep = p.sleep || {}
  const pai = p.pai || {}
  const workout = p.workout || {}

  return {
    record_time: p.record_time,

    screen: {
      status: screen.status,
      aod_mode: screen.aodMode,
    },

    device: {
      deviceName: device.deviceName,
      width: device.width,
      height: device.height,
      screenShape: device.screenShape,
      keyNumber: device.keyNumber,
      keyType: device.keyType,
      deviceSource: device.deviceSource,
      deviceColor: device.deviceColor,
      uuid: device.uuid,
    },

    user: {
      nickName: user.nickName,
      age: user.age,
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      region: user.region,
    },

    battery: {
      current: p.battery,
    },

    body_temperature: p.bodyTemperature
      ? { current: { value: p.bodyTemperature.value, time: p.bodyTemperature.time } }
      : undefined,

    stress: {
      current: { value: stress.current },
      last_week: stress.lastWeek,
    },

    blood_oxygen: {
      few_hours: p.bloodOxygen || [],
    },

    steps: {
      current: steps.current,
      target: steps.target,
    },
    calorie: {
      current: calorie.current,
      target: calorie.target,
    },
    fat_burning: {
      current: fatBurning.current,
      target: fatBurning.target,
    },
    stands: {
      current: stand.current,
      target: stand.target,
    },
    distance: {
      current: p.distance,
    },

    heart_rate: {
      last: heartRate.last,
      resting: heartRate.resting,
      summary: {
        maximum: { hr_value: heartRate.maxToday },
      },
    },

    sleep: {
      info: sleep.info,
      status: sleep.status,
    },

    pai: {
      week: pai.week,
      day: pai.day,
      last_week: pai.lastWeek,
    },

    workout: {
      status: workout.status,
      history: workout.history || [],
    },

    is_wearing: p.isWearing,
  }
}

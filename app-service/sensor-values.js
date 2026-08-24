// Normalizers for sensor readings whose shape varies between firmwares, kept
// free of any `@zos` import so they stay unit-testable off-device.
//
// Zepp OS returns some readings as `{ value, time }`-style records and others as
// bare numbers, and reports "no measurement yet" with a sentinel rather than
// omitting the field. zepp2hass reads leaf numbers (`stress.current.value`,
// `heart_rate.summary.maximum.hr_value`, `body_temperature.current.value`), so a
// record handed through where a number is expected ends up nested one level too
// deep and the Home Assistant sensor never populates.

// BodyTemperature reports slots with no measurement as -1000 (degrees Celsius).
const NO_TEMPERATURE = -1000

function isNumber(value) {
  return typeof value === 'number' && isFinite(value)
}

// `Stress.getCurrent()` documents `{ value, time }`, but accept a bare number too.
export function stressValue(current) {
  if (isNumber(current)) return current
  if (current && isNumber(current.value)) return current.value
  return undefined
}

// `HeartRate.getDailySummary()` documents `{ maximum: { hr_value, time } }`. Falls
// back to the day's per-minute samples when the summary is missing or empty, which
// is what happens on firmwares that don't implement getDailySummary.
export function maxHeartRateToday(dailySummary, todaySamples) {
  const maximum = dailySummary && dailySummary.maximum
  if (isNumber(maximum)) return maximum
  if (maximum && isNumber(maximum.hr_value)) return maximum.hr_value

  if (!Array.isArray(todaySamples)) return undefined
  let max
  for (const sample of todaySamples) {
    // 0 marks a minute with no reading rather than a heart rate of zero.
    if (isNumber(sample) && sample > 0 && (max === undefined || sample > max)) max = sample
  }
  return max
}

// `BodyTemperature.getCurrent()` documents `{ current, time }`. Falls back to the
// most recent valid sample of the day when the latest reading is absent or is the
// -1000 "not measured" sentinel; that path carries no timestamp, since getToday()
// exposes only five-minute buckets and we'd be inventing one.
export function bodyTemperatureReading(current, todaySamples) {
  if (isNumber(current) && current > NO_TEMPERATURE) return { value: current, time: undefined }
  if (current) {
    // `current` on the record, `value` on firmwares that mirror the other sensors.
    const value = isNumber(current.current) ? current.current : current.value
    if (isNumber(value) && value > NO_TEMPERATURE) {
      return { value, time: isNumber(current.time) ? current.time : undefined }
    }
  }

  if (!Array.isArray(todaySamples)) return undefined
  for (let i = todaySamples.length - 1; i >= 0; i--) {
    const sample = todaySamples[i]
    if (isNumber(sample) && sample > NO_TEMPERATURE) return { value: sample, time: undefined }
  }
  return undefined
}

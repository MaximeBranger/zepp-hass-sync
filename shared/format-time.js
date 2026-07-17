// No device-only APIs here — usable from both the watch page and the phone settings page.
// Hand-rolled instead of Intl/toLocaleString, which isn't reliably available in the watch's
// JS engine.
function pad2(n) {
  return n < 10 ? '0' + n : String(n)
}

// epochSeconds -> "17/07 14:32"
export function formatDateTime(epochSeconds) {
  const d = new Date(epochSeconds * 1000)
  const day = pad2(d.getDate())
  const month = pad2(d.getMonth() + 1)
  const hours = pad2(d.getHours())
  const minutes = pad2(d.getMinutes())
  return `${day}/${month} ${hours}:${minutes}`
}

// Watch-side only (uses @zos/alarm + @zos/storage). Shared between app.js, app-service/index.js,
// and page/index.js so the background sync alarm is scheduled the exact same way regardless of
// what triggered the (re)schedule — an app open, a background wake, or a phone-confirmed interval
// change from the watch's own +/- buttons.
import * as alarmMgr from '@zos/alarm'
import { localStorage as deviceStorage } from '@zos/storage'
import { APP_SERVICE_FILE, DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_ALARM_ID, LOCAL_STORAGE_KEY_INTERVAL_MINUTES } from './constants'

// Cancels any previous alarm and arms the next one `intervalMinutes` from now, persisting both
// the new alarm id and the interval used (so the next wake, and the self-heal check below, both
// see the current value).
export function scheduleNext(intervalMinutes) {
  const oldAlarmId = deviceStorage.getItem(LOCAL_STORAGE_KEY_ALARM_ID, 0)
  if (oldAlarmId) {
    alarmMgr.cancel(oldAlarmId)
  }
  const newAlarmId = alarmMgr.set({
    url: APP_SERVICE_FILE,
    delay: Math.max(1, intervalMinutes) * 60,
    repeat_type: alarmMgr.REPEAT_ONCE,
    store: true,
  })
  deviceStorage.setItem(LOCAL_STORAGE_KEY_ALARM_ID, newAlarmId)
  deviceStorage.setItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, intervalMinutes)
}

// Re-arms the background sync alarm if it's missing or already consumed. A stored alarmId alone
// doesn't mean an alarm is still pending — REPEAT_ONCE alarms are consumed once fired, and if the
// very first alarm ever fails to fire, storage would otherwise keep pointing at a dead id forever,
// permanently stopping sync. Meant to run on every app open (not just first install) so it
// self-heals.
export function ensureAlarmScheduled() {
  const alarmId = deviceStorage.getItem(LOCAL_STORAGE_KEY_ALARM_ID, 0)
  const stillActive = alarmId && alarmMgr.getAllAlarms().includes(alarmId)
  if (stillActive) return

  const intervalMinutes = deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
  scheduleNext(intervalMinutes)
}

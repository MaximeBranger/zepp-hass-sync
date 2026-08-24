// Watch-side only (uses @zos/alarm + @zos/storage). Shared between app.js, app-service/index.js,
// and page/index.js so the background sync alarm is scheduled the exact same way regardless of
// what triggered the (re)schedule — an app open, a background wake, or a phone-confirmed interval
// change from the watch's own +/- buttons.
//
// The app must own exactly one pending alarm at any time. Tracking that by remembering a single
// alarm id in storage turned out to be unsound in two independent ways:
//
//   1. `getAllAlarms()` returns `number[]`, but `localStorage.getItem()` guarantees nothing about
//      the type it returns. On a firmware that round-trips the id as a string, the old
//      `getAllAlarms().includes(storedId)` guard was always false (strict equality), so the
//      previous alarm was never cancelled.
//   2. Three call sites arm alarms (app.js on open, page/index.js on interval change,
//      app-service/index.js on wake) but shared one `alarmId` slot. Any interleaving — a
//      background wake while the page is open — had both write the slot, orphaning whichever
//      alarm lost the race with no handle left to cancel it.
//
// Either way an alarm leaks; and since every leaked alarm still fires, and every firing arms more,
// the leak compounds geometrically until the watch is spending all its time launching services.
// With `store: true` the leaked alarms also survive a reboot, so the storm restarts by itself.
//
// The fix is to stop tracking ids at all: cancel *everything* `getAllAlarms()` reports, then arm
// exactly one. That needs no type comparison and no cross-writer coordination, and it self-heals
// a device that has already accumulated a backlog.
import * as alarmMgr from '@zos/alarm'
import { localStorage as deviceStorage } from '@zos/storage'
import { APP_SERVICE_FILE, DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_INTERVAL_MINUTES } from './constants'

// `@zos/storage` is not documented as available in App Service context, and is reported not to be
// on some firmwares. A throw here must never prevent the next alarm being armed — losing the
// stored interval costs one cycle at the default, losing the alarm stops sync permanently.
function readStoredInterval() {
  try {
    const stored = deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
    const parsed = typeof stored === 'number' ? stored : parseInt(stored, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES
  } catch {
    return DEFAULT_INTERVAL_MINUTES
  }
}

function writeStoredInterval(intervalMinutes) {
  try {
    deviceStorage.setItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, intervalMinutes)
  } catch {
    // Non-fatal: the alarm is already armed, and the next wake falls back to the default.
  }
}

// Cancels every alarm this app owns. Each cancel is isolated so one bad id (already consumed,
// belonging to a previous install) can't abort the sweep and strand the rest — the failure mode
// this whole module exists to prevent. Returns how many were cancelled, which is the single most
// diagnostic number available: a healthy device reports 0 or 1 here, a leaking one reports dozens.
export function cancelAllAlarms() {
  let alarmIds
  try {
    alarmIds = alarmMgr.getAllAlarms() || []
  } catch {
    return 0
  }

  let cancelled = 0
  for (let i = 0; i < alarmIds.length; i++) {
    try {
      alarmMgr.cancel(alarmIds[i])
      cancelled++
    } catch {
      // Already consumed or not ours — nothing to do.
    }
  }
  return cancelled
}

// Cancels everything outstanding and arms a single alarm `intervalMinutes` from now.
//
// Called from app-service/index.js's onInit — i.e. from inside the callback of the alarm that just
// fired. A REPEAT_ONCE alarm is consumed the moment it fires, so it is already gone from
// getAllAlarms() by then and the sweep is a no-op in the healthy case.
//
// Returns the new alarm id, or 0 if arming failed. `set()` uses 0 to signal failure rather than
// throwing, so an unchecked call cannot distinguish "armed" from "background sync is now dead".
export function scheduleNext(intervalMinutes) {
  cancelAllAlarms()

  let newAlarmId
  try {
    newAlarmId = alarmMgr.set({
      url: APP_SERVICE_FILE,
      delay: Math.max(1, intervalMinutes) * 60,
      repeat_type: alarmMgr.REPEAT_ONCE,
      store: true,
    })
  } catch {
    return 0
  }

  if (newAlarmId) {
    writeStoredInterval(intervalMinutes)
  }
  return newAlarmId
}

// Re-arms the background sync alarm if none is pending. Meant to run on every app open (not just
// first install) so a device whose alarm was lost — consumed without the service running, cleared
// by a firmware update, never armed because `set()` returned 0 — recovers by itself.
//
// Deliberately asks the OS what is pending rather than trusting a stored id: the stored id was the
// unsound part. A device mid-storm reports many pending alarms, so this reschedules to collapse
// them back to one instead of leaving the backlog in place.
export function ensureAlarmScheduled() {
  let pending
  try {
    pending = (alarmMgr.getAllAlarms() || []).length
  } catch {
    pending = 0
  }

  if (pending === 1) return 0
  return scheduleNext(readStoredInterval())
}

// Read-only snapshot for the on-screen diagnostic line. Never throws: it is rendered on a screen
// precisely for the cases where the log channel and storage are themselves suspect.
export function getAlarmDiagnostics() {
  let pending
  let storedIntervalType

  try {
    pending = (alarmMgr.getAllAlarms() || []).length
  } catch {
    pending = -1
  }

  try {
    storedIntervalType = typeof deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
  } catch {
    storedIntervalType = 'throws'
  }

  return { pending, storedIntervalType }
}

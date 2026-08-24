// Watch-side only (uses @zos/storage). Persists the outcome of the last sync attempt —
// manual (page/index.js) or background (app-service/index.js) — so the watch UI can show a
// status that survives the app being closed, instead of only reflecting whatever the last
// button tap happened to return.
import { localStorage as deviceStorage } from '@zos/storage'
import {
  LOCAL_STORAGE_KEY_LAST_SERVICE_START,
  LOCAL_STORAGE_KEY_LAST_START_RESULT,
  LOCAL_STORAGE_KEY_LAST_SYNC_ERROR,
  LOCAL_STORAGE_KEY_LAST_SYNC_OK,
  LOCAL_STORAGE_KEY_LAST_SYNC_TIME,
  LOCAL_STORAGE_KEY_LAST_TIMER_AVAILABLE,
  LOCAL_STORAGE_KEY_WEBHOOK_CONFIGURED,
} from './constants'

// See the constant's own comment: marks that the long service's tick loop actually ran this cycle,
// independent of whether the rest of it (BLE round trip, recordSyncResult below) ever completes.
export function recordServiceStart(time = Math.floor(Date.now() / 1000)) {
  try {
    deviceStorage.setItem(LOCAL_STORAGE_KEY_LAST_SERVICE_START, time)
    return true
  } catch {
    return false
  }
}

export function getLastServiceStart() {
  try {
    return deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_SERVICE_START, 0)
  } catch {
    return 0
  }
}

// See the constant's own comment: records whether `setTimeout` was actually available in the App
// Service context for this cycle, so an unbounded (no-deadline) BLE request can be told apart from
// one that simply failed within its deadline.
export function recordTimerAvailable(available) {
  try {
    deviceStorage.setItem(LOCAL_STORAGE_KEY_LAST_TIMER_AVAILABLE, !!available)
    return true
  } catch {
    return false
  }
}

export function getLastTimerAvailable() {
  try {
    return deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_TIMER_AVAILABLE, null)
  } catch {
    return null
  }
}

// See the constant's own comment: records app.js's start() call outcome — its synchronous return
// value (0 = success), or 'threw:<message>' if the call itself threw — so a service that never
// even got told to start is distinguishable on-screen from one that started and then stalled.
export function recordServiceStartResult(result) {
  try {
    deviceStorage.setItem(LOCAL_STORAGE_KEY_LAST_START_RESULT, result)
    return true
  } catch {
    return false
  }
}

export function getLastServiceStartResult() {
  try {
    return deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_START_RESULT, null)
  } catch {
    return null
  }
}

// `configured` is optional: only pass it when the phone actually responded (a SYNC or
// SET_INTERVAL round trip). A transport-level failure (BLE/timeout) never reached app-side, so
// it has nothing new to say about whether a webhook URL is configured — leave that flag as-is
// rather than overwriting a known state with a guess.
// Never throws. This is called from App Service context, where `@zos/storage` is not documented
// as available and is reported unavailable on some firmwares — and it is called from both the
// success and failure paths of `runSync()`, so a throw from the success path would land in the
// catch block, throw again from there, and escape as an unhandled rejection. Failing to record a
// status is cosmetic; taking down the service that was about to arm the next alarm is not.
export function recordSyncResult({ ok, error, configured, time = Math.floor(Date.now() / 1000) }) {
  try {
    deviceStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_OK, !!ok)
    deviceStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_ERROR, error || '')
    deviceStorage.setItem(LOCAL_STORAGE_KEY_LAST_SYNC_TIME, time)
    if (typeof configured === 'boolean') {
      deviceStorage.setItem(LOCAL_STORAGE_KEY_WEBHOOK_CONFIGURED, configured)
    }
    return true
  } catch {
    return false
  }
}

// Returns `{ ok: null, ... }` (the "never synced" sentinel) when nothing has been recorded yet —
// a fresh install before the first alarm has fired or the button has been tapped.
export function getSyncStatus() {
  try {
    const hasResult = deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_TIME, 0) > 0
    return {
      ok: hasResult ? !!deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_OK, false) : null,
      error: deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_ERROR, ''),
      time: deviceStorage.getItem(LOCAL_STORAGE_KEY_LAST_SYNC_TIME, 0),
      configured: deviceStorage.getItem(LOCAL_STORAGE_KEY_WEBHOOK_CONFIGURED, null),
    }
  } catch {
    return { ok: null, error: '', time: 0, configured: null }
  }
}

// Watch-side only. Persists what the watch face needs to show between app opens: the outcome of the
// last sync attempt, the diagnostics from starting the background service, and the background
// service's history as last reported by the phone.
//
// Everything here is written by the app/page VM alone, into shared/store.js's page store. Nothing
// the App Service does reaches this file — it cannot write watch-side storage at all (see
// app-service/index.js's header), so its history arrives second-hand, in the phone's reply to a
// sync, and is cached here by whichever context received that reply.
import { PAGE_STORE, readField, readStore, updateStore } from './store'
import {
  STATE_KEY_BG_ALARM_COUNT,
  STATE_KEY_BG_TRIGGER,
  STATE_KEY_BG_COUNT,
  STATE_KEY_BG_HELLO_TIME,
  STATE_KEY_BG_LAST_TIME,
  STATE_KEY_BG_STAGE,
  STATE_KEY_ALARM_CANCELLED,
  STATE_KEY_ALARM_ID,
  STATE_KEY_BG_TIMER_MODE,
  STATE_KEY_WD_LAST,
  STATE_KEY_WD_RUNS,
  STATE_KEY_WD_DONE,
  SERVICE_TRACE_STORE,
  STATE_KEY_LAST_PERMISSION_QUERY,
  STATE_KEY_LAST_PERMISSION_REQUEST,
  STATE_KEY_PERMISSION_PROMPTED,
  STATE_KEY_LAST_START_RESULT,
  STATE_KEY_LAST_SYNC_ERROR,
  STATE_KEY_LAST_SYNC_OK,
  STATE_KEY_LAST_SYNC_TIME,
  STATE_KEY_WEBHOOK_CONFIGURED,
} from './constants'

// ---------------------------------------------------------------------------
// Service boot diagnostics — see shared/service-boot.js.
// ---------------------------------------------------------------------------

// `queryPermission`'s reported status for the bg_service permission, and `requestPermission`'s
// *return value* — the one an earlier boot path dropped on the floor, which is why a service that
// could never start left no trace of why.
export function recordPermissionQuery(result) {
  return updateStore(PAGE_STORE, { [STATE_KEY_LAST_PERMISSION_QUERY]: result })
}

export function getLastPermissionQuery() {
  return readField(PAGE_STORE, STATE_KEY_LAST_PERMISSION_QUERY, null)
}

export function recordPermissionRequest(result) {
  return updateStore(PAGE_STORE, { [STATE_KEY_LAST_PERMISSION_REQUEST]: result })
}

export function getLastPermissionRequest() {
  return readField(PAGE_STORE, STATE_KEY_LAST_PERMISSION_REQUEST, null)
}

// Whether the permission dialog has ever been raised automatically. Recorded *before* the dialog
// goes up rather than after it is answered, so a prompt that crashes, or one the user dismisses by
// swiping away without answering, still counts as spent — otherwise the app would raise it again on
// every single open, which is the behaviour this flag exists to prevent.
export function recordPermissionPrompted() {
  return updateStore(PAGE_STORE, { [STATE_KEY_PERMISSION_PROMPTED]: true })
}

export function hasPromptedForPermission() {
  return readField(PAGE_STORE, STATE_KEY_PERMISSION_PROMPTED, false) === true
}

// start()'s outcome, so a service that never even got told to start is distinguishable on-screen
// from one that started and then did nothing.
export function recordServiceStartResult(result) {
  return updateStore(PAGE_STORE, { [STATE_KEY_LAST_START_RESULT]: result })
}

export function getLastServiceStartResult() {
  return readField(PAGE_STORE, STATE_KEY_LAST_START_RESULT, null)
}

// The service's own breadcrumb, written by app-service/index.js and read here. Splits the chain from
// alarm to sync: `runs` climbing means an alarm actually woke the service, `done` climbing means the
// run lived long enough to finish its BLE round trip. Both zero means the alarm never dispatched,
// whatever `getAllAlarms()` says about the alarm existing.
export function getServiceTrace() {
  const store = readStore(SERVICE_TRACE_STORE)
  return {
    runs: store[STATE_KEY_WD_RUNS] || 0,
    done: store[STATE_KEY_WD_DONE] || 0,
    last: store[STATE_KEY_WD_LAST] || '',
  }
}

// The repeating alarm that wakes the service — see shared/alarm.js.
export function recordAlarm({ id, cancelled }) {
  return updateStore(PAGE_STORE, {
    [STATE_KEY_ALARM_ID]: id,
    [STATE_KEY_ALARM_CANCELLED]: cancelled,
  })
}

export function getAlarm() {
  return {
    id: readField(PAGE_STORE, STATE_KEY_ALARM_ID, null),
    cancelled: readField(PAGE_STORE, STATE_KEY_ALARM_CANCELLED, null),
  }
}

// ---------------------------------------------------------------------------
// Background service history, as reported by the phone.
// ---------------------------------------------------------------------------

// `summary` is the `background` object app-side attaches to every sync reply. Ignored when absent
// or malformed: an older phone-side build, or a transport failure, must not blank out a history the
// watch has already been told about.
export function recordBackgroundSummary(summary) {
  if (!summary || typeof summary !== 'object') return false
  return updateStore(PAGE_STORE, {
    [STATE_KEY_BG_HELLO_TIME]: summary.helloTime || 0,
    [STATE_KEY_BG_LAST_TIME]: summary.lastTime || 0,
    [STATE_KEY_BG_COUNT]: summary.count || 0,
    [STATE_KEY_BG_ALARM_COUNT]: summary.alarmCount || 0,
    [STATE_KEY_BG_TRIGGER]: summary.trigger || '',
    [STATE_KEY_BG_STAGE]: summary.stage || '',
    [STATE_KEY_BG_TIMER_MODE]: summary.timerMode || '',
  })
}

export function getBackgroundSummary() {
  const store = readStore(PAGE_STORE)
  return {
    helloTime: store[STATE_KEY_BG_HELLO_TIME] || 0,
    lastTime: store[STATE_KEY_BG_LAST_TIME] || 0,
    count: store[STATE_KEY_BG_COUNT] || 0,
    alarmCount: store[STATE_KEY_BG_ALARM_COUNT] || 0,
    trigger: store[STATE_KEY_BG_TRIGGER] || '',
    stage: store[STATE_KEY_BG_STAGE] || '',
    timerMode: store[STATE_KEY_BG_TIMER_MODE] || '',
  }
}

// ---------------------------------------------------------------------------
// Last sync outcome.
// ---------------------------------------------------------------------------

// `configured` is optional: only pass it when the phone actually responded. A transport-level
// failure (BLE/timeout) never reached app-side, so it has nothing new to say about whether a webhook
// URL is configured — leaving it out keeps the known state rather than overwriting it with a guess.
export function recordSyncResult({ ok, error, configured, time = Math.floor(Date.now() / 1000) }) {
  const fields = {
    [STATE_KEY_LAST_SYNC_OK]: !!ok,
    [STATE_KEY_LAST_SYNC_ERROR]: error || '',
    [STATE_KEY_LAST_SYNC_TIME]: time,
  }
  if (typeof configured === 'boolean') fields[STATE_KEY_WEBHOOK_CONFIGURED] = configured
  return updateStore(PAGE_STORE, fields)
}

// Returns `{ ok: null, ... }` (the "never synced" sentinel) when nothing has been recorded yet.
export function getSyncStatus() {
  const store = readStore(PAGE_STORE)
  const time = typeof store[STATE_KEY_LAST_SYNC_TIME] === 'number' ? store[STATE_KEY_LAST_SYNC_TIME] : 0
  const configured = store[STATE_KEY_WEBHOOK_CONFIGURED]

  return {
    ok: time > 0 ? !!store[STATE_KEY_LAST_SYNC_OK] : null,
    error: store[STATE_KEY_LAST_SYNC_ERROR] || '',
    time,
    configured: typeof configured === 'boolean' ? configured : null,
  }
}

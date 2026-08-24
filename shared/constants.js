// Phone-side settingsStorage keys — set from the app's Settings screen (setting/index.js).
export const SETTINGS_KEY_WEBHOOK_URL = 'webhookUrl'
export const SETTINGS_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// Phone-side settingsStorage keys — mirror of the last sync attempt's outcome, written by
// app-side/index.js after every SYNC (manual or background) so the Settings screen can show
// it even if it's opened without ever opening the watch app.
export const SETTINGS_KEY_LAST_SYNC_OK = 'lastSyncOk'
export const SETTINGS_KEY_LAST_SYNC_TIME = 'lastSyncTime'
export const SETTINGS_KEY_LAST_SYNC_ERROR = 'lastSyncError'

// Watch-side local storage key for the user's configured sync interval. Read by app-service/
// index.js's long-running tick loop (see shared/interval-storage.js) on every reschedule, and
// written by page/index.js (+/- buttons, or a phone-confirmed change) — the only way to change an
// already-running long service's pace, since there's no direct handle into its JS context from
// another one.
export const LOCAL_STORAGE_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// Watch-side local storage keys — mirror of the last sync attempt's outcome, written by
// page/index.js (manual taps) and app-service/index.js (background runs) so the watch UI
// can show a persisted status without needing a fresh sync on every app open.
export const LOCAL_STORAGE_KEY_LAST_SYNC_OK = 'lastSyncOk'
export const LOCAL_STORAGE_KEY_LAST_SYNC_TIME = 'lastSyncTime'
export const LOCAL_STORAGE_KEY_LAST_SYNC_ERROR = 'lastSyncError'
export const LOCAL_STORAGE_KEY_WEBHOOK_CONFIGURED = 'webhookConfigured'

// Written at the top of every app-service/index.js runSync() tick, before any BLE work, so it
// advances every cycle of the long service's internal loop independent of whether the rest of that
// cycle (BLE round trip, recordSyncResult) ever completes. The diagnostic that tells "the tick loop
// died" apart from "cycles are starting but not completing": if this keeps advancing but
// lastSyncTime doesn't, it's the latter.
export const LOCAL_STORAGE_KEY_LAST_SERVICE_START = 'lastServiceStart'

// Written every cycle by app-service/index.js's withTimeout(), recording whether `setTimeout` was
// actually callable in that App Service invocation. Where it isn't, withTimeout() falls back to
// running the BLE request with *no* deadline rather than crashing on a bare reference — a stuck
// handshake then hangs until the connection drops on its own. This is the on-screen diagnostic
// (`t:0`/`t:1`) that makes that fallback path observable instead of only visible in a log nobody
// can see once the app isn't in the foreground.
export const LOCAL_STORAGE_KEY_LAST_TIMER_AVAILABLE = 'lastTimerAvailable'

// Written by app.js right after calling `start()` on the long-running app-service, recording its
// synchronous return value (0 = success, per the API docs) — or 'threw:<message>' if the call
// itself threw. app.js's own try/catch already stops a failure here from crashing onCreate, but
// that only logs it, and the log viewer only streams while the mini-program is in the foreground —
// exactly the moment start() failing wouldn't be visible in. This is the on-screen diagnostic
// (`st:<code>`) for whether the service ever actually got told to start.
export const LOCAL_STORAGE_KEY_LAST_START_RESULT = 'lastStartResult'

export const DEFAULT_INTERVAL_MINUTES = 5
export const MIN_INTERVAL_MINUTES = 1
export const MAX_INTERVAL_MINUTES = 180
export const INTERVAL_STEP_MINUTES = 1

// Parses and clamps a sync interval to [MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES],
// falling back to DEFAULT_INTERVAL_MINUTES only when not finite (e.g. blank/garbage input).
// A finite non-positive value (e.g. the watch stepper decrementing past MIN) clamps to
// MIN_INTERVAL_MINUTES instead of jumping to the default. Shared by the phone settings page,
// the SET_INTERVAL BLE handler, and the watch-side +/- stepper so all three enforce the exact
// same bounds.
export function clampIntervalMinutes(raw) {
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10)
  const minutes = Number.isFinite(parsed) ? parsed : DEFAULT_INTERVAL_MINUTES
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes))
}

export const MESSAGE_METHOD_SYNC = 'SYNC'
export const MESSAGE_METHOD_SET_INTERVAL = 'SET_INTERVAL'

export const APP_SERVICE_FILE = 'app-service/index'

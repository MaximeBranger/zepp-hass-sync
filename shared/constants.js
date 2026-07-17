// Phone-side settingsStorage keys — set from the app's Settings screen (setting/index.js).
export const SETTINGS_KEY_WEBHOOK_URL = 'webhookUrl'
export const SETTINGS_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// Phone-side settingsStorage keys — mirror of the last sync attempt's outcome, written by
// app-side/index.js after every SYNC (manual or background) so the Settings screen can show
// it even if it's opened without ever opening the watch app.
export const SETTINGS_KEY_LAST_SYNC_OK = 'lastSyncOk'
export const SETTINGS_KEY_LAST_SYNC_TIME = 'lastSyncTime'
export const SETTINGS_KEY_LAST_SYNC_ERROR = 'lastSyncError'

// Watch-side local storage keys — needed because a background app-service wake is a
// fresh JS context each time; nothing survives in memory between runs.
export const LOCAL_STORAGE_KEY_ALARM_ID = 'alarmId'
export const LOCAL_STORAGE_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// Watch-side local storage keys — mirror of the last sync attempt's outcome, written by
// page/index.js (manual taps) and app-service/index.js (background runs) so the watch UI
// can show a persisted status without needing a fresh sync on every app open.
export const LOCAL_STORAGE_KEY_LAST_SYNC_OK = 'lastSyncOk'
export const LOCAL_STORAGE_KEY_LAST_SYNC_TIME = 'lastSyncTime'
export const LOCAL_STORAGE_KEY_LAST_SYNC_ERROR = 'lastSyncError'
export const LOCAL_STORAGE_KEY_WEBHOOK_CONFIGURED = 'webhookConfigured'

export const DEFAULT_INTERVAL_MINUTES = 5
export const MIN_INTERVAL_MINUTES = 1
export const MAX_INTERVAL_MINUTES = 180
export const INTERVAL_STEP_MINUTES = 5

// Parses and clamps a sync interval to [MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES],
// falling back to DEFAULT_INTERVAL_MINUTES when not finite/positive. Shared by the phone
// settings page, the SET_INTERVAL BLE handler, and the watch-side +/- stepper so all three
// enforce the exact same bounds.
export function clampIntervalMinutes(raw) {
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10)
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes))
}

export const MESSAGE_METHOD_SYNC = 'SYNC'
export const MESSAGE_METHOD_SET_INTERVAL = 'SET_INTERVAL'

export const APP_SERVICE_FILE = 'app-service/index'

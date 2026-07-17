// Phone-side settingsStorage keys — set from the app's Settings screen (setting/index.js).
export const SETTINGS_KEY_WEBHOOK_URL = 'webhookUrl'
export const SETTINGS_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// Watch-side local storage keys — needed because a background app-service wake is a
// fresh JS context each time; nothing survives in memory between runs.
export const LOCAL_STORAGE_KEY_ALARM_ID = 'alarmId'
export const LOCAL_STORAGE_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

export const DEFAULT_INTERVAL_MINUTES = 5

export const MESSAGE_METHOD_SYNC = 'SYNC'

export const APP_SERVICE_FILE = 'app-service/index'

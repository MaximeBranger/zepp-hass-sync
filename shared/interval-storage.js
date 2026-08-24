// Watch-side only (uses @zos/storage). Persists the user's configured sync interval so the
// long-running app-service (app-service/index.js) can read it back after a device reboot or app
// restart, and so page/index.js and the phone agree on the same value.
//
// This used to live in shared/alarm.js alongside `@zos/alarm` scheduling. That scheduling is gone
// — app-service/index.js is now a long service (started once via `@zos/app-service`'s start(),
// runs continuously, and paces itself with its own setTimeout loop) rather than a short-lived
// service woken by a repeating alarm. See app-service/index.js for why: a short service's
// execution is capped by the platform, and a full BLE round trip routinely exceeded it.
import { localStorage as deviceStorage } from '@zos/storage'
import { DEFAULT_INTERVAL_MINUTES, LOCAL_STORAGE_KEY_INTERVAL_MINUTES } from './constants'

// `@zos/storage` is not guaranteed available in every App Service context on every firmware. A
// throw here must never take down the caller — losing the stored interval costs one cycle at the
// default, nothing more.
export function readStoredInterval() {
  try {
    const stored = deviceStorage.getItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES)
    const parsed = typeof stored === 'number' ? stored : parseInt(stored, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_INTERVAL_MINUTES
  } catch {
    return DEFAULT_INTERVAL_MINUTES
  }
}

export function writeStoredInterval(intervalMinutes) {
  try {
    deviceStorage.setItem(LOCAL_STORAGE_KEY_INTERVAL_MINUTES, intervalMinutes)
  } catch {
    // Non-fatal: the next read (or the next app-service tick) falls back to the default.
  }
}

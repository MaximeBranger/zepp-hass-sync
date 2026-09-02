// Watch-side only. The cached copy of the phone's configuration — the send interval and whether a
// webhook URL is set — as last pulled by a GET_CONFIG round trip.
//
// This is a cache, not a setting. The phone's Settings screen is the only place either value is
// edited; the watch pulls and displays them and never writes back. That is the whole point of the
// pull-only design: there was previously a `SET_INTERVAL` push from a +/- stepper on the watch face,
// which made two contexts writers of one value and produced the reconciliation dance that restarted
// the background service every time the two happened to disagree.
//
// Lives in the page store. page/index.js is the only writer, and the App Service only ever receives
// the interval second-hand as its `start()` param — see shared/store.js's single-writer rule.
import { PAGE_STORE, readStore, updateStore } from './store'
import {
  DEFAULT_INTERVAL_MINUTES,
  STATE_KEY_CONFIG_TIME,
  STATE_KEY_SEND_INTERVAL_MINUTES,
  STATE_KEY_WEBHOOK_CONFIGURED,
  clampIntervalMinutes,
} from './constants'

// Returns `{ intervalMinutes, configured, known }`.
//
// `intervalMinutes` always comes back usable — the default when nothing is stored, clamped
// otherwise. Callers must never infer freshness from it: comparing against the default cannot
// distinguish "never pulled" from "the user happens to have chosen 5". That is what `known` is for.
//
// `known` is true once the phone has answered at least once, ever. Not "recently" — stale cached
// config is enormously better than none, because the alternative is that a phone out of Bluetooth
// range permanently stops the background worker from starting.
//
// `configured` is `null` until the phone has said one way or the other, never `false` — the two are
// different states and only the second one blocks the background worker.
export function readConfig() {
  const store = readStore(PAGE_STORE)
  const storedInterval = store[STATE_KEY_SEND_INTERVAL_MINUTES]
  const configured = store[STATE_KEY_WEBHOOK_CONFIGURED]
  const pulledAt = store[STATE_KEY_CONFIG_TIME]

  return {
    intervalMinutes:
      storedInterval === undefined ? DEFAULT_INTERVAL_MINUTES : clampIntervalMinutes(storedInterval),
    configured: typeof configured === 'boolean' ? configured : null,
    known: typeof pulledAt === 'number' && pulledAt > 0,
  }
}

// Records a config the phone just reported. `configured` is only stored when the phone actually said
// something about it — a reply that omits the field must not be read as "no webhook", which would
// stop the worker over a message-shape mismatch.
export function writeConfig({ intervalMinutes, configured, time = Math.floor(Date.now() / 1000) }) {
  const fields = {
    [STATE_KEY_SEND_INTERVAL_MINUTES]: clampIntervalMinutes(intervalMinutes),
    [STATE_KEY_CONFIG_TIME]: time,
  }
  if (typeof configured === 'boolean') fields[STATE_KEY_WEBHOOK_CONFIGURED] = configured
  return updateStore(PAGE_STORE, fields)
}

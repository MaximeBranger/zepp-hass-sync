// Phone-side settingsStorage keys — set from the app's Settings screen (setting/index.js).
export const SETTINGS_KEY_WEBHOOK_URL = 'webhookUrl'
export const SETTINGS_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// Phone-side settingsStorage keys — mirror of the last sync attempt's outcome, written by
// app-side/index.js after every SYNC (manual or background) so the Settings screen can show
// it even if it's opened without ever opening the watch app.
export const SETTINGS_KEY_LAST_SYNC_OK = 'lastSyncOk'
export const SETTINGS_KEY_LAST_SYNC_TIME = 'lastSyncTime'
export const SETTINGS_KEY_LAST_SYNC_ERROR = 'lastSyncError'

// Phone-side record of what the *background service* specifically has done: when it last made
// contact at all, when it last delivered a sync, and how many it has delivered. "Contact" is
// recorded from any message it sends, on arrival — so it stays true even when the reply never gets
// back to the watch, and it separates "the service ran" from "the service ran and its sync worked".
//
// The phone holds this rather than the watch because the watch cannot. The App Service VM is
// restricted enough that no watch-side storage has ever been observed to work from inside it —
// neither `@zos/storage` nor `@zos/fs` — and an unavailable module fails at *import*, killing the
// whole service module before a single line runs. So the service now carries no storage dependency
// at all, and the one channel it must have anyway (the BLE round trip that is its entire job)
// doubles as how it reports in. Separate from the keys above precisely so a background sync can be
// told apart from a manual one; the manual keys move on both.
export const SETTINGS_KEY_LAST_BG_SYNC_TIME = 'lastBackgroundSyncTime'
export const SETTINGS_KEY_BG_SYNC_COUNT = 'backgroundSyncCount'
// Of those, the ones the repeating alarm caused, rather than the one the app being opened delivers.
// Counted apart because the total cannot answer the only question that matters for background sync:
// opening the app delivers one too, so a rising total proves nothing on its own. This one only
// climbs when the watch syncs unattended.
export const SETTINGS_KEY_BG_ALARM_COUNT = 'backgroundAlarmSyncCount'
// What launched the most recent service run, so the Settings screen can name which alarm fired.
export const SETTINGS_KEY_LAST_TRIGGER = 'lastServiceTrigger'
export const SETTINGS_KEY_LAST_SERVICE_HELLO = 'lastServiceHello'

// The last thing the background service reported about itself: which stage it reached, and the
// error text if that stage failed. Also phone-side, for the same reason as the keys above — the
// service has nowhere on the watch to write it.
//
// This exists because a service that greeted the phone and then delivered no sync gave no way to
// tell a sensor read that threw from a payload that never made it over BLE. The service's own
// try/catch swallowed the difference and the loop carried on silently.
export const SETTINGS_KEY_SERVICE_STAGE = 'serviceReportStage'
export const SETTINGS_KEY_SERVICE_DETAIL = 'serviceReportDetail'
export const SETTINGS_KEY_SERVICE_REPORT_TIME = 'serviceReportTime'

// Which timer primitive the service's VM claims: 'T' setTimeout, 'I' setInterval only, '-' neither.
// Kept as a diagnostic only, and no longer load-bearing: nothing inside the service measures time
// any more, because on this hardware nothing can — see app-service/index.js's header for the three
// mechanisms that were tried and measured not to work.
export const SETTINGS_KEY_SERVICE_TIMER_MODE = 'serviceTimerMode'


// Watch-side state field names, stored in shared/store.js's JSON files. Which *file* each one
// lives in is decided by which context writes it — see store.js's single-writer rule and the
// sections in shared/sync-status.js.

// The watch's cached copy of the phone's config, refreshed by every GET_CONFIG pull. The phone is
// the single source of truth for both values — the watch only ever reads them — so this is a cache,
// not a setting. The service does *not* read it from here either: it has no handle into this VM's
// storage, and receives the interval as the `param` of the `start()` call that created it. See
// encodeServiceParam below.
export const STATE_KEY_INTERVAL_MINUTES = 'syncIntervalMinutes'

// When the config was last pulled from the phone, and the reason this is a separate key rather than
// something inferred from the interval: a missing interval and an interval that happens to equal the
// default are indistinguishable, and the difference decides whether the background worker may start
// at all. Zero or absent means "never pulled" — the app has no idea what pace the user wants, so it
// starts nothing rather than guessing at the default.
//
// Deliberately *not* required to be recent. Once a pull has succeeded the cached values stand
// indefinitely, because the alternative is that an unreachable phone permanently disables background
// sync — the failure mode this whole gate exists to avoid causing.
export const STATE_KEY_CONFIG_TIME = 'configPulledTime'

// Whether the background-service permission dialog has been raised at least once. The dialog is
// raised automatically on the first launch and never again: a prompt on every open would be
// obnoxious, and one the user has already refused must not keep reappearing — that is what the
// button is for.
export const STATE_KEY_PERMISSION_PROMPTED = 'permissionPrompted'

// Mirror of the last sync attempt's outcome. Recorded by page/index.js (manual taps) into the page
// store and by app-service/index.js (background runs) into the service store, so the watch UI can
// show a persisted status without needing a fresh sync on every app open.
export const STATE_KEY_LAST_SYNC_OK = 'lastSyncOk'
export const STATE_KEY_LAST_SYNC_TIME = 'lastSyncTime'
export const STATE_KEY_LAST_SYNC_ERROR = 'lastSyncError'
export const STATE_KEY_WEBHOOK_CONFIGURED = 'webhookConfigured'

// The background service's own history, as reported *by the phone* in its reply to a sync, then
// cached here by page/index.js so the watch face can show it on the next open without another round
// trip. The service itself writes nothing on the watch and cannot — see app-service/index.js's
// header for why its import list carries no storage module at all.
//
// The count is what makes this diagnostic rather than decorative: a count that climbs is a service
// that is looping, and one frozen at 1 is a service that ran once and could not reschedule itself.
// `helloTime` separates the two failures that were indistinguishable for the whole investigation —
// a service that never ran at all leaves no hello, while a service that runs but whose sync fails
// leaves a hello and no syncs.
export const STATE_KEY_BG_HELLO_TIME = 'bgHelloTime'
export const STATE_KEY_BG_LAST_TIME = 'bgLastSyncTime'
export const STATE_KEY_BG_COUNT = 'bgSyncCount'
export const STATE_KEY_BG_ALARM_COUNT = 'bgAlarmSyncCount'
export const STATE_KEY_BG_TRIGGER = 'bgTrigger'
export const STATE_KEY_BG_STAGE = 'bgStage'
export const STATE_KEY_BG_TIMER_MODE = 'bgTimerMode'

// The id of the repeating alarm that wakes the service, and how many stale alarms were cancelled
// when it was set. Both written by page/index.js — see shared/alarm.js.
//
// The cancelled count is a leak detector: it should be 1 on every app open after the first. A number
// that climbs means cancellation is failing and alarms are accumulating, which is what once buried
// the watch under a backlog.
export const STATE_KEY_ALARM_ID = 'alarmId'
export const STATE_KEY_ALARM_CANCELLED = 'alarmCancelled'

// Written by shared/service-boot.js right after calling `start()` on the long-running app-service,
// recording its synchronous return value (0 = success, per the API docs) — or one of the
// non-numeric markers it uses for the paths where start() was never reached ('running',
// 'denied:...', 'threw:...'). The caller's try/catch already stops a failure here from crashing the
// page, but that only logs it, and the log viewer only streams while the mini-program is in the
// foreground — exactly the moment start() failing wouldn't be visible in. This is the on-screen
// diagnostic (`st:<code>`) for whether the service ever actually got told to start.
export const STATE_KEY_LAST_START_RESULT = 'lastStartResult'

// Written by shared/service-boot.js on every boot attempt: what `queryPermission` reported for
// `device:os.bg_service` (0 = not authorized, 1 = unknown permission, 2 = authorized) and what
// `requestPermission` *returned* (0 = a dialog is up and the callback will fire, 1 = there is
// nothing that can be requested, 2 = already authorized — so the callback will NOT fire).
//
// The second one exists because ignoring that return value is precisely what left the service dead
// and the diagnostics blank: the old code waited on a callback that, for returns 1 and 2, never
// comes. On-screen (`q:<code> r:<code>`) these two say exactly how far the boot got.
export const STATE_KEY_LAST_PERMISSION_QUERY = 'lastPermissionQuery'
export const STATE_KEY_LAST_PERMISSION_REQUEST = 'lastPermissionRequest'

export const DEFAULT_INTERVAL_MINUTES = 5
export const MIN_INTERVAL_MINUTES = 1
export const MAX_INTERVAL_MINUTES = 180
export const INTERVAL_STEP_MINUTES = 1

// Parses and clamps a sync interval to [MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES],
// falling back to DEFAULT_INTERVAL_MINUTES only when not finite (e.g. blank/garbage input).
// A finite non-positive value clamps to MIN_INTERVAL_MINUTES rather than jumping to the default.
// Shared by the phone's Settings screen, the GET_CONFIG reply, the watch's cached copy, and the
// service `param` codec, so every hop enforces the exact same bounds — the watch trusts the phone,
// but not enough to arm a background worker on a value it hasn't checked.
export function clampIntervalMinutes(raw) {
  const parsed = typeof raw === 'number' ? raw : parseInt(raw, 10)
  const minutes = Number.isFinite(parsed) ? parsed : DEFAULT_INTERVAL_MINUTES
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, minutes))
}

export const MESSAGE_METHOD_SYNC = 'SYNC'

// Pulls the phone's config to the watch: `{ intervalMinutes, configured }`, plus the background
// summary the diagnostics need. Pull only — the watch never pushes config back, because the phone's
// Settings screen is the single place either value is edited.
//
// It exists because the watch used to learn its interval only as a field tacked onto a SYNC reply,
// which meant reading every sensor and shipping a multi-KB payload over BLE to retrieve one integer
// — and meant the watch could not know its own config until it had already sent health data
// somewhere. This is the cheap question asked on its own.
export const MESSAGE_METHOD_GET_CONFIG = 'GET_CONFIG'

// How the background service says what it is doing and what went wrong, since it has no watch-side
// storage to write to. Carries `{ stage, detail }` — see SERVICE_STAGE_* below.
export const MESSAGE_METHOD_SERVICE_REPORT = 'SERVICE_REPORT'

// Stages a background cycle passes through, reported to the phone as they happen.
//   SENSORS  reading the sensors threw; `detail` carries the error
//   SYNC     the sensor data was read but its BLE round trip failed; `detail` carries the error
//   OK       a cycle completed end to end
export const SERVICE_STAGE_SENSORS = 'sensors'
export const SERVICE_STAGE_SYNC = 'sync'
export const SERVICE_STAGE_OK = 'ok'

// Marks a request as coming from the background service rather than a manual tap. Sent alongside
// `method`/`payload` rather than inside the payload, which is the sensor blob that goes on to the
// webhook untouched.
export const MESSAGE_SOURCE_SERVICE = 'service'

// What caused a given sync, relayed to the phone so unattended ones can be counted apart from the
// one the app opening delivers.
//
//   PAGE      the app was opened, and page/index.js started (or restarted) the service.
//   ALARM     the repeating alarm fired and the system woke this service directly. This is
//             background sync working; nothing else here proves it.
export const SERVICE_TRIGGER_PAGE = 'page'
export const SERVICE_TRIGGER_ALARM = 'alarm'

// A sync nobody asked for by opening the app. This is the number that answers whether background
// sync works — the total cannot, because opening the app delivers one too and makes it climb either
// way.
export function isUnattendedTrigger(trigger) {
  return trigger === SERVICE_TRIGGER_ALARM
}

// The service that does the actual syncing: one sync per run, then it ends itself.
export const APP_SERVICE_FILE = 'app-service/index'

// The service's own breadcrumb file, written by app-service/index.js and read by the page. Its own
// file, not the page store, because shared/store.js's single-writer rule holds: the service is the
// only thing that writes this one and the page only reads it.
//
// It exists because every failure between an alarm firing and a sync arriving used to present
// identically — `a:0`, and nothing else — and each one needed a device round trip to rule out. It
// splits that chain: `runs` climbing means an alarm actually woke this service, `done` climbing
// means the run survived long enough to finish its BLE round trip.
//
// That second number answered the question the documentation leaves ambiguous, and the answer is
// why the service sends without waiting. Zepp OS caps "a single execution of the App Service" at
// 600ms without saying whether that is wall-clock lifetime or CPU time. On device, ten consecutive
// alarm-woken runs read `wd:10/0` — every one woken, not one completing its round trip — and since a
// run that hung would have stayed resident and blocked the next wake-up, each was being terminated
// from outside. The budget is wall-clock, and no round trip fits in it.
//
// `@zos/fs` is documented as available in App Service context for writing while the screen is off,
// which is exactly when an alarm-driven run happens — and it has now been observed working there on
// a GTR 4. Nothing depends on this file existing: it is a diagnostic, and a missing one reads as
// zero rather than as an error.
export const SERVICE_TRACE_STORE = 'service-trace.json'
export const STATE_KEY_WD_RUNS = 'runs'
export const STATE_KEY_WD_DONE = 'done'

// What the most recent alarm-woken run reached, as a short code, because `done` alone cannot say why
// it was not incremented. Kept terse because it shares a line on a watch face:
//   `sent`    every frame of the payload was handed to the BLE stack. The strongest claim an
//             alarm-woken run can make: it never learns whether the phone liked the data, only that
//             it left. `a:` on the watch face, which comes from the phone, confirms the other half.
//   `sensors` reading the sensors threw before anything went out.
//   `ble:...` the send itself threw; the text follows.
// A run killed mid-flight leaves no code at all — the previous one stands, which is itself the
// signature to look for when `runs` climbs and `done` does not.
export const STATE_KEY_WD_LAST = 'last'

// The service's `param` has to carry two things — what triggered this start, and the pace to keep —
// through an API that accepts a single string. It is the only channel available: `start()`'s param
// reaches `onInit` and nothing else does, and the service cannot read the interval from watch-side
// storage the way a page can.
//
// Anything unparseable decodes to a page trigger at the default interval, so a service started by
// an older build, or by an alarm restored across a reboot with a param this build doesn't recognise,
// still syncs at a sane pace instead of not at all.
export function encodeServiceParam(trigger, intervalMinutes) {
  return String(trigger || SERVICE_TRIGGER_PAGE) + ':' + clampIntervalMinutes(intervalMinutes)
}

export function decodeServiceParam(param) {
  const text = typeof param === 'string' ? param : ''
  const separator = text.indexOf(':')
  if (separator === -1) {
    return {
      trigger: text || SERVICE_TRIGGER_PAGE,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    }
  }
  return {
    trigger: text.slice(0, separator) || SERVICE_TRIGGER_PAGE,
    intervalMinutes: clampIntervalMinutes(text.slice(separator + 1)),
  }
}

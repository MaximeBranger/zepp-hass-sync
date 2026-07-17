# zepp-watchapp — Specifications

## 1. Motivation

[zepp2hass](https://github.com/davidepalleschi/zepp2hass) is a Home Assistant custom
integration that receives Zepp/Amazfit smartwatch health data over a local webhook.
It ships a companion Zepp OS watch app published on the official Zepp Store, but that
app currently **crashes** and its source is **not public**, with no response from the
maintainer. This project builds a **replacement watch app from scratch**, open source,
targeting the **Amazfit GTR 4** first, that POSTs the same JSON payload shape to the
zepp2hass webhook so it works as a drop-in replacement with the existing (unmodified)
Home Assistant integration.

## 2. Current approach: incremental, manual-trigger first

An earlier attempt built the full background-sync pipeline (periodic alarm-driven
`app-service`, phone-configurable webhook URL/interval via a settings page, full
zepp2hass field parity) all at once. It didn't work end-to-end and was hard to debug
because too many moving parts were introduced together — see git history if curious.

The project was reset to the smallest possible working slice, verified end-to-end,
and is now grown one field / one feature at a time:

1. ✅ Watch button press → read 1 sensor value → BLE to phone → phone POSTs to a
   hardcoded webhook URL. **Working.**
2. ✅ Phone formats the raw watch payload into the zepp2hass JSON shape before
   POSTing, instead of sending an ad-hoc shape.
3. ✅ Read every sensor field with an API on Zepp OS 3.0 (see §4 for what's still
   missing entirely) on each button press — not yet verified against a real
   zepp2hass/HA instance, only that the payload is built and POSTed without
   crashing.
4. ✅ Webhook URL is configured from the phone (`setting/index.js`, persisted in
   `settingsStorage`). If unset, `app-side` doesn't attempt `fetch()` at all and
   returns an error the watch displays instead.
5. ✅ Background/periodic sync: `app-service` wakes on a `@zos/alarm`, runs the same
   sensor-read → BLE → format → fetch pipeline as the button, and reschedules itself
   using the interval currently set on the phone. Interval is configured from the
   phone (`setting/index.js`, alongside the webhook URL) — still unverified
   on-device (alarm wake reliability was the reason this was deferred originally;
   see §5 for the self-healing mitigation).

## 3. Target platform

- Device: **Amazfit GTR 4** (and GTR 4 Limited Edition share the same platform).
- Firmware: GTR 4 currently runs **Zepp OS 3.0 / 3.5**.
- Network: `fetch()` is only available in the phone-side `app-side` JS context, never
  in watch-side code (device `page`). The watch cannot make its own HTTP calls. The
  watch sends the collected value to the phone's `app-side` component over BLE
  (`MessageBuilder` request/response), and `app-side` performs the actual `fetch()`
  POST using the phone's internet connection.

## 4. Target webhook payload schema

Derived from `custom_components/zepp2hass/sensors/*.py` (source of truth — re-check
against that repo if it changes). Dot paths are JSON paths in the POST body. Fields
actually sent by the current code are marked ✅ (built in `app-service/sensors.js` +
`app-side/format.js`); everything else has no API on Zepp OS 3.0 and is omitted.

### Device / diagnostic
- `record_time` ✅
- `screen.status` ✅, `screen.aod_mode` (bool) ✅ — `screen.light` (0–100) has no
  reliably-available API on GTR4's firmware (tagged `@version 3.6`), omitted
- `trigger.event`, `trigger.status` — no API
- `last_error` — no API (this is diagnostic state we'd generate ourselves, not yet
  wired up)
- `device.*` → `deviceName`, `width`, `height`, `screenShape`, `keyNumber`, `keyType`,
  `deviceSource`, `deviceColor`, `uuid` ✅ (only these exist in the Zepp OS 3.0 SDK)
- `user.*` → `nickName`, `age`, `height`, `weight`, `gender`, `region` ✅

### Battery
- `battery.current` (0–100) ✅
- `battery.is_charging` (bool) — **no API for this in Zepp OS 3.0**, cannot be sent

### Health
- `body_temperature.current.value` ✅
- `stress.current.value` ✅, `stress.last_week` ✅
- `blood_oxygen.few_hours[]` ✅ → array from `BloodOxygen.getLastFewHour()`

### Activity (current/target pairs)
- `steps.current` / `steps.target` ✅
- `calorie.current` / `calorie.target` ✅
- `fat_burning.current` / `fat_burning.target` ✅
- `stands.current` / `stands.target` ✅
- `distance.current` ✅

### Heart rate
- `heart_rate.last` ✅
- `heart_rate.resting` ✅
- `heart_rate.summary.maximum.hr_value` ✅

### Sleep
- `sleep.info.startTime`, `sleep.info.endTime`, `sleep.info.deepTime`,
  `sleep.info.totalTime` ✅
- `sleep.status` (drives `is_sleeping`) ✅

### PAI
- `pai.week` ✅, `pai.day` ✅, `pai.last_week` ✅

### Workout summary (history, not live session)
- `workout.status.trainingLoad`, `workout.status.vo2Max`,
  `workout.status.fullRecoveryTime` ✅ (whatever `Workout.getStatus()` returns)
- `workout.history[]` ✅ → each entry: `startTime`, `duration` (no `sportType` — no
  API)

### Binary/derived state
- `is_wearing` (0 = not worn, 1 = worn/stationary, 2 = worn/in motion) ✅
- `sleep.status` → drives "Is Sleeping" ✅ (same field as above)

### Deferred indefinitely: live workout session
- `workout_session.*` — requires the `Workout` sensor's active-session APIs while a
  GPS workout is running, and a distinct push path. Not planned until the passive
  fields above are solid.

## 5. Architecture (current)

Three components, two devices. `app-service/sensors.js`'s `readSensors()` (wrapping
each `@zos/sensor` call so one bad sensor can't abort the payload) and the
BLE→format→fetch pipeline are shared between the manual and automatic paths — both
end up sending the exact same `SYNC` request, just triggered differently.

- **Watch — `page`**: on button press, calls `readSensors()` and sends the raw
  values to the phone's `app-side` over BLE (`MessageBuilder` request, method
  `SYNC`), waiting for an ok/error response to show in the status text.
- **Watch — `app-service`**: registered under `device:os.bg_service`, woken by a
  `@zos/alarm` (`device:os.alarm`). On each wake: `scheduleNext()` re-arms the
  *next* alarm first (using the last known interval, from `deviceStorage`), so a
  crash further down can't also kill future cycles; then it runs the same
  `readSensors()` → BLE `SYNC` request as the button. The `SYNC` response includes
  `intervalMinutes` (the phone's current setting) — if it changed, `app-service`
  reschedules again with the fresh value, so a phone-side interval change takes
  effect on the *next* wake without needing the watch app opened.
- **Watch — `app.js`**: on every app open (not just install), `ensureAlarmScheduled()`
  checks the stored alarm id against `alarmMgr.getAllAlarms()` and re-arms if it's
  missing. This is a deliberate fix for a bug found in an earlier version: a stored
  alarm id was treated as "an alarm is pending" forever, even after it fired
  (`REPEAT_ONCE`) or failed to be created — if the very first alarm was ever lost,
  nothing would re-arm it and sync would silently stop for good. Now every app open
  self-heals that.
- **Phone — `app-side`**: receives the payload over BLE, maps it to the zepp2hass
  JSON shape (`app-side/format.js`), reads the webhook URL from `settingsStorage`
  (empty by default — no fallback URL), POSTs it via `fetch()`, and responds with
  success/failure plus the current `intervalMinutes`. If no URL is configured,
  `fetch()` is never called and the watch shows "webhook URL not configured"
  instead.
- **Phone — `setting`**: two text fields (webhook URL, sync interval in minutes),
  persisted via `settingsStorage.setItem`, rendered inside the Zepp app's Device
  Application Settings screen.

Not yet added: any visible status ("last synced", "last error") on the watch for
the *background* path — the button's status text only reflects manual runs. Worth
adding once background sync is confirmed working on-device, since a silent
background failure is otherwise invisible without pulling device logs.

## 6. Tooling / dev environment

- Node.js — installed locally.
- `zeus` CLI (Zepp OS dev tool).
- Language: JavaScript (not TypeScript, despite earlier plans — kept simple).
- Distribution: sideload via developer mode (QR scan) / simulator during
  development.

## 7. Known gaps vs. full zepp2hass parity

Fields confirmed to have **no API at all** in the Zepp OS 3.0 SDK (grepped the full
`@zeppos/device-types` typings) and that will stay omitted even once §4 is built out:

- `battery.is_charging` — no charging-state API anywhere in Zepp OS 3.0.
- `workout.history[].sportType` — `Workout.getHistory()` only returns
  `{startTime, duration}`.
- Most of `device.*` — only `width, height, screenShape, deviceName, keyNumber,
  deviceSource, keyType, deviceColor, uuid` exist.
- `user.birth`, `user.appVersion`, `user.appPlatform`, `user.uuid` — no API.
- `screen.light` exists but is tagged `@version 3.6` — GTR4 targets 3.0/3.5, so it may
  not work at runtime despite compiling; needs on-device validation.

These gaps haven't been cross-checked against zepp2hass's actual Python parsing to
confirm whether missing keys are handled gracefully on the HA side — validate against
a real HA instance once more of the schema is implemented.

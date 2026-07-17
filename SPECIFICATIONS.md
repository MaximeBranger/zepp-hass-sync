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

Local reference clone of the HA integration used to derive the payload schema below:
`c:\Users\maxime.branger\Downloads\zepp2hass` (see `custom_components/zepp2hass/`).

## 2. Goals / Non-goals

- **Goal:** full field parity with what `custom_components/zepp2hass` can consume
  (see schema in §4), sent from a GTR4.
- **Goal:** background periodic sync — data is pushed on an interval without the user
  having to keep the app open on the watch.
- **Goal:** webhook URL and sync interval configurable from the Zepp mobile app
  (phone-side settings page), not hardcoded.
- **Non-goal (phase 1):** live workout-session tracking (real-time speed/pace/cadence/
  altitude during an active GPS workout). This requires hooking into the watch's
  active workout session APIs, a materially different and harder feature — deferred
  to phase 2 once the passive-sync pipeline is proven end-to-end.
- **Non-goal (phase 1):** other Amazfit/Zepp models. zepp2hass supports 30+ devices;
  this project targets GTR4 only for now. Multi-device support may follow once the
  GTR4 build is validated.

## 3. Target platform

- Device: **Amazfit GTR 4** (and GTR 4 Limited Edition share the same platform).
- Firmware: GTR 4 currently runs **Zepp OS 3.0 / 3.5**.
- Sensor APIs used: modern `@zos/sensor` module (`HeartRate`, `Sleep`, `Stress`,
  `Battery`, `Workout`, and presumably `Step`/`Calorie`/`Distance` — to be confirmed
  against the live SDK type defs once scaffolded).
- **Known risk:** `SPO2` appears primarily documented under the **legacy 1.0
  `hmSensor`** API rather than the modern `@zos/sensor` module. Needs verification
  against the GTR 4 Zepp OS 3.x SDK — if unavailable via the modern API, blood oxygen
  may need the legacy sensor path or may be dropped from phase 1.
- Network: **verified against the installed Zepp OS 3.0 SDK typings —
  `fetch()` is only available in the phone-side `app-side` JS context, never in
  watch-side code (device `page` or background `app-service`).** The watch cannot
  make its own HTTP calls, even relayed. The watch-side background service must
  send the assembled payload to the phone's `app-side` component over BLE
  (`MessageBuilder` request/response), and `app-side` performs the actual `fetch()`
  POST to the webhook URL using the phone's internet connection. The watch does not
  need its own Wi-Fi — only a paired phone with internet access — but the POST
  itself happens on the phone, not the watch.

## 4. Webhook payload schema (target: full parity)

Derived directly from `custom_components/zepp2hass/sensors/*.py` (source of truth —
re-check against that repo if it changes). Dot paths are JSON paths in the POST body.

### Device / diagnostic
- `record_time`
- `screen.status`, `screen.aod_mode` (bool), `screen.light` (0–100)
- `trigger.event`, `trigger.status`
- `last_error`
- `device.*` → `deviceName`, `width`, `height`, `screenShape`, `keyNumber`, `keyType`,
  `deviceSource`, `deviceColor`, `productId`, `productVer`, `skuId`, `barHeight`,
  `pixelFormat`, `bleAddr`, `btAddr`, `wifiAddr`, `uuid`, `hasNFC`, `hasMic`,
  `hasCrown`, `hasBuzzer`, `hasSpeaker`
- `user.*` → `nickName`, `age`, `height`, `weight`, `gender`, `region`, `birth`,
  `appVersion`, `appPlatform`, `uuid`

### Battery
- `battery.current` (0–100)
- `battery.is_charging` (bool)

### Health
- `body_temperature.current.value`
- `stress.current.value`, `stress.last_week`
- `blood_oxygen.few_hours[]` → array of `{ spo2, ... }`, most recent entry used

### Activity (current/target pairs)
- `steps.current` / `steps.target`
- `calorie.current` / `calorie.target`
- `fat_burning.current` / `fat_burning.target`
- `stands.current` / `stands.target`
- `distance.current`

### Heart rate
- `heart_rate.last`
- `heart_rate.resting`
- `heart_rate.summary.maximum.hr_value`

### Sleep
- `sleep.info.startTime`, `sleep.info.endTime`
- `sleep.info.deepTime`, `sleep.info.totalTime`
- `sleep.status` (drives `is_sleeping`)

### PAI
- `pai.week` (main value), `pai.day`, `pai.last_week`

### Workout summary (history, not live session — in scope for phase 1)
- `workout.status.trainingLoad`, `workout.status.vo2Max`,
  `workout.status.fullRecoveryTime`
- `workout.history[]` → each entry: `sportType`, `startTime`, `duration`

### Binary/derived state
- `is_wearing` (0 = not worn, 1 = worn/stationary, 2 = worn/in motion) → drives both
  "Is Wearing" and "Is Moving" binary sensors
- `sleep.status` → drives "Is Sleeping"
- `battery.is_charging` → drives "Is Charging"

### Phase 2 (deferred): live workout session
- `workout_session.speed/avg_speed/pace/avg_pace/distance/duration/calories/
  cadence/avg_cadence/altitude/total_up_altitude/total_count/vertical_speed/
  downhill_count/total_downhill_distance/stride` (each as `{ parsed, ... }`)
- Requires reading from the `Workout` sensor's active-session APIs while a GPS
  workout is running, and a distinct push path (session updates, not periodic
  background polling).

## 5. Architecture

Verified against the installed Zepp OS 3.0 SDK (`@zeppos/device-types`) and the
`zeus-cli` reference templates — revised from the original all-on-watch design
once it became clear `fetch()` only exists in the phone-side `app-side` context.
Three components, two devices:

- **Watch — `app-service`** (Zepp OS's actual name for the background service;
  registered under `targets.default.module.app-service` in `app.json`, started via
  `@zos/app-service` `start()`, permission `device:os.bg_service`): woken
  periodically. On each wake: read all phase-1 sensors listed in §4 via
  `@zos/sensor` / `@zos/user`, assemble the JSON payload, and send it to the phone's
  `app-side` component over BLE (`MessageBuilder` request). Also requests the
  current webhook URL/interval from `app-side` (or consumes the last value pushed
  to it) since the watch cannot read phone-side settings storage directly.
- **Phone — `app-side`**: receives the payload over BLE, reads the webhook URL from
  `settingsStorage`, performs the actual `fetch()` POST to the configured webhook,
  and responds to the watch with success/failure (feeds `last_error` in the
  payload's device/diagnostic fields). Also listens for `settingsStorage` changes
  and pushes the updated URL/interval to the watch over BLE so `app-service` can
  reschedule its wake timer without waiting for its next cycle.
- **Configuration:** phone-side `settings.js` page (rendered inside the Zepp mobile
  app under Device Application Settings), exposing:
  - Webhook URL (text input)
  - Sync interval (user-customizable; matches the original app's behavior where
    default was 1 minute, adjustable e.g. 1–5+ min to trade off freshness vs
    battery)
  - Values are persisted via `settingsStorage.setItem`/`getItem` (phone-side only);
    relayed to the watch over BLE as described above.
- **Foreground app screen:** minimal — likely just a status/"last synced" view,
  matching the original app's "Apply settings" affordance if one turns out to be
  necessary for `app-service` to pick up new settings promptly.

## 6. Tooling / dev environment

- Node.js v24.16.0 — already installed locally.
- `zeus` CLI (Zepp OS dev tool) — **not yet installed**, needs
  `npm install -g @zeppos/zeus-cli` (or per current Zepp OS docs) before scaffolding.
- Language: **TypeScript**.
- Git: available locally (v2.51.2); this folder (`hass-sync`) is not yet a git repo —
  to be initialized when implementation starts.
- Distribution: sideload via developer mode (QR scan) during development; Zepp Store
  submission (per the Kiezelpay/app-store article) is out of scope unless/until the
  app is ready to publish.

## 7. Open risks / unknowns

Resolved by inspecting the installed `@zeppos/device-types` 3.0 typings and
`zeus-cli` reference templates:

- ~~Whether `Step`, `Calorie`, `Distance`, and `SPO2` are exposed via the modern
  `@zos/sensor` API~~ — **resolved: yes.** `Step`, `Calorie`, `Distance`, and
  `BloodOxygen` are all first-class classes in `@zos/sensor` at API level 3.0
  (permission codes `data:user.hd.step`, `.calorie`, `.distance`, `.spo2`). No
  legacy `hmSensor` fallback needed.
- ~~Exact settings-sync mechanism between phone-side `settings.js` and the
  watch-side background service~~ — **resolved:** see §5. Phone-side
  `settingsStorage` only; relayed to the watch over BLE, not read directly.
- ~~Network path for the webhook POST~~ — **resolved: not what was assumed.** See
  §3/§5 — `fetch()` is phone-side only (`app-side`), not available in watch-side
  `app-service`.

**Confirmed gap vs. §4 schema — "full field parity" (§2 goal) is not fully
achievable with Zepp OS 3.0's documented API.** Extracted by grepping the full
installed `@zeppos/device-types` typings (~10800 lines); these fields have **no
API at all** and are omitted from the phase-1 payload rather than guessed/faked:

- `battery.is_charging` — grepped the entire typings file for "charging": zero
  matches, in any module. There is no charging-state API in Zepp OS 3.0. The HA
  "Is Charging" binary sensor cannot be driven in phase 1.
- `workout.history[].sportType` — `Workout.getHistory()` returns only
  `{startTime, duration}`, no sport-type field.
- Most of `device.*` — only `width, height, screenShape, deviceName, keyNumber,
  deviceSource, keyType, deviceColor, uuid` exist (via `@zos/device
  getDeviceInfo()`). `hasNFC, hasMic, hasCrown, hasBuzzer, hasSpeaker, productId,
  productVer, skuId, barHeight, pixelFormat, bleAddr, btAddr, wifiAddr` do not
  exist anywhere in the typings.
- `screen.light` exists (`Screen.getLight()`) but is tagged `@version 3.6` in the
  typings — GTR4 targets Zepp OS 3.0/3.5 (§3), so this may not work at runtime
  despite compiling. To be validated on-device.
- `user.birth`, `user.appVersion`, `user.appPlatform`, `user.uuid` — no API (see
  below, already noted).

These gaps could not be cross-checked against zepp2hass's actual Python parsing
(`custom_components/zepp2hass/sensors/*.py`, the reference clone lives on a
different machine than this dev environment) to confirm whether missing keys are
handled gracefully on the HA side — **validate against a real HA instance once
end-to-end sync works.**

Still open, to validate once sensor code is written against the simulator/device:

1. Whether `user.*` (age/height/weight/gender/region) and `device.*` fields require
   an explicit permission grant/consent prompt beyond the `data:user.info` /
   `data:os.device.info` permission codes, and what Zepp OS actually allows a
   third-party app to read vs. what the original (closed-source) zepp2hass app had
   privileged access to. Confirmed unavailable from `@zos/user getProfile()`:
   `birth`, `appVersion`, `appPlatform`, `uuid` — these `user.*` schema fields (§4)
   will need to be omitted or defaulted in phase 1 unless another source is found.
2. Background `app-service` execution limits on Zepp OS (wake frequency, CPU/time
   budget per wake, whether the BLE round-trip to `app-side` reliably completes
   before the service suspends).
3. BLE message-passing reliability/latency between watch `app-service` and phone
   `app-side` when the watch app itself is not in the foreground (todo-list/fetch-api
   reference templates only demonstrate this from an open foreground page).

## 8. Phasing

- **Phase 1:** all sensors in §4 except "Phase 2 (deferred)", background periodic
  sync, phone-configurable URL/interval, GTR4 only.
- **Phase 2:** live workout-session data.
- **Phase 3 (not yet scoped):** additional device support beyond GTR4, Zepp Store
  publication.

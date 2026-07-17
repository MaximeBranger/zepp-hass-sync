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
- Network: outgoing HTTP calls from the watch app go through the Zepp mobile app's
  Bluetooth-forwarded connection (`@zos/net` fetch), so the watch does not need its
  own Wi-Fi — only a paired phone with internet access.

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

- **Sync engine:** Zepp OS background **side-service**, woken on a periodic timer.
  On each wake: read all phase-1 sensors listed in §4, assemble the JSON payload,
  POST it to the configured webhook URL via `@zos/net` fetch.
- **Configuration:** phone-side `settings.js` page (rendered inside the Zepp mobile
  app under Device Application Settings), exposing:
  - Webhook URL (text input)
  - Sync interval (user-customizable; matches the original app's behavior where
    default was 1 minute, adjustable e.g. 1–5+ min to trade off freshness vs
    battery)
  - Settings are synced from phone to the watch app via Zepp OS Settings storage;
    values are read by the side-service on each wake (or on a settings-changed
    event, TBD during implementation).
- **Foreground app screen:** minimal — likely just a status/"last synced" view,
  matching the original app's "Apply settings" affordance if one turns out to be
  necessary for the side-service to pick up new settings.

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

## 7. Open risks / unknowns to validate once scaffolding starts

1. Whether `Step`, `Calorie`, `Distance`, and `SPO2` are exposed via the modern
   `@zos/sensor` API on GTR4's Zepp OS 3.x, or require the legacy `hmSensor` 1.0 API.
2. Whether `user.*` (age/height/weight/gender/region/birth) and `device.*` fields
   require an explicit permission grant/consent prompt in `app.json`, and what Zepp
   OS actually allows a third-party app to read vs. what the original (closed-source)
   zepp2hass app had privileged access to.
3. Background side-service execution limits on Zepp OS (wake frequency, CPU/time
   budget per wake, whether network calls are reliably completed before suspension).
4. Exact settings-sync mechanism between phone-side `settings.js` and the watch-side
   side-service (poll on wake vs. push event) — needs confirming against current
   Zepp OS SDK docs during implementation.

## 8. Phasing

- **Phase 1:** all sensors in §4 except "Phase 2 (deferred)", background periodic
  sync, phone-configurable URL/interval, GTR4 only.
- **Phase 2:** live workout-session data.
- **Phase 3 (not yet scoped):** additional device support beyond GTR4, Zepp Store
  publication.

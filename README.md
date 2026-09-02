# zepp-hass-sync

<img src="assets/default.b/icon.png" alt="zepp-hass-sync logo" width="200"/>

A Zepp OS watch app that pushes health/fitness data to
[zepp2hass](https://github.com/davidepalleschi/zepp2hass), a Home Assistant custom
integration, via its webhook.

[zepp2hass](https://github.com/davidepalleschi/zepp2hass) ships its own companion
Zepp Store watch app to feed it data, but that app currently crashes on launch, its
source isn't public, and the issue has never been fixed. zepp-hass-sync is an
independent, open-source replacement for that watch app, built to send the same
webhook payload shape so it drops in as a working substitute.

See [TUTORIAL.md](TUTORIAL.md) for install and configuration instructions.

## Status

Reads every available sensor and sends it to the phone over BLE, which formats it
to the zepp2hass JSON shape and POSTs it to the webhook URL configured in the app's
phone-side Settings screen (no URL configured → the app reports "Webhook not set"
instead of sending). Triggered either by tapping **Send now** on the watch, or
automatically every N minutes: a system alarm wakes a background `app-service`,
which arms the next alarm, sends once, and ends itself.

The app is careful to keep two things apart that are easy to confuse, and never
calls them the same name:

- **send** — health data going out to Home Assistant, the app's actual job;
- **config** — the watch pulling `{ interval, webhook set? }` back from the phone,
  which is cheap, one-directional, and moves no health data.

The phone's Settings screen is the only place the webhook URL and the interval are
edited; the watch reads them and never writes them back. Both surfaces report the
outcome and timestamp of the last send — the watch face at a glance, the Settings
screen's Debug panel with the full error text and the background service's history.
Built incrementally.

## Compatible Devices

| Device | Planned | Implemented | Tested |
| --- | --- | --- | --- |
| Amazfit Balance 3 / Balance 3 Ti | ✅ | ✅ | ❌ |
| Amazfit Balance Ultra | ✅ | ✅ | ❌ |
| Amazfit Cheetah 2 Ultra | ✅ | ✅ | ❌ |
| Amazfit Bip Max | ✅ | ✅ | ❌ |
| Amazfit Cheetah 2 Pro | ✅ | ✅ | ❌ |
| Amazfit T-Rex Ultra 2 | ✅ | ✅ | ❌ |
| Amazfit Active 3 Premium | ✅ | ✅ | ❌ |
| Amazfit T-Rex 3 / T-Rex 3 Pro | ✅ | ✅ | ✅ |
| Amazfit Active Max | ✅ | ✅ | ✅ |
| Amazfit Active 2 (Round) | ✅ | ✅ | ❌ |
| Amazfit Bip 6 | ✅ | ✅ | ❌ |
| Amazfit Balance 2 / Balance 2 XT | ✅ | ✅ | ❌ |
| Amazfit Rome | ✅ | ✅ | ❌ |
| Amazfit GTR 4 (Zepp OS 3.0 / 3.5) | ✅ | ✅ | ✅ |
| Amazfit GTR 4 Limited Edition | ✅ | ✅ | ❌ |
| Amazfit GTS 4 | ✅ | ✅ | ❌ |
| Amazfit Balance | ✅ | ✅ | ❌ |
| Amazfit Cheetah / Cheetah Pro / Cheetah (Square) | ✅ | ✅ | ❌ |
| Amazfit T-Rex Ultra | ✅ | ✅ | ❌ |
| Amazfit Falcon | ✅ | ✅ | ❌ |
| Amazfit Active Edge | ✅ | ✅ | ❌ |
| Amazfit Bip 5 Unity / Core | ✅ | ✅ | ❌ |

This table will be updated as the app is released and tested on more devices.

# zepp-hass-sync

A Zepp OS watch app for the Amazfit GTR 4 that pushes health/fitness data to
[zepp2hass](https://github.com/davidepalleschi/zepp2hass), a Home Assistant custom
integration, via its webhook.

[zepp2hass](https://github.com/davidepalleschi/zepp2hass) ships its own companion
Zepp Store watch app to feed it data, but that app currently crashes on launch, its
source isn't public, and the issue has never been fixed. zepp-hass-sync is an
independent, open-source replacement for that watch app, built to send the same
webhook payload shape so it drops in as a working substitute.

See [SPECIFICATIONS.md](SPECIFICATIONS.md) for the full design: target payload
schema, architecture, phasing, and open risks.

## Status

Reads every available sensor and sends it to the phone over BLE, which formats it
to the zepp2hass JSON shape and POSTs it to the webhook URL configured in the app's
phone-side Settings screen (no URL configured → the app reports "webhook not
configured" instead of sending). Triggered either by tapping Sync on the watch, or
automatically every N minutes via a background `app-service` + alarm; N can be
adjusted from the watch face itself (+/- buttons) or from the phone-side Settings
screen, and both stay in sync. The watch face and the Settings screen each show the
outcome and timestamp of the last sync attempt. Built incrementally — see
[SPECIFICATIONS.md](SPECIFICATIONS.md) §2 for the plan.

## Target device

Amazfit GTR 4 (Zepp OS 3.0 / 3.5).

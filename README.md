# zepp-watchapp

A Zepp OS watch app for the Amazfit GTR 4 that pushes health/fitness data to
[zepp2hass](https://github.com/davidepalleschi/zepp2hass), a Home Assistant custom
integration, via its webhook.

The official zepp2hass Zepp Store app currently crashes and its source isn't public,
so this is an independent, open-source replacement built to match the same webhook
payload shape.

See [SPECIFICATIONS.md](SPECIFICATIONS.md) for the full design: target payload
schema, architecture, phasing, and open risks.

## Status

Reads every available sensor and sends it to the phone over BLE, which formats it
to the zepp2hass JSON shape and POSTs it to the webhook URL configured in the app's
phone-side Settings screen (no URL configured → the watch shows an error instead of
sending). Triggered either by tapping a button on the watch, or automatically every
N minutes (N also set in the phone-side Settings screen) via a background
`app-service` + alarm. Built incrementally — see
[SPECIFICATIONS.md](SPECIFICATIONS.md) §2 for the plan.

## Target device

Amazfit GTR 4 (Zepp OS 3.0 / 3.5).

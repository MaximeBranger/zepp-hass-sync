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

Specification stage — no app code yet.

## Target device

Amazfit GTR 4 (Zepp OS 3.0 / 3.5).

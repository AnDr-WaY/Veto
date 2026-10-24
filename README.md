<div align="center">

<img src="assets/icon.png" width="96" alt="Veto app icon" />

# Veto

**Schedule-based app blocking for iPhone**

Pick the apps that steal your evenings, set a window — and Veto holds the
line with a hard monochrome shield.

Free. No accounts, no tracking, no paywalls.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![iOS](https://img.shields.io/badge/iPhone-iOS%2016.4%2B-black?logo=apple&logoColor=white)
![Expo](https://img.shields.io/badge/Expo-SDK%2057-1B1F23?logo=expo&logoColor=white)
[![CI](https://github.com/AnDr-WaY/Veto/actions/workflows/ci.yml/badge.svg)](https://github.com/AnDr-WaY/Veto/actions/workflows/ci.yml)

</div>

Veto is built on Apple's Screen Time APIs — **Family Controls**,
**ManagedSettings** and **DeviceActivity** — with a Lock Screen Live
Activity and Home Screen widgets on top. Rules are enforced by the
system, not by willpower.

## Features

- **Quick blocks** — start right now, pick when they end.
- **Schedules** — repeat on any days of the week, times on a 5-minute
  grid. Windows that cross midnight — 23:00 → 07:00 — just work.
- **Hard mode** — the shield is up for the whole window. No bypass.
- **Threshold mode** — use freely for a set number of minutes, then the
  shield engages.
- **Stats** — protected time, attempts and streak across today, 7 days
  and 30 days.
- **Pause** — step back deliberately, resume when you're ready.
- **Widgets & Live Activity** — countdowns on the Lock Screen and Home
  Screen.
- **Private by design** — everything stays on your device.

## Requirements

An iPhone with iOS 16.4 or later, and Screen Time access granted on
first launch.

## Development

```bash
npm install
npm start
```

The demo engine runs the full app in the simulator — no Apple
entitlements required. CI runs lint, typecheck and tests on every push;
the real-device and release checklist lives in
[`docs/release.md`](docs/release.md).

## Contributing

Issues are welcome — bug reports and feature ideas especially. Veto is
developed personally and opinionated on purpose: for anything bigger
than a typo, please open an issue first.

## Privacy

Veto collects nothing and tracks nothing. See
[`PRIVACY.md`](PRIVACY.md) and [`TERMS.md`](TERMS.md).

## License

[Apache License 2.0](LICENSE)

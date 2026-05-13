# TachoLens

A macOS desktop app for inspecting EU driver-card tachograph downloads
(`.ddd` files). Built with Wails — Go backend, React/TypeScript frontend.

Drop a `.ddd` file in, see every shift, every break, every minute over
the EU 561/2006 driving limits.

## What it does

- Parses driver-card downloads via [`tachoparser`](https://github.com/traconiq/tachoparser).
- Persists into a local SQLite store (`~/Library/Application Support/tacho-ui/tacho.db`)
  so you can keep importing weekly downloads and the history accumulates.
- Compliance analysis built on EU 561/2006:
  - Continuous-driving breaches (>4h30m without a qualifying break)
  - 15+30 split-break detection per Art. 7
  - Daily / weekly / fortnightly driving limits
  - Daily-rest insufficient / reduced
  - Weekly-rest verified / reduced / inconclusive (card-not-inserted aware)
- GNSS map for Gen-2 cards (Google Maps; needs an API key locally).
- Printable A4 weekly report.

## Install

Download the latest `.dmg` from the
[Releases page](https://github.com/jakewtaylor/tacho-ui/releases),
open it, drag the app into Applications. Code-signed + notarized — opens
without Gatekeeper warnings. Auto-updates via Sparkle.

## Develop

Requires Go 1.23+, Node 20+, and the Wails CLI.

```bash
# Hot-reloading dev mode
wails dev

# Production build (unsigned; for testing the bundle)
wails build

# Tests
go test ./...
cd frontend && npm test
```

For the full release pipeline (sign + notarize + DMG + Sparkle appcast)
see `scripts/release.sh` and the GitHub Actions workflow at
`.github/workflows/release.yml`. Releases are triggered by pushing a
`v*` tag.

## Project layout

- `app.go`, `main.go` — Wails bindings + entry point.
- `internal/db/` — SQLite store, migrations, queries.
- `internal/importer/` — `.ddd` parse + dedup + write.
- `internal/updater/` — Sparkle bridge (CGo, macOS-only).
- `frontend/` — React + Vite UI, rules engine (`activity.ts`,
  `infringements.ts`, `weeklyRest.ts`).
- `build/darwin/` — `Info.plist`, entitlements, app icon source.
- `icons/` — Bakery-exported per-size PNGs; `scripts/build-icns.sh`
  assembles them into an `.icns` at release time.
- `scripts/` — release pipeline.
- `docs/appcast.xml` — Sparkle update feed, regenerated on every release.

## A note on identifiers

The product display name is **TachoLens** and the macOS bundle
identifier is `com.tacholens.app`. The Go module name and the on-disk
SQLite directory (`~/Library/Application Support/tacho-ui/`) are still
`tacho-ui` — that's the historical internal identifier, kept as-is to
avoid breaking existing user data.

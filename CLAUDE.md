# tachograph-viewer

A desktop tachograph file viewer. Drop a `.ddd` file in, see the contents.

## Layout

This is a monorepo. Two packages under `apps/`:

- `apps/desktop/` — the Wails v2 macOS app (Go backend + React-TS frontend). Go module `tacho-ui`. Everything below — `app.go`, `internal/`, `frontend/`, `build/`, `wails.json`, `scripts/release.sh` etc. — is relative to this directory unless stated otherwise.
- `apps/web/` — the marketing landing page at tacholens.com. Next.js 16 (App Router) + Tailwind 4. Deploys to Vercel; Root Directory must be set to `apps/web` in the project settings.

Shared at the monorepo root:

- `docs/appcast.xml` — Sparkle update feed for the desktop app. The URL `raw.githubusercontent.com/.../main/docs/appcast.xml` is baked into every shipped binary; **do not move this file**.
- `.github/workflows/release.yml` — desktop release CI, fires on `v*` tag.
- `tachoparser/` — local reference clone of `github.com/traconiq/tachoparser`. **Not a dependency** — the app pulls tachoparser as a normal Go module via `go get`. This directory is kept for source inspection only.
- `C_20260509_1146_M_TAYLOR_DB141641620128.ddd` — sample driver-card file (`C_` prefix = card). Gitignored (PII).
- `output.json` — sample parsed output from `dddparser -card` on the file above (~1.8 MB). Useful as a reference for the JSON shape the UI needs to render. Gitignored.

## tachoparser library API

Module: `github.com/traconiq/tachoparser` (renamed from `kuiper-transport` recently — commit `373eef0`).

Main package for programmatic use: `pkg/decoder`.

```go
import (
    _ "github.com/traconiq/tachoparser/internal/pkg/certificates" // loads embedded PKs at init
    "github.com/traconiq/tachoparser/pkg/decoder"
)

// Driver card (.ddd starting with C_)
var c decoder.Card
verified, err := decoder.UnmarshalTLV(data, &c)

// Vehicle unit (.ddd starting with M_ etc.)
var v decoder.Vu
verified, err := decoder.UnmarshalTV(data, &v)
```

Then `encoding/json` marshal the struct. The decoder struct fields produce the same JSON shape as `output.json`.

**Current stance: POC, no signature verification.** `decoder.PKsFirstGen` / `decoder.PKsSecondGen` will be empty maps; every `verified` field in the parsed JSON will be `false`, but the JSON is complete and renderable.

**For later — adding verification without a `replace` directive:**

`internal/pkg/certificates` is Go-internal to `traconiq/tachoparser` so we can't import it directly. But we don't need to — `PKsFirstGen` / `PKsSecondGen` are exported maps in `pkg/decoder`, and all the cert-loading types/methods (`CertificateFirstGen`, `cert.Decode()`, etc.) are exported. The internal package is just ~30 lines of glue that reads embedded `.bin` files and calls those exported APIs.

So the app can ship its own `certs/pks{1,2}/*.bin` and a small `init()` that does the same loading itself — no fork, no `replace`, no path dependency. The local `tachoparser/` checkout here is reference material, not part of the build.

## Build prerequisites

- Go 1.23+ (the app needs 1.23; tachoparser declares 1.19). User confirmed Go 1.26.3 installed.
- For Wails: `wails` CLI + Node/npm for the frontend.
- For signature verification (future, not POC): Python 3 + `requests` + `lxml`, then run `tachoparser/scripts/pks{1,2}/dl_all_pks{1,2}.py`. pks1 is currently downloaded into `tachoparser/internal/pkg/certificates/pks1/` (198 keys); pks2 is not — the JRC server is slow (~0.5s sleep per file). A `.venv` exists at `tachoparser/.venv` with the deps installed. When we actually wire up verification, those `.bin` files will need to live inside `certs/` so they get embedded into the Wails binary.

## Running the pieces

Desktop commands run from `apps/desktop/`. Web commands run from `apps/web/`.

```bash
# Desktop ----------------------------------------------------------
cd apps/desktop

# Hot-reload dev mode (Vite dev server at http://localhost:34115)
wails dev

# Production build → apps/desktop/build/bin/tacho-ui.app
wails build

# Go smoke test (parses the sample .ddd in-process)
go test ./...

# Frontend tests (vitest, rules-engine coverage)
cd frontend && npm test

# Full signed release pipeline (Developer ID + notarization + DMG + appcast)
./scripts/release.sh

# Web --------------------------------------------------------------
cd apps/web
npm run dev    # http://localhost:3000
npm run build  # static export, Vercel-ready

# Standalone parser CLI (reference, at monorepo root)
./tachoparser/cmd/dddparser/dddparser -card < C_20260509_1146_M_TAYLOR_DB141641620128.ddd > output.json
```

## tacho-ui current state

Persistent desktop app: SQLite-backed store + import flow + driver-scoped pages. Imports a `.ddd` file via dialog or drag-and-drop, dedups by SHA256, splits into normalised rows (drivers, vehicles, imports, daily_records, place_records, gnss_points, events_faults), and serves every view from the DB. React 18 + Vite 8 + TypeScript frontend, Wails v2 Go backend.

### Backend layout

- **`internal/db/`** — SQLite store via `modernc.org/sqlite` (pure-Go, no CGO). DB lives at `os.UserConfigDir()/tacho-ui/tacho.db` (on macOS: `~/Library/Application Support/tacho-ui/tacho.db`). Schema is in `internal/db/migrations/0001_init.sql`, applied via a numbered-migration runner that tracks state in `schema_migrations`. Read APIs return shapes that match the *post-extract* frontend types (so binding results are consumable directly — no `extract*` step).
- **`internal/importer/`** — parses the file via tachoparser, marshals to JSON for storage (gzipped in `imports.raw_json` for safekeeping / future re-render), then unmarshals into a payload struct mirroring just the JSON paths we care about. Inserts in a single transaction with `INSERT OR REPLACE` for daily/place/gnss/events (last-write-wins on (driver, date) collisions across re-imports) and `INSERT OR IGNORE`-then-`UPDATE` for `drivers`/`vehicles`. Same SHA256 → `AlreadyImported=true`, prior import ID + driver returned.

### Bound methods (`app.go`)

- `ImportDDDDialog()` — open dialog, import. `nil` result + `nil` err = user cancelled.
- `ImportDDDFromPath(path)` — import a specific path. Used by drag-drop.
- `ListImports(cardNumber)`, `DeleteImport(importID)` — manage imported files.
- `ListDrivers()` — landing-page list.
- `GetDriverProfile(cardNumber)` — full identity + aggregates.
- `GetDailyRecords(cardNumber)`, `GetPlaceRecords(cardNumber)`, `GetGnssPoints(cardNumber)`, `GetEventsAndFaults(cardNumber)`, `GetDriverVehicles(cardNumber)` — typed row fetches.
- `PrintWindow()` — native print dialog (via Wails PR #2822's `runtime.WindowPrint`).

### Frontend layout

- **`useDriverData(cardNumber)`** hook fetches all of `{profile, dailyRecords, placeRecords, gnssPoints, events, vehicles}` in parallel via the bindings. Pages call this; existing compute libraries (`activity.ts`, `infringements.ts`, `weeklyRest.ts`, `shifts.ts`, `weeks.ts`) consume those rows as-is — the JSON-tree-walking `extract*` helpers are deleted.
- **Pages:** `Home` (`/`) lists drivers. `Overview` (`/driver/:cardNumber`), `WeeksPage` (`/driver/:cardNumber/weeks`), `DayPage` (`/driver/:cardNumber/day/:date`), `PrintWeekPage` (`/driver/:cardNumber/print/week/:weekStart`) all scoped by card number from the URL.

Styled with **Tailwind v4** (via `@tailwindcss/vite`); custom design tokens live in `frontend/src/style.css` under `@theme`. Charts use **@visx** (scale, shape/BarStack, axis, group, grid, responsive).

### Break-compliance logic (`activity.ts` → `computeDayDetail`)

Implements EU 561/2006 Art. 7 including the 15+30 split-break replacement:

- A "driving session" accumulates driving time. It closes when either:
  - A single uninterrupted rest (work_type 0) of ≥45 min is observed, OR
  - A rest of ≥15 min is followed (at any later point in the session, with arbitrary driving/work/availability in between) by another rest of ≥30 min. Order matters per the regulation — 15 first, then 30.
- Availability (work_type 1) does **not** count toward break time; nor do work or card-not-inserted segments. They do NOT invalidate a previously recorded first break, however — only a rest segment is a break.
- A session is flagged `breachedContinuous` when its accumulated driving exceeds 4h 30m **before** a qualifying break sequence completes (single ≥45 OR 15+30 split). `hasBreakBreach` is simply `some(s => s.breachedContinuous)` — if the threshold is exceeded before close, it's a breach even if a qualifying break eventually arrives.
- `DrivingSession.firstBreakMin` / `secondBreakMin` are populated when the close was a split, so the UI can display "37+31m" or similar.

On the sample card, this drops continuous-driving breaches from 7 to 1 in the last 28 days, and from much higher to 3 across all 337 days — most "long runs" turn out to be properly split with 15+30. The 2026-04-16 breach is genuine: cum 4h 31m driving before the second 30m break completes (by 1 minute).

### Activity computation (`frontend/src/activity.ts`)

Daily records live at `card_driver_activity_1.decoded_activity_daily_records` (Gen1 buffer, longer history on this sample card — 337 days vs Gen2's 273). Falls back to Gen2 if Gen1 is empty.

Each daily record has `activity_change_info[]` — an event list with `minutes` (since midnight), `work_type`, and `card_present`. `work_type` encoding per EU regulation 165/2014:

- `0` = break/rest
- `1` = availability
- `2` = work (non-driving)
- `3` = driving

Duration in each activity = `events[i+1].minutes - events[i].minutes` (clamped to 1440 for the last event). Periods with `card_present: false` are bucketed separately as "card not inserted" and excluded from work/rest/driving totals (the data is unreliable for those windows).

The 9h / 10h daily driving thresholds are EU limits (9h standard, can extend to 10h twice per week).

**Bound methods (`app.go`):**

- `OpenAndParseDDD() (*ParseResult, error)` — opens a native file dialog, parses the chosen file. Card-vs-VU auto-detected from filename (`C_` prefix → card).
- `ParseDDDFromPath(path string) (*ParseResult, error)` — parses by absolute path; used by the Wails native file-drop handler.
- `ParseDDDBytes(filename string, data []byte, isCard bool) (*ParseResult, error)` — parses raw bytes; reserved for byte-only flows.

**Drag-and-drop** uses Wails' native API (`window.runtime.OnFileDrop`), not HTML5. `main.go` enables it with `DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: true}` — disabling WebView drop avoids the WebView opening the file in a new tab.

**Country codes** (`frontend/src/nations.ts`): NationNumeric → name/alpha mapping per EU 2016/799 Annex IC Appendix 1 §2.101. Verified against the sample (driving_licence_issuing_authority="DVLA" + nation=21 → United Kingdom).

**Shifts** (`frontend/src/shifts.ts`): pairs begin (type 0/2) with end (type 1/3) `place_records`, yields a Shift with start/end country, time, odometer, and distance. Also computes **rest-before** — gap between previous shift's end and current shift's start — and flags `shortRest` when under 11h (EU daily rest threshold). Note: odometer is per-vehicle, so summing distances across shifts that use different vehicles is meaningless — within a single shift it's reliable (matches `activity_day_distance` on our sample).

**Vehicles** (`frontend/src/vehicles.ts`): extracted from `card_vehicles_used_*.card_vehicle_records`. Each shift is matched to a vehicle by overlapping time range (`vehicleForShift`); on our sample the windows align to the second. The shifts panel displays the registration in a dedicated column.

**Events & faults** (`frontend/src/events.ts`, `eventTypes.ts`): card stores events and faults in separate arrays-of-arrays. `extractEventsAndFaults` flattens both and filters out empty/placeholder entries. `eventTypeLabel` maps EventFaultType codes (EU 2016/799 Annex IC App. 1 §2.70) to human labels — covers general events (0x0_), security breaches (0x1_, 0x2_), and recording-equipment faults (0x3_, 0x4_). The panel shows newest 30 entries with begin time, kind chip, type label, duration, and vehicle reg.

**GNSS map** (`frontend/src/gnss.ts`, `MapPanel.tsx`): Gen-2 cards store ~every-3h-of-driving GNSS samples at `gnss_accumulated_driving.gnss_accumulated_driving_records[]` with lat/lng/timestamp/odometer. The map uses **Google Maps** via `@vis.gl/react-google-maps` — needs `VITE_GOOGLE_MAPS_API_KEY` set in `frontend/.env.local` (and "Maps JavaScript API" enabled on the key in Google Cloud Console). Optional `VITE_GOOGLE_MAPS_MAP_ID` for cloud-styled basemap. If the key is missing, the panel renders a friendly setup-instructions card instead of crashing. Points render as `AdvancedMarker` dots, trip segments as `google.maps.Polyline` (imperative — the new lib has no Polyline component, so we set them via `useMap()`). Bounds auto-fit on data change. `dateFilter` ('yyyy-mm-dd') filters to a single UTC day; used on the day page.

The legacy visx offline map (TopoJSON-based) packages (`@visx/geo`, `world-atlas`, `topojson-client`) remain installed but unused — tree-shaken out of the bundle.

## Routing

Uses **react-router-dom** with `HashRouter` (Wails serves from a custom scheme; hash routing avoids file:// path issues). Routes:

- `/` → `pages/Overview.tsx` — driver summary, full activity panel (clickable rows), full-window map, shifts, events, raw JSON.
- `/weeks` → `pages/WeeksPage.tsx` — Sunday-starting weekly buckets. Headline compliance banner + per-week cards (totals, compliance chip, 7-cell day grid, embedded `InfringementsPanel`). Grouping logic in `frontend/src/weeks.ts`.
- `/day/:date` → `pages/DayPage.tsx` — single day: header with prev/next nav + day-of-N counter, summary chips, prominent `InfringementsPanel`, DayDetail (timeline + sessions + segments), day-filtered MapPanel.
- `/print/week/:weekStart` → `pages/PrintWeekPage.tsx` — spreadsheet-style printable weekly report. App.tsx detects `/print/*` routes and skips its layout chrome so the page can own the whole window. Uses CSS `@page { size: A4 landscape }` and `@media print` to hide the toolbar; on-screen preview is already white/light. Reached via "Print" button on each week card.

**Print workflow:** `window.print()` is a no-op in Wails v2's WKWebView shim. However, Wails v2.12 ships a Go-side `runtime.WindowPrint(ctx)` (added in [PR #2822](https://github.com/wailsapp/wails/pull/2822)) that triggers the native print dialog. The bundled JS runtime doesn't expose it, so `app.go` defines a thin `PrintWindow()` method that calls `runtime.WindowPrint(a.ctx)`; the binding is regenerated via `wails generate module`. The print toolbar's "Print" button calls `PrintWindow()` → native macOS print dialog (Save as PDF is available there).

An earlier attempt fell back on `BrowserOpenURL("data:text/html,...")` to pop the report into the default browser. **That doesn't work:** Safari and Chrome both block top-level navigation to `data:` URLs as a security measure (rolled out around 2017–2018), so the system browser silently refuses to open them. Removed.

### Infringements (`frontend/src/infringements.ts` + `InfringementsPanel.tsx`)

Detection is pure functions exporting `Infringement { code, severity, title, description, date?, ruleRef? }`. Severity is `breach | warning | info`. Rules covered (per EU 561/2006 / gov.uk):

| Code | Scope | Rule |
|---|---|---|
| `CONTINUOUS_DRIVING` | day | >4h 30m driving without a 45-min qualifying rest (Art. 7) |
| `DAILY_DRIVING_HARD` | day, surfaced again at week | Daily driving >10h (Art. 6(1)) |
| `DAILY_DRIVING_EXTENDED` | day | Driving 9–10h — uses one of two weekly extensions (Art. 6(1), info) |
| `DAILY_REST_INSUFFICIENT` | day, surfaced at week | Pre-shift rest <9h (Art. 8) |
| `DAILY_REST_REDUCED` | day | Pre-shift rest 9–11h — reduced (info; max 3/week) |
| `WEEKLY_DRIVING` | week | Weekly driving >56h (Art. 6(2)) |
| `FORTNIGHTLY_DRIVING` | week | Two-week driving total >90h (Art. 6(3)) |
| `TOO_MANY_EXTENSIONS` | week | More than 2 days at 9–10h driving in a Sun–Sat bucket |
| `EXTENSION_USED` | week | 1–2 extension days used this week (info) |
| `CONTINUOUS_DRIVING_WEEK` | week | Count of days in the bucket with continuous-driving breaches |
| `TOO_MANY_REDUCED_RESTS` | week | More than 3 reduced (9–11h) daily rests in a Sun–Sat bucket |
| `REDUCED_REST_USED` | week | 1–3 reduced daily rests this week (info) |
| `WEEKLY_REST_MISSING` | week | No ≥24h rest overlaps the week and no card-not-inserted gap could plausibly contain one (Art. 8(6)) |
| `WEEKLY_REST_REDUCED` | week | Longest weekly rest 24–45h — reduced (info; requires compensation, not tracked) |
| `WEEKLY_REST_INCONCLUSIVE` | week | Verified rest short, but a ≥24h card-not-inserted gap could have contained one — verdict deferred (info) |

### Weekly-rest detection (`frontend/src/weeklyRest.ts`)

`extractRestSpans` walks every `activity_change_info` event in chronological order, converts to absolute UTC ms, and merges consecutive minutes where `card_present === true && work_type === 0` across day boundaries. Anything else (driving/work/availability) breaks the chain.

`extractPossibleRestSpans` runs the same scan with the predicate widened to "verified rest OR card-not-inserted" — an upper bound on what *could* have been rest if the driver pulled the card.

`assessWeeklyRest(week, restSpans, possibleRestSpans, ambiguousSpans, window)` finds the longest qualifying (≥24h) span overlapping each Sun–Sat bucket from both sets. Verified ≥45h → clean. Verified 24–45h → `WEEKLY_REST_REDUCED` (info). Verified < 24h but possible-rest ≥ 24h, or the data window doesn't fully cover the week → `WEEKLY_REST_INCONCLUSIVE` (info, verdict deferred). Genuinely no qualifying span at all → `WEEKLY_REST_MISSING` (breach).

The sample card illustrates why the inconclusive verdict matters: only 1 verified ≥45h rest in 337 days, but 36 possible-rest spans ≥45h — i.e. the driver routinely removes the card during weekly rest. Strict verified-only detection would flag almost every week as missing, which would be misleading.

**Still not modelled:** compensation tracking for reduced weekly rests (Art. 8(6b) requires compensation as a single block by the end of the third following week).

**Week boundary caveat:** weekly limits are computed against the displayed Sunday–Saturday bucket per the UI choice. The EU regulatory "fixed week" is Monday 00:00 → Sunday 24:00; figures near a Sun/Mon boundary may differ from a strict compliance calculation. The `/weeks` page surfaces this in a footer note.

`InfringementsPanel` renders the list with severity styling and a "Compliant" green card when empty (suppressible via `hideWhenEmpty` for embedded per-week use).

`App.tsx` is the layout shell — holds parse state, drag/drop, file dialog, and renders `<Outlet context={{ result, parsedData, error, loading }} />`. Pages read state via `useOutletContext<AppCtx>()`. Activity-table rows and shift rows are `<Link to={\`/day/\${date}\`}>` — replaces the old expand-in-place selection state.

`ParseResult` is `{filename, fileType, json}` where `json` is a pre-formatted (indented) string. The frontend `JSON.parse`s it and pulls a summary from `card_identification_and_driver_card_holder_identification_1` for cards.

**Wails docs:** https://wails.io/docs/

**Regenerating TS bindings:** `wails generate module` from the repo root after changing any bound Go method.

## Testing

`app_test.go` contains a smoke test that loads the sample `.ddd`, parses it through the importer, and asserts driver name + card number match expected values. The test skips itself if the sample file isn't present. Run with `go test -v` from the repo root.

`frontend/src/*.test.ts` covers the rules engine (activity / weeklyRest / infringements) via vitest. Run with `cd frontend && npm test`.

## Repository state

The monorepo root is a git repo. The `tachoparser/` sibling is a separate checkout (its own `.git`). `.gitignore` excludes the sample `.ddd` (PII), the parsed `output.json/err`, the `tachoparser/` clone, and all build/node_modules/env artefacts.

## Notes / decisions

- Working directory is `/Users/jake/code/tachograph-viewer` (the monorepo root). For desktop work, `cd apps/desktop` first.
- The `.ddd` sample contains real PII (driver name "MARK WILLIAM TAYLOR", DOB, card number). Don't commit it or paste contents into anywhere logged.
- `output.err` from the sample parse shows `warn: CHR mismatch` repeatedly — that's expected without pks2 keys (2nd-gen signature verification fails). The trailing `trying to wrap around for the second time, stop parsing` is the normal end-of-stream signal, not an error.

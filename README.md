# tacholens

Monorepo for **TachoLens** — a tachograph data viewer.

| Package | What it is | Path |
| ------- | ---------- | ---- |
| `apps/desktop` | macOS Wails app (Go + React) for parsing and analysing `.ddd` driver-card downloads | `apps/desktop` |
| `apps/web` | Marketing / landing page at [tacholens.com](https://tacholens.com) | `apps/web` |

Shared infrastructure at the monorepo root:

- `docs/appcast.xml` — Sparkle update feed for the desktop app. URL is baked
  into every shipped binary; **do not** move this file.
- `.github/workflows/release.yml` — CI for the desktop release pipeline,
  triggered on `v*` tags.

## Develop

Each package is independent. Pick one and `cd` into it.

### Desktop app

```bash
cd apps/desktop
wails dev                 # hot-reload dev mode
go test ./...
cd frontend && npm test   # vitest rules-engine suite
```

For release builds (sign + notarize + DMG + Sparkle appcast), see
`apps/desktop/scripts/release.sh` and the GitHub Actions workflow. Releases
are triggered by pushing a `v*` tag from the monorepo root.

### Landing page

```bash
cd apps/web
npm run dev               # http://localhost:3000
npm run build             # static export, ready for Vercel
```

## Deploy

- **Desktop**: tag a release (`git tag v0.1.x && git push origin v0.1.x`).
  CI handles the rest; users on older versions auto-update via Sparkle.
- **Web**: hosted on Vercel. Connect the repo, set **Root Directory** to
  `apps/web` in the Vercel project settings. Pushes to `main` deploy
  automatically; preview deployments fire on every PR.

## Identifiers (worth knowing)

- Product display name: **TachoLens**
- macOS bundle ID: `com.tacholens.app`
- Go module name: `tacho-ui` (historical; kept stable to avoid breaking
  data on existing installs)
- On-disk data path: `~/Library/Application Support/tacho-ui/tacho.db`

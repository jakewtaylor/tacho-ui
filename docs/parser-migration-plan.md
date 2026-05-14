# `go-ddd` — clean-room replacement for `tachoparser`

## Context

The desktop app at `apps/desktop/` currently depends on `github.com/traconiq/tachoparser` to parse `.ddd` tachograph files. That library is **AGPL-3.0**, which is incompatible with shipping a paid proprietary desktop product — distribution would force us to open-source the whole app. The licensing/payments work in `apps/web/` + `internal/license/` is already wired up specifically so this can be sold, so the parser is the last blocker.

We will replace it with a **clean-room Go implementation** authored solely from the public EU specs:

- Regulation (EU) 165/2014
- Commission Implementing Regulation (EU) 2016/799, Annex IC — primarily Appendix 1 (Data Dictionary), Appendix 2 (Tachograph Cards Specification), Appendix 7 (Data Downloading), Appendix 11 (Common Security Mechanisms)

No tachoparser source will be read or referenced during implementation. The only legitimate use of upstream's `dddparser` CLI is as a black-box reference: feed it the sample file, capture its JSON, diff our own output against it in tests.

**Naming:** the new module is `go-ddd` (module path `github.com/jakewtaylor/go-ddd`, Go package name `ddd`). Deliberately distinct from tachoparser's `dddparser` binary to avoid confusion.

**Scope chosen:** full parity — Card + VU + signature verification. Output struct shape mirrors today's `internal/importer/payload.go`, but the parser writes directly into typed Go structs (no JSON intermediate). Gzipped `raw_json` blob is preserved by marshalling our own type, keeping `imports.raw_json` shape-compatible.

**Productisation strategy:** the parser ships as a **standalone Go module under `packages/go-ddd/`** with its own `go.mod` and an **MIT** `LICENSE`, so it can be open-sourced independently of the desktop app. Only the UI / app stays proprietary and paid. This means the parser package may not import anything from `apps/desktop/` — it's a one-way dependency. The desktop app consumes it via a local `replace` directive during development and via the module path once published.

**Signature verification is a real, accurate compliance facility, not a stub.** The parser performs Gen1 RSA and Gen2 ECDSA verification whenever keys are available; per-EF and per-record `Verified` booleans reflect truth. The parser never refuses to return data — refusal is a policy decision left to consumers. This separation (mechanism in `go-ddd`, policy in `apps/desktop`) means regulated downstream users (auditors, fleet compliance tools) can build on the parser without inheriting our UX choices.

## Package layout

New top-level workspace package at `packages/go-ddd/` — a **separate Go module**, sibling to `apps/desktop/` and `apps/web/`:

```
packages/go-ddd/
  go.mod                  // module github.com/jakewtaylor/go-ddd (final path TBD)
  LICENSE                 // MIT
  README.md               // public-facing usage + spec references
  doc.go                  // package ddd — overview + spec refs
  parser.go               // ParseCard, ParseVU entrypoints
  types.go                // exported Card, VU result types (the output contract)
  errors.go               // ErrCorruptTLV, ErrUnknownEF, ErrSigInvalid
  internal/
    tlv/                  // TLV (cards, 3-byte tag) + TV (VU, 2-byte tag) primitives — App. 7
    primitives/           // BCDString, TimeReal, IA5String, Datef, Name, ExtendedSerialNumber — App. 1
    card/                 // one file per EF: ef_identification, ef_driver_activity, ef_places,
                          //   ef_vehicles_used, ef_events, ef_faults, ef_gnss, ef_card_certificate
    vu/                   // one file per TREP block: activities (0x02), events_faults (0x03),
                          //   overspeeding (0x04), technical (0x05), card_slots (0x06)
    crypto/               // gen1_rsa.go (RSA-recovery + SHA-1), gen2_ecdsa.go, brainpool.go, certchain.go
  pki/                    // go:embed-ed ERCA roots + MSCA bundle (.bin)
  cmd/
    ddd-decode/           // small open-source CLI (MIT) — parses a .ddd, emits JSON. Useful both for
                          //   public users and as the reference we diff our own output against
    refresh-pks/          // fetches MSCA bundle from JRC (clean-room Go reimplementation)
  testdata/               // spec-derived hex fixtures (PII-free); golden JSON gitignored
```

Top-level package decl is `package ddd`, so consumers write `import "github.com/jakewtaylor/go-ddd"` then `ddd.ParseCard(...)`, `ddd.Card`, etc. Public surface stays tiny (`ParseCard`, `ParseVU`, `Card`, `VU`); everything else is `internal/`. The package has **no dependency on anything in `apps/`** — it's a leaf module.

### Wiring into the desktop app

- `apps/desktop/go.mod` adds `require github.com/jakewtaylor/go-ddd v0.0.0` plus a `replace github.com/jakewtaylor/go-ddd => ../../packages/go-ddd` directive for local development. Once the package is published, releases can pin to a real version and the replace can be dropped (or kept — both work).
- Optionally add a Go workspace at the monorepo root: `go.work` listing `apps/desktop` and `packages/go-ddd`. Cleaner for local dev across modules.
- `apps/desktop/internal/importer/importer.go` imports `github.com/jakewtaylor/go-ddd` and consumes `ddd.Card` directly.

### Monorepo conventions

`apps/` is currently the only top-level code directory. Introducing `packages/` for shared libraries mirrors the npm/yarn workspace convention already implicit in the JS side and leaves room for future shared Go libs (e.g. licensing helpers).

## Phasing

### Phase A — Card parsing, no signature verification (~2–3 weeks)

Cuts the tachoparser dependency immediately; app behaves identically to today (which already treats every `verified` field as false). Verification fields are present on the output type from day one — they just always read `false` until Phase B lands.

Implement:
- `packages/go-ddd/go.mod`, `LICENSE` (MIT), `README.md`; `go.work` at monorepo root listing `apps/desktop` and `packages/go-ddd`
- `internal/tlv/` — streaming TLV reader
- `internal/primitives/` — all Appendix 1 atomic types
- `internal/card/` — every EF needed to populate the existing payload struct (see field list in `apps/desktop/internal/importer/payload.go:20-156`): Identification, Driver_Activity (cyclic buffer), Places, Vehicles_Used, Events_Data, Faults_Data, GNSS_Places (+ Gen2v2 variants)
- `types.go` — `ddd.Card` mirroring `payload.go` shape, plus `Verified bool` and per-EF `Verified` fields
- `cmd/ddd-decode/` — minimal MIT CLI: reads stdin or path, emits JSON. Used by tests and ships as the public OSS face of the package

Touched files:
- New: everything under `packages/go-ddd/`
- New: `go.work` at the monorepo root
- Modified: `apps/desktop/internal/importer/importer.go:13,47-54` (swap import to `github.com/jakewtaylor/go-ddd`; parse directly into `ddd.Card`; `json.Marshal(card)` for the gzipped `raw_json` blob)
- Deleted: `apps/desktop/internal/importer/payload.go` (replaced by import of `ddd.Card`)
- Modified: `apps/desktop/go.mod` — remove `github.com/traconiq/tachoparser`, add `require` + local `replace` for `go-ddd`
- `apps/desktop/app_test.go` — unchanged, must continue to pass

**Merge gate:** `go test ./...` green at both module roots, including existing assertions (driver "TAYLOR"/"MARK", card `DB14164162012802`, ≥100 daily records, ≥1 place record). Golden-JSON diff vs upstream `dddparser` CLI on the sample card normalises to zero semantic diff (ignoring `verified` fields).

### Phase B — Signature verification (~2–3 weeks)

Implement:
- `internal/crypto/gen1_rsa.go` — 1024-bit RSA with message recovery + SHA-1 (App. 11 Part A §3, §6)
- `internal/crypto/gen2_ecdsa.go` + `brainpool.go` — ECDSA over BrainpoolP256/384/512 (App. 11 Part B §6, §9.1)
- `internal/crypto/certchain.go` — ERCA → MSCA → equipment cert chain validation
- `pki/` with `go:embed` of ERCA roots (Gen1, Gen2). Tiny — a few hundred bytes each
- `cmd/refresh-pks/` — small Go tool (lives in the `packages/go-ddd/` module) that pulls the JRC MSCA bundle (clean-room reimplementation from JRC's public test PKI docs; supersedes the slow Python scripts noted in `CLAUDE.md`). Output committed under `pki/msca/`

**Brainpool note:** `crypto/elliptic` doesn't ship Brainpool. Either hand-roll an `elliptic.Curve` impl from RFC 5639 parameters, or take a dep on `github.com/cloudflare/circl` (BSD-3-Clause, MIT-compatible). Decision before starting Phase B.

**Mechanism vs policy.** The parser performs verification accurately whenever cert material is available, then records the truth: per-EF `Verified bool`, plus a `SignatureSummary` on `Card` / `VU` (chain valid? root used? EFs covered? EFs failed?). Parsing never aborts on a signature error — that's a policy decision left to the consumer. The desktop app initially renders a non-blocking "unverified data" badge but does not gate features on it; a future `ddd.ParseCardStrict` helper or a `Policy` option struct can be added if a regulated customer demands hard refusal. This keeps the parser usable by compliance auditors who need accurate verification status without inheriting our UX trade-offs.

**Merge gate:** Synthetic ERCA-signed fixture verifies green; single-byte-mutated copy fails. Sample card produces a consistent verification truth-table (likely a mix of false where we lack the issuing MSCA, true where the chain resolves — that's accurate, not a bug). Desktop app surfaces the new `Verified` field via a non-blocking UI badge.

### Phase C — VU file support (~2–3 weeks)

New user-facing feature: import vehicle-unit `.ddd` files (`M_*` / `V_*` prefix).

Implement:
- `internal/vu/` — TREP block decoders
- `ParseVU(data []byte) (*VU, error)`
- New DB tables for VU-specific data (overspeeding events, calibrations, card insert slots) — schema design is a separate sub-task

Touched files:
- `apps/desktop/app.go:218-220` — replace the "card-only" guard with dispatch on file-kind sniff (prefix `C_` → ParseCard, `M_`/`V_` → ParseVU)
- `apps/desktop/internal/importer/` — new `ImportVU` symmetric to `ImportCard`
- `apps/desktop/internal/db/migrations/` — new `0003_vu.sql` for VU tables

**Merge gate:** Unit tests against synthetic VU blocks; golden diff vs upstream `dddparser -vu`.

Phases A and B can ship in releases independently of C.

## EU spec coverage map (high-level)

| Decoder | Section |
|---|---|
| TLV framing (cards) | App. 7 §3.2 + §3.3 |
| TV framing (VU) | App. 7 §2.2 |
| TimeReal / Datef / BCDString | App. 1 §2.162 / §2.57 / §2.10 |
| Name, ExtendedSerialNumber | App. 1 §2.99 / §2.72 |
| EF_Identification | App. 2 §4.2.1; App. 1 §2.13, §2.41, §2.61 |
| EF_Driver_Activity (cyclic buffer) | App. 2 §4.2.3 + §4.4; App. 1 §2.6–2.8 |
| EF_Places | App. 2 §4.2.4; App. 1 §2.117 |
| EF_Vehicles_Used | App. 2 §4.2.2; App. 1 §2.32 |
| EF_Events / EF_Faults (codes) | App. 2 §4.2.5–6; App. 1 §2.27, §2.70, §2.74 |
| EF_GNSS_Places (Gen2 / Gen2v2) | App. 2 §4.5–4.6; App. 1 §2.79, §2.234 |
| VU activities/events/overspeed/tech | App. 7 §2.2.2 TREP 0x02–0x06; App. 1 §2.179–§2.197 |
| Gen1 RSA-recovery + SHA-1 | App. 11 Part A §3, §6 |
| Gen2 ECDSA + Brainpool | App. 11 Part B §6, §9 |
| ERCA / MSCA / equipment chain | App. 11 Part A §4 / Part B §4 |

## Output struct design

Move `internal/importer/payload.go` contents into `packages/go-ddd/types.go` as `ddd.Card` and delete the old file. The "JSON is the contract" indirection in `payload.go` exists because of the tachoparser boundary — once we own both ends, it has no value. `importer.go:47-61` collapses from "parse → marshal → unmarshal" to "parse → consume directly", and `imports.raw_json` is filled via a single `json.Marshal(card)`. JSON-shape parity with upstream tachoparser remains a maintenance goal so already-imported `raw_json` rows can be inspected against either parser.

The `ddd` package may expose a slightly richer type than the importer needs (e.g. preserving raw EF byte ranges for re-verification). The importer can use whatever subset it wants — Go's struct embedding makes this cheap. We do not introduce a separate `importer.Payload` view unless a concrete need arises.

## Validation strategy (all three)

1. **Golden-JSON diff against upstream `dddparser`** on the sample card (`C_20260509_1146_M_TAYLOR_DB141641620128.ddd`). Build upstream CLI outside the build tree, save its output as `testdata/sample_card.golden.json` (gitignored — PII), and write a Go test that normalises both JSONs (sorts keys, zeroes the `verified` field in Phase A) and diffs.
2. **Replay `apps/desktop/app_test.go`** assertions end-to-end (currently TAYLOR/MARK, card prefix, ≥100 daily records, ≥1 place record, dedup behaviour).
3. **Field-level unit tests from spec worked examples** for every primitive (BCD, TimeReal, IA5String, Datef, Name, ExtendedSerialNumber, etc.). Fuzz test (`go test -fuzz`) the TLV layer for corrupted/truncated input.

## Risk register (top 5)

1. **Gen2 v1 vs v2 layout drift** (GNSS, card slots — Reg. 2021/1228 amendments). Mitigation: `Generation` + `Version` enums on `Card`, per-EF dispatch; build fixture set covering Gen1, Gen2v1, Gen2v2.
2. **Cyclic-buffer reconstruction in EF_Driver_Activity** is off-by-one fiddly (wrap mid-record). Mitigation: dedicated tests for wrap / full / empty cases; cross-check record count against tachoparser CLI.
3. **Brainpool curves not in Go stdlib.** Either implement from RFC 5639 parameters or depend on `cloudflare/circl` — verify license fit before adding.
4. **JSON-shape parity drift** breaks consumers of the gzipped `raw_json` blob. Mitigation: CI golden-diff test.
5. **Corrupted / truncated `.ddd` files** could panic on slice bounds. Mitigation: every `tlv` call returns `(value, err)`, never panics; per-EF `recover()`-to-error wrapper so a single bad EF doesn't drop the whole import; fuzz CI gate.

## Effort estimate

**Total: 7–10 calendar weeks of focused single-developer work**

- Phase A: 2–3 weeks
- Phase B: 2–3 weeks
- Phase C: 2–3 weeks
- Slack / fuzzing / docs: ~1 week absorbed across phases

A and B together (~5 weeks) get us to commercial-distributable. C is net-new functionality and should land after A+B are field-stable.

## Critical files to modify

- New module: `packages/go-ddd/` (entire tree — MIT licensed, separable, open-sourceable)
- New: `go.work` at monorepo root
- `apps/desktop/internal/importer/importer.go` (lines 13, 47-54 — swap parser, drop JSON round-trip)
- `apps/desktop/internal/importer/payload.go` (delete; replaced by `ddd.Card`)
- `apps/desktop/app.go` (lines 218-220 — Phase C, file-kind dispatch)
- `apps/desktop/app_test.go` (unchanged, used as regression gate)
- `apps/desktop/go.mod` (remove tachoparser, add `go-ddd` `require` + local `replace`)
- `apps/desktop/internal/db/migrations/0003_vu.sql` (new, Phase C)

## Verification (end-to-end)

After each phase:

```bash
# from packages/go-ddd/
go test ./...                                          # unit + golden-JSON tests
go test ./internal/tlv/ -fuzz=Fuzz -fuzztime=60s       # TLV fuzz gate

# from apps/desktop/
go test ./...                                          # smoke tests, including app_test.go
cd frontend && npm test                                # frontend rules engine (must not regress)
wails dev                                              # manual: drag sample .ddd in, verify driver page renders identically
```

For Phase B specifically: re-import the sample card, inspect the `Verified` fields on the returned `Card` — should be a consistent truth-table (likely all false for our sample without the issuing MSCA, which is expected; the chain logic itself is exercised by the synthetic fixture).

For Phase C: drop a VU file (`M_*.ddd`) into the app, verify it imports without the "only driver-card files are supported" error and the new VU pages render.

Final cutover: delete the `tachoparser/` reference checkout from the workstation; the monorepo no longer references it anywhere.

# `go-ddd` — clean-room replacement for `tachoparser`

## Context

The desktop app at `apps/desktop/` currently depends on `github.com/traconiq/tachoparser` to parse `.ddd` tachograph files. That library is **AGPL-3.0**, which is incompatible with shipping a paid proprietary desktop product — distribution would force us to open-source the whole app. The licensing/payments work in `apps/web/` + `internal/license/` is already wired up specifically so this can be sold, so the parser is the last blocker.

We replace it with a **clean-room Go implementation** authored solely from the public EU specifications:

- **Regulation (EU) 165/2014** — the framework regulation defining digital and smart tachographs.
- **Commission Implementing Regulation (EU) 2016/799** — Annex IC sets the technical detail. Primary references: Appendix 1 (Data Dictionary), Appendix 2 (Tachograph Cards Specification), Appendix 7 (Data Downloading), Appendix 11 (Common Security Mechanisms).
- **Commission Implementing Regulation (EU) 2021/1228** — Annex IC amendments introducing the Gen2 *version 2* tachograph (new EFs for border crossings, load/unload, GNSS authentication status, etc.). The sample driver-card file used to validate Phase A is a Gen2v2 card (cardStructureVersion `{01 01}`, see 2021/1228 §TCS_152).
- **Commission Regulation (EC) 1360/2002** — Annex IB, the predecessor regulation defining first-generation digital tachograph cards. Kept as cross-reference for Gen1 byte layouts that 2016/799 inherits.

Local mirrors live in `docs/legislation/` (`2016-799.html`, `2021-1228.html`, `2002-1360.html`) so byte-layout decisions can be cited at the §-level without network access.

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

## Spec-cited binary layouts

These are the **authoritative byte layouts** for every EF the parser must handle, with §-level citations into the local legislation mirror. Anything previously labelled "TBD / validate against card" in the older plan revision has been resolved here from the actual ASN.1 + size tables in 2016/799 §TCS_150 (Gen1), §TCS_154 (Gen2v1), and 2021/1228 §TCS_154 (Gen2v2).

### Primitives (App. 1)

| Type | Spec § (2016/799) | Encoding | Octets |
|---|---|---|---|
| `TimeReal` | App. 1 §2.162 | Unsigned binary unix timestamp, Octet Aligned | 4 |
| `OdometerShort` | App. 1 §2.113 | `INTEGER(0..2^24-1)`, unsigned binary, value in km | 3 |
| `HighResOdometer` | App. 1 §2.81 | `INTEGER(0..2^32-1)`, 1/200 km | 4 |
| `Datef` (BCD date) | App. 1 §2.57 | BCD `yyyymmdd` | 4 |
| `BCDString(n)` | App. 1 §2.10 | Packed BCD, 1 digit per semi-octet | ⌈n/2⌉ |
| `IA5String(n)` | App. 1 (IA5 8-bit) | One byte per character | n |
| `Name` | App. 1 §2.99 | code-page (1) + IA5(35) | 36 |
| `NationNumeric` | App. 1 §2.101 | Single byte | 1 |
| `RegionNumeric` | App. 1 (region code) | Single byte | 1 |
| `EntryTypeDailyWorkPeriod` | App. 1 §2.66 | `INTEGER` enum, octet aligned | 1 |
| `GNSSAccuracy` | App. 1 §2.77 | `INTEGER(1..100)` | 1 |
| `GeoCoordinates` | App. 1 §2.76 | SEQUENCE of two `INTEGER`s; latitude `(-90000..90001)`, longitude `(-180000..180001)`; encoded as multiples (factor 10) of ±DDMM.M / ±DDDMM.M | **3 + 3 = 6** |
| `GNSSPlaceRecord` | App. 1 §2.79 | TimeReal + GNSSAccuracy + GeoCoordinates | 4 + 1 + 6 = **11** |
| `GNSSPlaceAuthRecord` (Gen2v2) | 2021/1228 §2.79c | GNSSPlaceRecord + PositionAuthenticationStatus | 11 + 1 = **12** |
| `PositionAuthenticationStatus` | 2021/1228 §2.117a | 1 byte enum | 1 |
| `EventFaultType` | App. 1 §2.70 | 1 byte enum | 1 |
| `LoadType` | 2021/1228 §2.90a | 1 byte enum | 1 |

**Critical correction from earlier draft:** `GeoCoordinates` is **6 octets total** (3 + 3, signed 24-bit), NOT 8. The latitude/longitude conversion is the DDMM.M-scaled-by-10 form documented in 2016/799 App. 1 §2.76 — *not* the divisor-of-10000 we initially guessed. See `Coordinate decoding` below.

### Cyclic-buffer EFs (driver card)

Every cyclic-array EF has a fixed-width pointer header followed by `NoOfXxxRecords` slots of identical structure. The pointer width comes from §TCS_150 (Gen1) and §TCS_154 (Gen2). The card capacities for Gen2v2 are fixed (min = max in 2021/1228 §TCS_155).

| EF | FID | Gen | Pointer | Record size | NoOfRecords | Body bytes | Spec § |
|---|---|---|---|---|---|---|---|
| Driver_Activity_Data | `0504` | 1 | 2 + 2 (oldest + newest) | variable (linked) | n6 | 5548..13780 | App. 2 §TCS_150 |
| Driver_Activity_Data | `0504` | 2 | 2 + 2 | variable | n6 | 13780 (fixed) | 2021/1228 §TCS_154, §TCS_155 |
| Vehicles_Used | `0505` | 1 | 2 | 31 | 84..200 | 2606..6202 | App. 2 §TCS_150 |
| Vehicles_Used | `0505` | 2 | 2 | **48** (Gen1 31 + VIN 17) | 200 | 9602 | 2021/1228 §TCS_154 |
| Places | `0506` | 1 | **1** | 10 | 84..112 | 841..1121 | App. 2 §TCS_150 |
| Places | `0506` | 2 | **2** | **21** (Gen1 10 + GNSSPlaceRecord 11) | 112 | 2354 | App. 1 §2.117 + §2.79 + §TCS_154 |
| VehicleUnits_Used | `0523` | 2 | 2 | 10 (TimeReal 4 + ManufacturerCode 1 + DeviceID 1 + VuSoftwareVersion 4) | 200 | 2002 | App. 1 §2.39, §2.40; §TCS_152 |
| GNSS_Places | `0524` | 2 | 2 | **18** (TimeReal 4 + GNSSPlaceRecord 11 + OdometerShort 3) | 336 | 6050 | App. 1 §2.79; 2021/1228 §TCS_155 n8 |
| Places_Authentication | `0526` (Gen2v2) | 2v2 | 2 | 5 (TimeReal 4 + auth 1) | 112 | 562 | 2021/1228 §2.116b |
| GNSS_Places_Authentication | `0527` (Gen2v2) | 2v2 | 2 | 5 (TimeReal 4 + auth 1) | 336 | 1682 | 2021/1228 §2.79b |
| Border_Crossings | `0528` (Gen2v2) | 2v2 | 2 | 17 | 1120 | 19042 | 2021/1228 §2.36 CardBorderCrossingRecord |
| Load_Unload_Operations | `0529` (Gen2v2) | 2v2 | 2 | 20 | 1624 | 32482 | 2021/1228 §TCS_155 n11 |
| Load_Type_Entries | `0530` (Gen2v2) | 2v2 | 2 | 5 (TimeReal 4 + LoadType 1) | 336 | 1682 | 2021/1228 §2.90a, §TCS_155 n12 |

### Fixed-size / non-cyclic EFs

| EF | FID | Gen | Body | Notes |
|---|---|---|---|---|
| Application_Identification | `0501` | 1 | 10 | App. 2 §TCS_150 |
| Application_Identification | `0501` | 2 | 17 | App. 2 §TCS_152 (existing) |
| Application_Identification_V2 | `0525` (Gen2v2) | 2v2 | 10 | 2021/1228 §2.61a: lengthOfFollowingData(2) + noOfBorderCrossing(2) + noOfLoadUnload(2) + noOfLoadTypeEntry(2) + vuConfigurationLengthRange(2) |
| Identification | `0520` | 1 / 2 | 143 | App. 2 §TCS_150 |
| Card_Download | `050E` | 1 / 2 | 4 | App. 2 §TCS_150; single TimeReal |
| Driving_Licence_Info | `0521` | 1 / 2 | 53 | App. 2 §TCS_150 |
| Events_Data | `0502` | 1 | 864..1728 | 24-byte records × n1 buckets |
| Events_Data | `0502` | 2 | 3168 | 24-byte records × 12 types × 12 events; 2021/1228 §TCS_154 |
| Faults_Data | `0503` | 1 / 2 | 576..1152 | 24-byte records × n2 buckets |
| Current_Usage | `0507` | 1 / 2 | 19 | sessionOpenTime(4) + nation(1) + reg(14) |
| Control_Activity_Data | `0508` | 1 / 2 | 46 | controlType(1) + controlTime(4) + cardType(1) + member(1) + cardNumber(16) + vehReg(1+14) + downloadBegin(4) + downloadEnd(4) |
| Specific_Conditions | `0522` | 1 | 280 | 56 records × 5 bytes |
| Specific_Conditions | `0522` | 2 | 562 | 112 records × 5 bytes + 2-byte pointer; 2021/1228 §TCS_155 n9 |
| VU_Configuration | `0531` (Gen2v2) | 2v2 | up to 3072 | 2021/1228 §TCS_155 n13 |
| CardMA_Certificate | `C100` | 1 / 2 | 194 / variable ECC | App. 2 §TCS_150 |
| CardSignCertificate | `C101` | 2 | variable ECC | App. 2 §TCS_152 |
| CA_Certificate | `C108` | 1 / 2 | 194 / variable ECC | App. 2 §TCS_150 |
| Link_Certificate | `C109` | 2 | variable ECC | App. 2 §TCS_152 |

The **sample card** used to validate Phase A — `C_20260509_1146_M_TAYLOR_DB141641620128.ddd` — exhibits this exact layout for every Gen2v2 EF. The byte sizes above were derived top-down from the spec, and bottom-up from `dumptlv` of the sample; both agree.

### Coordinate decoding (the previously-guessed case)

From App. 1 §2.76, latitude is encoded as a 24-bit signed integer N where `N = ±DDMM.M × 10`. Worked example: `0x00C8F5` = 51445 → 51° 44.5′ N → 51 + 44.5/60 = 51.7417° decimal. Longitude uses ±DDDMM.M × 10, also signed 24-bit. The decoding function is therefore:

```go
func geoCoordinateToDegrees(raw int24) float64 {
    sign, abs := 1.0, raw
    if abs < 0 { sign, abs = -1.0, -abs }
    deg := abs / 1000
    minutesTenths := abs - deg*1000   // 0..999, i.e. minutes × 10
    return sign * (float64(deg) + float64(minutesTenths)/600.0)
}
```

The earlier "divisor 10000" guess was wrong by an order of magnitude and a format.

### TLV record-type byte (Appendix 7)

`.ddd` files frame each EF as `FID(2) | Type(1) | Length(2) | Value(Length)`. The type byte discriminates generation and data-vs-signature:

- `0x00` Gen1 data
- `0x01` Gen1 signature
- `0x02` Gen2 data
- `0x03` Gen2 signature

Gen2 **version 2** does **not** introduce new type bytes — version-2 EFs are emitted with `0x02`. Versioning is implicit in the cardStructureVersion `{01 01}` reported by EF_Application_Identification (2021/1228 §TCS_152 note). The current `tlv` package's `TypeDataGen2v2 = 0x04` constant is **incorrect** and unreferenced by the spec; it should be removed.

## Phasing

### Phase A — Card parsing, no signature verification (~2–3 weeks) — **shipped**

Cuts the tachoparser dependency immediately; app behaves identically to today (which already treats every `verified` field as false). Verification fields are present on the output type from day one — they just always read `false` until Phase B lands.

Phase A status as of this revision:
- All Gen1 + Gen2v1 EFs decode green against synthetic fixtures and the real sample card.
- The integration test `apps/desktop/app_test.go::TestImportSampleCard` passes (driver TAYLOR/MARK, card `DB14164162012802`, 337 daily records Gen1 + 336 Gen2, 112 place records each gen, 200 vehicles, events/faults populated).
- One known decoder still misaligned: `EF_GNSS_Places` was wired to FID `0x0525` (which is actually `Application_Identification_V2` per 2021/1228) and assumed 20-byte records. Real FID is `0x0524` with 18-byte records. The parser tolerates the error via `Card.DecodeErrors` so the test passes, but the map will be empty until this is corrected.

Remaining Phase A work:
1. Re-map FIDs: `FIDGNSSPlaces = 0x0524`; add `FIDGNSSPlacesAuth = 0x0527` (the Gen2v2 EF); add `FIDApplicationIdentificationV2 = 0x0525` and either decode or silently skip it.
2. Fix `gnssRecordLen = 18` and the slot layout (outer TimeReal 4 + GNSSPlaceRecord 11 + OdometerShort 3).
3. Replace `geoCoordinateToDegrees` with the DDMM.M ×10 form above.
4. Remove the `TypeDataGen2v2 = 0x04` constant from `internal/tlv` (no spec basis).
5. Optionally decode Gen2v2-only EFs (Border_Crossings, Load_Unload, Load_Type) — not required for the existing UI but a small effort, and the sample card has data in all three.

**Merge gate (already passing):** `go test ./...` green at both module roots, the sample card import asserts pass, and `len(Card.DecodeErrors) == 0` after the GNSS fix.

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
- `internal/vu/` — TREP block decoders. Gen2v2 introduces several new TREP values; full list in 2021/1228 §TCS_154 amendments. Notable: TREP `0x31`/`0x32`/`0x33`/`0x35` for Gen2v2 data structures (border crossings, load/unload, etc.).
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
| EF_Places (Gen1/Gen2) | App. 2 §TCS_150 / §TCS_154; App. 1 §2.117 |
| EF_Vehicles_Used (Gen1/Gen2) | App. 2 §TCS_150 / §TCS_154; App. 1 §2.32 |
| EF_Events / EF_Faults | App. 2 §4.2.5–6; App. 1 §2.27, §2.70, §2.74 |
| EF_GNSS_Places (Gen2) | App. 2 §TCS_152; App. 1 §2.79 |
| EF_VehicleUnits_Used (Gen2) | App. 1 §2.39, §2.40; App. 2 §TCS_152 |
| EF_Places_Authentication (Gen2v2) | 2021/1228 §2.116b |
| EF_GNSS_Places_Authentication (Gen2v2) | 2021/1228 §2.79b |
| EF_Border_Crossings (Gen2v2) | 2021/1228 §2.36 |
| EF_Load_Unload_Operations (Gen2v2) | 2021/1228 §2.91a (NoOfLoadUnloadRecords) |
| EF_Load_Type_Entries (Gen2v2) | 2021/1228 §2.90a |
| GeoCoordinates (DDMM.M ×10) | App. 1 §2.76 |
| GNSSAccuracy | App. 1 §2.77 |
| Gen1 RSA-recovery + SHA-1 | App. 11 Part A §3, §6 |
| Gen2 ECDSA + Brainpool | App. 11 Part B §6, §9 |
| ERCA / MSCA / equipment chain | App. 11 Part A §4 / Part B §4 |

## Output struct design

Move `internal/importer/payload.go` contents into `packages/go-ddd/types.go` as `ddd.Card` and delete the old file. The "JSON is the contract" indirection in `payload.go` exists because of the tachoparser boundary — once we own both ends, it has no value. `importer.go:47-61` collapses from "parse → marshal → unmarshal" to "parse → consume directly", and `imports.raw_json` is filled via a single `json.Marshal(card)`. JSON-shape parity with upstream tachoparser remains a maintenance goal so already-imported `raw_json` rows can be inspected against either parser.

The `ddd` package may expose a slightly richer type than the importer needs (e.g. preserving raw EF byte ranges for re-verification). The importer can use whatever subset it wants — Go's struct embedding makes this cheap. We do not introduce a separate `importer.Payload` view unless a concrete need arises.

`Card.DecodeErrors []string` accumulates per-EF decode failures so a single malformed/unknown EF can't black-hole the whole card — Phase A relies on this for forward-compat with EFs we haven't decoded yet (e.g. `Application_Identification_V2` until that decoder lands).

## Validation strategy (all three)

1. **Spec-derived hex fixtures.** Every primitive decoder has unit tests built from the worked examples and value-range bounds in App. 1. Same for record structures — feed a hand-constructed buffer matching §TCS_150/§TCS_154/§2.117 etc. and assert the decoded struct.
2. **Real-card integration test.** `apps/desktop/app_test.go::TestImportSampleCard` imports the sample driver card end-to-end (TAYLOR/MARK, DB14164162012802) and asserts ≥100 daily records, ≥1 place record, dedup behaviour. PII-protected: gitignored, test skips if file is absent.
3. **Golden-JSON diff against upstream `dddparser`** (optional, when a fresh upstream CLI build is on hand). Build upstream outside the build tree, save its output as `testdata/sample_card.golden.json` (gitignored — PII), and write a Go test that normalises both JSONs (sorts keys, zeroes the `verified` field in Phase A) and diffs.
4. **Fuzzing.** `go test -fuzz` on the TLV layer (already gating, ~500k execs no panics) and on every primitive decoder. Fuzz the per-EF body decoders once Phase A's FID set stabilises.

## Risk register (top 5)

1. **Gen2 v1 vs v2 layout drift** (GNSS authentication, border crossings — Reg. 2021/1228 amendments). **Mitigated** — the §TCS_155 size table in 2021/1228 pins every record count and width; this plan tabulates them above. `cardStructureVersion` in EF_Application_Identification distinguishes v1 from v2.
2. **Cyclic-buffer reconstruction in EF_Driver_Activity** is off-by-one fiddly (wrap mid-record). Mitigation: dedicated tests for wrap / full / empty cases. Already passing on real card with 13780-byte buffer × 337 daily records.
3. **Brainpool curves not in Go stdlib.** Either implement from RFC 5639 parameters or depend on `cloudflare/circl` — verify license fit before adding.
4. **JSON-shape parity drift** breaks consumers of the gzipped `raw_json` blob. Mitigation: CI golden-diff test when upstream is available.
5. **Corrupted / truncated `.ddd` files** could panic on slice bounds. Mitigation: every `tlv` call returns `(value, err)`, never panics; `Card.DecodeErrors` collects per-EF failures; fuzz CI gate.

## Effort estimate

**Total: 7–10 calendar weeks of focused single-developer work**

- Phase A: 2–3 weeks (✅ shipped, minus the GNSS fix listed above — ~half a day)
- Phase B: 2–3 weeks
- Phase C: 2–3 weeks
- Slack / fuzzing / docs: ~1 week absorbed across phases

A and B together (~5 weeks) get us to commercial-distributable. C is net-new functionality and should land after A+B are field-stable.

## Critical files to modify

- New module: `packages/go-ddd/` (entire tree — MIT licensed, separable, open-sourceable)
- New: `go.work` at monorepo root
- `apps/desktop/internal/importer/importer.go` (swap parser, drop JSON round-trip)
- `apps/desktop/internal/importer/payload.go` (delete; replaced by `ddd.Card`)
- `apps/desktop/app.go` (Phase C, file-kind dispatch)
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

# go-ddd Phase A status

Phase A is **complete and validated against the real sample card**:

- `apps/desktop` parses `.ddd` files exclusively through `go-ddd`; the
  AGPL `tachoparser` dependency is removed.
- `apps/desktop/app_test.go::TestImportSampleCard` passes (driver
  TAYLOR/MARK, card `DB14164162012802`, 337 daily records Gen1 + 336
  daily records Gen2, 112 place records per generation, 200 vehicles,
  events/faults populated, 336 GNSS records decoded to plausible UK +
  northern-France coordinates).
- `Card.DecodeErrors` is empty on a clean Gen2v2 driver card.

All decoder TODOs from the prior revision of this file have been
resolved against the cited EU specifications (mirrored under
`docs/legislation/`):

| Was-unverified | Resolution | Spec § |
|---|---|---|
| EF_Places Gen2 record width | 21 bytes (Gen1 10 + GNSSPlaceRecord 11) | App. 1 §2.117 + §2.79 |
| EF_Places pointer width | 1 byte Gen1 / 2 bytes Gen2 (per `placePointerNewestRecord` row in §TCS_150) | App. 2 §TCS_150 |
| GeoCoordinates byte width | 6 bytes (3 + 3, signed 24-bit) | App. 1 §2.76 |
| GeoCoordinates encoding | DDMM.M / DDDMM.M ×10 (sample-card 0x00C8F5 = 51445 → 51.7417°N) | App. 1 §2.76 |
| EF_GNSS_Places FID | `0x0524` (not `0x0525` — that's Application_Identification_V2) | App. 2 §TCS_152 |
| GNSS record width | 18 bytes (outer TimeReal 4 + GNSSPlaceRecord 11 + OdometerShort 3) | App. 1 §2.79 |
| EF_Vehicles_Used Gen2 record width | 48 bytes (Gen1 31 + VIN 17) — confirmed by §TCS_154 (n3=200, body=9602) | App. 2 §TCS_154 |
| EF_Events/Faults record width | 24 bytes uniformly across Gen1/Gen2 — confirmed by §TCS_150 + §TCS_154 | App. 2 §TCS_150 |
| `TypeDataGen2v2 = 0x04` constant | Removed — Gen2v2 uses the existing `0x02` type byte; version is implicit in `cardStructureVersion = {01 01}` | 2021/1228 §TCS_152 |

## What works with high confidence

- TLV framing (`internal/tlv/`) — fuzz-tested ~500k execs, no panics
- All Appendix 1 primitives (`internal/primitives/`)
- Every Gen1 + Gen2v1 EF the existing UI consumes:
  Identification, Driver_Activity, Places, Vehicles_Used, Events_Data,
  Faults_Data, GNSS_Places.

## Recognised-but-not-decoded EFs (Gen2v2-only)

These dispatch to a silent no-op in `parser.go::dispatchCardEF`. They
appear on Gen2v2 cards (the sample has all of them) but the existing UI
doesn't consume them, so they're deferred:

| FID | EF | What it holds |
|---|---|---|
| `0x0525` | Application_Identification_V2 | Buffer-size counters for the v2 EFs below |
| `0x0526` | Places_Authentication | Per-PlaceRecord GNSS authentication status (5-byte records) |
| `0x0527` | GNSS_Places_Authentication | Per-GNSS-record authentication status (5-byte records) |
| `0x0528` | Border_Crossings | 17-byte CardBorderCrossingRecord × 1120 |
| `0x0529` | Load_Unload_Operations | 20-byte records × 1624 |
| `0x0530` | Load_Type_Entries | 5-byte records × 336 |
| `0x0531` | VU_Configuration | Cardholder-specific VU settings, up to 3072 bytes |

When the UI grows surfaces for these (e.g. a Border-Crossings panel,
GNSS-authentication badge), wire each decoder into `internal/card/` and
add a dispatch case. Spec citations are in `docs/parser-migration-plan.md`.

## Deferred to Phase B

- Signature verification (Gen1 RSA, Gen2 ECDSA over Brainpool curves,
  ERCA → MSCA → equipment cert-chain validation)
- `ddd.Card.Verified` / `SignatureSummary` fields are present on the
  output type but always read false until Phase B lands

## Deferred to Phase C

- VU file parsing — `ParseVU` returns "not implemented"
- The desktop app still rejects non-card files at `apps/desktop/app.go`

# go-ddd Phase A status

Phase A is wired end-to-end: `apps/desktop` parses `.ddd` files exclusively
through `github.com/jakewtaylor/go-ddd` and the AGPL `tachoparser` dependency
has been removed.

Every decoder has unit-test coverage against synthetic byte sequences
constructed from the spec. **None has been validated against a real
`.ddd` sample** — that's the work the user needs to do once they're back
at the macOS machine that has the sample card file.

## How to validate

From the repo root:

```
cd apps/desktop
go test -run TestImportSampleCard -v ./...
```

The test imports `../../C_20260509_1146_M_TAYLOR_DB141641620128.ddd`,
runs it through the full importer pipeline, and asserts:

1. Driver card number prefix `DB14164162012802`
2. Driver name "TAYLOR" / "MARK"
3. ≥ 100 daily records
4. ≥ 1 place record
5. Dedup behaviour (re-import returns AlreadyImported)
6. ListDrivers returns exactly 1 driver

Any failure is a real bug in one of the EF decoders, since the test was
green against tachoparser. The likely culprits, ranked:

## Known-uncertain areas (TODOs)

1. **`EF_GNSS_Places` GeoCoordinate scale factor**
   File: `packages/go-ddd/internal/card/ef_gnss.go`, `geoCoordinateToDegrees`.
   Chosen divisor = 10000 (matches the spec's value-range bound of
   ±1800000 for ±180°). The spec text describes the unit as "1/10 of a
   degree minute" which would imply 600 — but that doesn't fit the
   bound. If the map shows points in the wrong location after a real
   import, this is the first place to check.

2. **`EF_Driver_Activity_Data` cyclic-buffer wrap edge cases**
   File: `packages/go-ddd/internal/card/ef_driver_activity.go`.
   The buffer is linearised by rotating around `oldestPtr`, then walked
   record-by-record using `activityRecordLength`. Tested for the
   happy path (linear) and the wraparound case (record straddles the
   physical buffer boundary). Untested: malformed records mid-buffer,
   empty buffer with non-zero pointers, daily record with zero changes.

3. **`EF_Vehicles_Used` Gen2 layout**
   File: `packages/go-ddd/internal/card/ef_vehicles_used.go`.
   Gen2 record size assumed to be 48 bytes (Gen1 31 + VIN 17). Width
   is auto-detected from the body length; if the real Gen2 body uses
   a different width, decoding will fail loudly with "array length does
   not divide evenly".

4. **`EF_Places` pointer width**
   File: `packages/go-ddd/internal/card/ef_places.go`.
   First tries a 1-byte pointer; on failure retries with a 2-byte
   pointer. The retry was a defensive measure — only one of the two is
   correct per the spec, and the wrong one might still divide cleanly
   for some array sizes.

5. **`EF_Events_Data` / `EF_Faults_Data` Gen2 record width**
   File: `packages/go-ddd/internal/card/ef_events_faults.go`.
   Currently assumes 24-byte records uniformly. Gen2 may extend the
   record (e.g. additional fields for security events). If the body
   length isn't a multiple of 24, decoding fails — easy to spot.

## What's working with high confidence

- TLV framing (`internal/tlv/`) — fuzz-tested ~500k execs, no panics
- All Appendix 1 primitives (`internal/primitives/`)
- `EF_Identification` byte layout — the 143-byte body structure is
  unambiguous in the spec and matches what tachoparser outputs

## Deferred to Phase B

- Signature verification (Gen1 RSA, Gen2 ECDSA over Brainpool curves,
  ERCA → MSCA → equipment cert-chain validation)
- `ddd.Card.Verified` / `SignatureSummary` fields are present on the
  output type but always read false until Phase B lands

## Deferred to Phase C

- VU file parsing — `ParseVU` returns "not implemented"
- The desktop app still rejects non-card files at `apps/desktop/app.go:218-220`

# Embedded ERCA root keys

This directory contains the European Root Certificate Authority (ERCA)
public keys that anchor the signature-verification chain for both
generations of digital tachograph cards.

## Files

| File | Generation | Format |
|---|---|---|
| `erca_gen1.bin` | Gen1 (Reg. (EC) 1360/2002) | Raw 132-byte RSA-1024 public key: `modulus(128) \|\| exponent(4)` |
| `erca_gen2.bin` | Gen2 (Reg. (EU) 2016/799) | 194-byte ERCA self-signed Gen2 certificate (DER-TLV, full cert format incl. outer 7F21 wrapper) — exposes its public key after self-verification |

The files are loaded via `go:embed` at compile time; the verifier
constructors in `package ddd` fall back to a clear `errMissingERCAKey`
error if the file is empty (which is the default in this repo — the
keys are NOT distributed with the source).

## Refreshing

The keys are published by the JRC at
[`dtc.jrc.ec.europa.eu`](https://dtc.jrc.ec.europa.eu/) under
**Public Key Certificates** → **DT** (Gen1) and **ST** (Gen2).

Run the bundled CLI to download them:

```bash
go run ./cmd/refresh-pks/
```

The CLI:

1. Fetches the JRC's PKI index page (browser-style headers required —
   the server rejects plain curl/automated clients with HTTP 403).
2. Resolves the link to the ERCA root key file for the requested
   generation.
3. Writes the bytes into this directory.

Once written, recompile go-ddd and the embedded constructors light up.

## Why aren't the keys committed?

Two reasons:

1. **Licensing clarity** — the JRC publishes the keys publicly but
   doesn't grant an explicit redistribution licence; embedding them in
   a third-party MIT module like `go-ddd` is a grey area. Asking
   consumers to fetch their own copy keeps `go-ddd` cleanly MIT.
2. **Rotation safety** — keys do eventually rotate. Pulling fresh
   from JRC at build time ensures no consumer ships a stale root.

Synthetic-key tests in `verifier_gen1_test.go` and
`verifier_gen2_test.go` exercise the full verification pipeline
without needing real ERCA keys, so the package compiles and tests
green even with empty `.bin` files.

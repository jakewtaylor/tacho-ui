# go-ddd

A pure-Go parser for EU digital-tachograph `.ddd` files (driver cards and
vehicle units), MIT-licensed.

Status: **work in progress**. The Appendix 1 primitives (`TimeReal`,
`BCDString`, `Datef`, `IA5String`, `Name`, `ExtendedSerialNumber`, …) and
the Appendix 7 TLV framing are implemented and tested. Card EF body
decoders and VU TREP block decoders are being added incrementally.

## Why

The most well-known existing Go library (`github.com/traconiq/tachoparser`)
is AGPL-3.0, which is incompatible with proprietary distribution. `go-ddd`
is a clean-room reimplementation from the public EU specifications, MIT
licensed, so it can be embedded in commercial products without copyleft
obligations.

## References

All decoders are derived solely from the public EU regulations published
on [EUR-Lex](https://eur-lex.europa.eu):

- Regulation (EU) 165/2014
- Commission Implementing Regulation (EU) 2016/799, Annex IC
  - Appendix 1 — Data dictionary
  - Appendix 2 — Tachograph cards specification
  - Appendix 7 — Data downloading protocols
  - Appendix 11 — Common security mechanisms

No code is copied from any other parser implementation.

## Usage

```go
import (
    "os"

    ddd "github.com/jakewtaylor/go-ddd"
)

data, _ := os.ReadFile("C_card.ddd")
card, err := ddd.ParseCard(data)
if err != nil {
    // …
}
// card.Identification1, card.DriverActivity1, etc.
```

## CLI

`cmd/ddd-decode` is a small reference CLI that parses a `.ddd` and emits
its contents as JSON. Useful for spot checks and as a one-shot decoder.

```sh
go run ./cmd/ddd-decode < C_card.ddd > out.json
```

// Package ddd parses EU digital-tachograph .ddd files (driver cards and
// vehicle units) per Commission Implementing Regulation (EU) 2016/799
// Annex IC. It is a clean-room implementation; the parser is derived
// solely from the public EU regulations, with no code reuse from other
// parser implementations.
//
// The two entry points are ParseCard and ParseVU. Each returns a typed
// struct that mirrors the EU data dictionary closely while remaining
// JSON-marshalable into a stable shape suitable for downstream
// consumption.
//
// References (all EUR-Lex public domain):
//   - Regulation (EU) 165/2014
//   - Commission Implementing Regulation (EU) 2016/799 Annex IC
//     Appendix 1  — Data dictionary
//     Appendix 2  — Tachograph cards specification
//     Appendix 7  — Data downloading protocols
//     Appendix 11 — Common security mechanisms
package ddd

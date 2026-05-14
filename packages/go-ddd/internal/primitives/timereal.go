// Package primitives implements the atomic data types defined in
// Commission Implementing Regulation (EU) 2016/799 Annex IC Appendix 1
// (Data Dictionary). Each file maps to one (or a small group of) related
// dictionary entries; the implementation here is byte-level and stateless.
package primitives

import (
	"fmt"
	"time"
)

// TimeReal — Appendix 1 §2.162.
//
// 4-byte unsigned big-endian integer holding the number of seconds elapsed
// since 1970-01-01 00:00:00 UTC. The dictionary explicitly notes that this
// timestamp is UTC and is interpreted as Unix time, so we delegate to
// time.Unix and force the result into UTC.
//
// A zero value (0x00000000) is the EU-specified "no value" sentinel — we
// pass it through as the Go zero time so downstream JSON serialisation
// yields "0001-01-01T00:00:00Z", matching the behaviour of upstream
// parsers that use Go's time.Time zero value for missing fields.
func TimeReal(data []byte) (time.Time, error) {
	if len(data) < 4 {
		return time.Time{}, fmt.Errorf("primitives: TimeReal needs 4 bytes, got %d", len(data))
	}
	secs := uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3])
	if secs == 0 {
		return time.Time{}, nil
	}
	return time.Unix(int64(secs), 0).UTC(), nil
}

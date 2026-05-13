package primitives

import "fmt"

// BCDString — Appendix 1 §2.10. A sequence of bytes where each nibble
// holds a decimal digit 0–9; the high nibble of byte n is digit 2n,
// the low nibble is digit 2n+1. The decoded value is the concatenation
// of those digits as an ASCII string.
//
// Invalid nibbles (>9) are returned as an error rather than silently
// substituted, so callers can decide whether to skip the field. The
// dictionary specifies BCD as decimal-only.
func BCDString(data []byte) (string, error) {
	out := make([]byte, 0, len(data)*2)
	for i, b := range data {
		hi := b >> 4
		lo := b & 0x0F
		if hi > 9 || lo > 9 {
			return "", fmt.Errorf("primitives: BCDString invalid nibble at byte %d: %02x", i, b)
		}
		out = append(out, '0'+hi, '0'+lo)
	}
	return string(out), nil
}

// UnsignedBCD decodes the same byte sequence as BCDString but returns
// the numeric value. Used by Datef sub-fields (year/month/day) and any
// other field where the BCD digits represent a number.
func UnsignedBCD(data []byte) (uint64, error) {
	s, err := BCDString(data)
	if err != nil {
		return 0, err
	}
	var n uint64
	for _, c := range []byte(s) {
		n = n*10 + uint64(c-'0')
	}
	return n, nil
}

package primitives

import "fmt"

// Uint big-endian decoder for the variable-width unsigned integers used
// throughout Appendix 1 (1, 2, 3, 4 byte widths).
func Uint(data []byte) (uint64, error) {
	if len(data) == 0 || len(data) > 8 {
		return 0, fmt.Errorf("primitives: Uint width %d out of range", len(data))
	}
	var v uint64
	for _, b := range data {
		v = (v << 8) | uint64(b)
	}
	return v, nil
}

// Int32BE — signed 32-bit big-endian integer. Used by GNSS coordinate
// fields (latitude/longitude in milli-arcseconds).
func Int32BE(data []byte) (int32, error) {
	if len(data) < 4 {
		return 0, fmt.Errorf("primitives: Int32BE needs 4 bytes, got %d", len(data))
	}
	u := uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3])
	return int32(u), nil
}

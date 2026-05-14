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

// Int32BE — signed 32-bit big-endian integer.
func Int32BE(data []byte) (int32, error) {
	if len(data) < 4 {
		return 0, fmt.Errorf("primitives: Int32BE needs 4 bytes, got %d", len(data))
	}
	u := uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3])
	return int32(u), nil
}

// Int24BE — signed 24-bit big-endian integer. Used by GeoCoordinates
// (App. 1 §2.76: latitude INTEGER(-90000..90001), longitude
// INTEGER(-180000..180001) — both fit in 24-bit signed, octet aligned).
// Implementation: sign-extend the top byte into bit 24+.
func Int24BE(data []byte) (int32, error) {
	if len(data) < 3 {
		return 0, fmt.Errorf("primitives: Int24BE needs 3 bytes, got %d", len(data))
	}
	v := int32(data[0])<<16 | int32(data[1])<<8 | int32(data[2])
	if v&0x00800000 != 0 {
		v |= ^int32(0x00FFFFFF) // sign-extend
	}
	return v, nil
}

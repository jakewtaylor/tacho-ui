package card

import (
	"encoding/binary"
	"fmt"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// BorderCrossingRecord is one decoded slot of EF_Border_Crossings, the
// Gen2v2-only EF that logs every detected change of country.
//
// Source: 2021/1228 §2.11b CardBorderCrossingRecord. Byte layout
// (17 bytes total):
//
//	countryLeft           NationNumeric          — 1 byte
//	countryEntered        NationNumeric          — 1 byte
//	gnssPlaceAuthRecord   GNSSPlaceAuthRecord    — 12 bytes
//	vehicleOdometerValue  OdometerShort          — 3 bytes
type BorderCrossingRecord struct {
	CountryLeft    int // NationNumeric; 0xFF = "Rest of the World"
	CountryEntered int
	GnssPlaceAuth  GnssPlaceAuth
	Odometer       int
}

const borderCrossingRecordLen = 17

// DecodeBorderCrossings parses an EF_Border_Crossings body.
// Layout: 2-byte borderCrossingPointerNewestRecord + cyclic array.
// 2021/1228 §TCS_155 n10 fixes NoOfBorderCrossingRecords = 1120 on a
// Gen2v2 driver card, so a full body is 2 + 1120 × 17 = 19042 bytes.
func DecodeBorderCrossings(body []byte) ([]BorderCrossingRecord, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: EF_Border_Crossings body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]
	if len(arr)%borderCrossingRecordLen != 0 {
		return nil, fmt.Errorf("card: EF_Border_Crossings array length %d not a multiple of %d",
			len(arr), borderCrossingRecordLen)
	}
	count := len(arr) / borderCrossingRecordLen
	if count == 0 {
		return nil, nil
	}
	if pointer >= count {
		pointer = count - 1
	}

	out := make([]BorderCrossingRecord, 0, count)
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*borderCrossingRecordLen : (idx+1)*borderCrossingRecordLen]
		rec, ok, err := decodeOneBorderCrossing(slot)
		if err != nil {
			return nil, fmt.Errorf("card: EF_Border_Crossings slot %d: %w", idx, err)
		}
		if ok {
			out = append(out, rec)
		}
	}
	return out, nil
}

func decodeOneBorderCrossing(slot []byte) (BorderCrossingRecord, bool, error) {
	gpa, err := decodeGnssPlaceAuth(slot[2:14])
	if err != nil {
		return BorderCrossingRecord{}, false, fmt.Errorf("gnssPlaceAuth: %w", err)
	}
	// Empty-slot sentinel: zero timestamp means no event was recorded
	// in this slot. Skip without emitting a record.
	if gpa.TimeStamp.IsZero() {
		return BorderCrossingRecord{}, false, nil
	}
	odo, err := primitives.Uint(slot[14:17])
	if err != nil {
		return BorderCrossingRecord{}, false, fmt.Errorf("odometer: %w", err)
	}
	return BorderCrossingRecord{
		CountryLeft:    int(slot[0]),
		CountryEntered: int(slot[1]),
		GnssPlaceAuth:  gpa,
		Odometer:       int(odo),
	}, true, nil
}

package card

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// GnssRecord is one decoded GNSS sample from EF_GNSS_Places or
// EF_GNSS_Places_Auth (Gen2 / Gen2v2 only).
type GnssRecord struct {
	TimeStamp time.Time
	Latitude  float64 // decimal degrees, +N / -S
	Longitude float64 // decimal degrees, +E / -W
	Odometer  int     // km
}

// GnssRecord byte layout (Appendix 1 §2.79 GNSSAccumulatedDrivingRecord):
//
//	TimeReal              timeStamp        — 4 bytes (outer record timestamp)
//	GNSSPlaceRecord       gnssPlaceRecord  — 13 bytes:
//	    TimeReal             timeStamp     — 4 bytes (GNSS fix timestamp)
//	    GNSSAccuracy         accuracy      — 1 byte
//	    GeoCoordinates       coords        — 8 bytes (4-byte lat + 4-byte lng)
//	OdometerShort         odometer         — 3 bytes
//
// Total: 4 + 13 + 3 = 20 bytes per record.
const gnssRecordLen = 20

// DecodeGnss parses an EF_GNSS_Places body. Layout: 2-byte pointer to
// newest + cyclic array of fixed-size records.
func DecodeGnss(body []byte) ([]GnssRecord, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: EF_GNSS_Places body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]
	if len(arr)%gnssRecordLen != 0 {
		// Some readers may use a 1-byte pointer; retry with that.
		pointer = int(body[0])
		arr = body[1:]
		if len(arr)%gnssRecordLen != 0 {
			return nil, fmt.Errorf("card: EF_GNSS_Places array length %d not a multiple of %d",
				len(arr), gnssRecordLen)
		}
	}
	count := len(arr) / gnssRecordLen
	if pointer >= count {
		pointer = count - 1
		if pointer < 0 {
			pointer = 0
		}
	}
	out := make([]GnssRecord, 0, count)
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*gnssRecordLen : (idx+1)*gnssRecordLen]
		rec, ok, err := decodeOneGnss(slot)
		if err != nil {
			return nil, fmt.Errorf("card: EF_GNSS_Places slot %d: %w", idx, err)
		}
		if ok {
			out = append(out, rec)
		}
	}
	return out, nil
}

func decodeOneGnss(slot []byte) (GnssRecord, bool, error) {
	outerTS, err := primitives.TimeReal(slot[0:4])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("outer timestamp: %w", err)
	}
	if outerTS.IsZero() {
		return GnssRecord{}, false, nil
	}
	// gnssPlaceRecord starts at offset 4: timeStamp (4) + accuracy (1) + coords (8) = 13 bytes
	// Inner timestamp at slot[4:8] (currently unused — we trust the outer one).
	// accuracy at slot[8] (also unused).
	latRaw, err := primitives.Int32BE(slot[9:13])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("latitude: %w", err)
	}
	lngRaw, err := primitives.Int32BE(slot[13:17])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("longitude: %w", err)
	}
	odo, err := primitives.Uint(slot[17:20])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("odometer: %w", err)
	}

	return GnssRecord{
		TimeStamp: outerTS,
		Latitude:  geoCoordinateToDegrees(latRaw),
		Longitude: geoCoordinateToDegrees(lngRaw),
		Odometer:  int(odo),
	}, true, nil
}

// geoCoordinateToDegrees converts the on-wire signed integer to
// decimal degrees.
//
// TODO(validate-against-card): the EU 2016/799 Appendix 1 §2.76 spec
// gives the value range as -1800000..1800000 for a GeoCoordinate, which
// corresponds to ±180°. The dictionary text describes the unit as
// "1/10 of a degree minute" (i.e. 1/600 degree), but ±1800000 × (1/600)
// = ±3000°, which can't be right. Using the divisor that matches the
// value-range bound: 1800000 / 180 = 10000, so divisor = 10000.
//
// This formula is consistent with the documented bounds but UNVERIFIED
// against a real Gen2 card. When a sample is available, validate by
// confirming that a known fix (e.g. ~51.5°N / 0°E for London) decodes
// to the expected coordinates.
func geoCoordinateToDegrees(raw int32) float64 {
	return float64(raw) / 10000.0
}

package card

import (
	"encoding/binary"
	"fmt"
	"math"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// GnssRecord is one decoded GNSS sample from EF_GNSS_Places (Gen2) or
// EF_GNSS_Places_Authentication (Gen2v2).
type GnssRecord struct {
	TimeStamp time.Time
	Latitude  float64 // decimal degrees, +N / -S
	Longitude float64 // decimal degrees, +E / -W
	Odometer  int     // km
}

// GNSSAccumulatedDrivingRecord byte layout (Reg. 2016/799 Annex IC
// App. 1 §2.79 + §2.79b):
//
//	TimeReal           timeStamp        — 4 bytes  (outer record timestamp,
//	                                                  written when accumulated
//	                                                  driving reaches a multiple
//	                                                  of three hours)
//	GNSSPlaceRecord    gnssPlaceRecord  — 11 bytes:
//	    TimeReal           timeStamp    — 4 bytes (GNSS fix timestamp)
//	    GNSSAccuracy       accuracy     — 1 byte  (App. 1 §2.77)
//	    GeoCoordinates     coords       — 6 bytes (lat 3 + lng 3, signed,
//	                                                App. 1 §2.76)
//	OdometerShort      vehicleOdometer  — 3 bytes (App. 1 §2.113)
//
// Total: 4 + 11 + 3 = 18 bytes per record.
//
// The cyclic buffer holds NoOfGNSSADRecords = 336 records on a Gen2v2
// driver card (2021/1228 §TCS_155 n8), preceded by a 2-byte pointer to
// the newest slot.
const gnssRecordLen = 18

// DecodeGnss parses an EF_GNSS_Places body. Pointer is 2 bytes,
// followed by a fixed cyclic array of 18-byte records.
func DecodeGnss(body []byte) ([]GnssRecord, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: EF_GNSS_Places body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]
	if len(arr)%gnssRecordLen != 0 {
		return nil, fmt.Errorf("card: EF_GNSS_Places array length %d not a multiple of %d",
			len(arr), gnssRecordLen)
	}
	count := len(arr) / gnssRecordLen
	if count == 0 {
		return nil, nil
	}
	if pointer >= count {
		pointer = count - 1
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
	// Inner timestamp at slot[4:8] (currently unused — outer is canonical).
	// Accuracy at slot[8] (also unused).
	latRaw, err := primitives.Int24BE(slot[9:12])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("latitude: %w", err)
	}
	lngRaw, err := primitives.Int24BE(slot[12:15])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("longitude: %w", err)
	}
	odo, err := primitives.Uint(slot[15:18])
	if err != nil {
		return GnssRecord{}, false, fmt.Errorf("odometer: %w", err)
	}

	return GnssRecord{
		TimeStamp: outerTS,
		Latitude:  geoCoordinateToDegrees(latRaw, false),
		Longitude: geoCoordinateToDegrees(lngRaw, true),
		Odometer:  int(odo),
	}, true, nil
}

// geoCoordinateToDegrees converts the on-wire signed integer to decimal
// degrees, per Reg. 2016/799 Annex IC App. 1 §2.76.
//
// The spec text: "latitude is encoded as a multiple (factor 10) of the
// ±DDMM.M representation. longitude is encoded as a multiple (factor 10)
// of the ±DDDMM.M representation." So the raw value N relates to
// degrees-and-minutes as N = (DDD * 100 + MM.M) * 10, i.e.:
//
//	deg          = |N| / 1000
//	minutes × 10 = |N| % 1000
//	result       = sign × (deg + (minutes × 10) / 600)
//
// Worked example: lat 0x00C8F5 = 51445 → 51° 44.5′ N → 51.7417° decimal,
// which matches the sample card's first GNSS fix (UK).
//
// Sentinel: returns NaN when the raw value is outside the spec's valid
// range — latitude `INTEGER(-90000..90001)` (App. 1 §2.76), longitude
// `INTEGER(-180000..180001)`. The 90001 / 180001 "+1" values are
// reserved by the spec for "no information available". Some VUs also
// emit 0x7FFFFF (or other unconstrained 24-bit values) when no GPS fix
// is available, which the spec doesn't formally cover but is the
// pragmatic signal we treat as "no fix" here. The caller is expected
// to filter NaN coordinates out of any downstream rendering.
//
// `isLng` selects which range to enforce. Latitude uses ±90001;
// longitude uses ±180001.
func geoCoordinateToDegrees(raw int32, isLng bool) float64 {
	maxRaw := int32(90001)
	if isLng {
		maxRaw = 180001
	}
	if raw > maxRaw || raw < -maxRaw {
		return math.NaN()
	}
	if raw == 0 {
		return 0
	}
	sign := 1.0
	abs := int64(raw)
	if abs < 0 {
		sign = -1.0
		abs = -abs
	}
	deg := abs / 1000
	minutesTenths := abs - deg*1000 // 0..999, i.e. minutes × 10
	return sign * (float64(deg) + float64(minutesTenths)/600.0)
}


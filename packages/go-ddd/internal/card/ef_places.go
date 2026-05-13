package card

import (
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// PlaceRecord — Appendix 1 §2.117. One driver "place" entry, marking
// shift start, shift end, or country change.
type PlaceRecord struct {
	EntryTime                time.Time
	EntryTypeDailyWorkPeriod int
	DailyWorkPeriodCountry   int
	DailyWorkPeriodRegion    int
	VehicleOdometerValue     int
}

// Gen1 PlaceRecord byte layout (Appendix 1 §2.117):
//
//	TimeReal      entryTime                — 4 bytes
//	EntryType     entryTypeDailyWorkPeriod — 1 byte enum
//	NationNumeric dailyWorkPeriodCountry   — 1 byte
//	RegionNumeric dailyWorkPeriodRegion    — 1 byte
//	OdometerShort vehicleOdometerValue     — 3 bytes
//
// Total: 10 bytes.
const placeRecordLen = 10

// Gen2 appends an optional GNSS sub-record (timeStamp + accuracy +
// geoCoordinates = 13 bytes), yielding 23 bytes total. Gen2v2 keeps the
// same layout.
const placeRecordLenGen2 = 23

// DecodePlaces parses EF_Places. Body = 1-byte pointer to newest +
// fixed cyclic array. The record width is auto-detected from the array
// length so both generations are supported.
func DecodePlaces(body []byte) ([]PlaceRecord, error) {
	if len(body) < 1 {
		return nil, fmt.Errorf("card: EF_Places body too short: %d bytes", len(body))
	}
	pointer := int(body[0])
	arr := body[1:]

	recordLen, err := pickRecordWidth(len(arr), placeRecordLen, placeRecordLenGen2)
	if err != nil {
		// Fall back to a 2-byte pointer interpretation — some readers
		// emit a wider pointer.
		if len(body) >= 2 {
			pointer = int(body[0])<<8 | int(body[1])
			arr = body[2:]
			recordLen, err = pickRecordWidth(len(arr), placeRecordLen, placeRecordLenGen2)
		}
		if err != nil {
			return nil, fmt.Errorf("card: EF_Places: %w", err)
		}
	}
	count := len(arr) / recordLen
	if pointer >= count {
		pointer = count - 1
	}

	out := make([]PlaceRecord, 0, count)
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*recordLen : (idx+1)*recordLen]
		rec, ok, err := decodeOnePlaceRecord(slot)
		if err != nil {
			return nil, fmt.Errorf("card: EF_Places slot %d: %w", idx, err)
		}
		if ok {
			out = append(out, rec)
		}
	}
	return out, nil
}

func decodeOnePlaceRecord(slot []byte) (PlaceRecord, bool, error) {
	entryTime, err := primitives.TimeReal(slot[0:4])
	if err != nil {
		return PlaceRecord{}, false, fmt.Errorf("entryTime: %w", err)
	}
	// Sentinel for unused slot.
	if entryTime.IsZero() {
		return PlaceRecord{}, false, nil
	}
	odo, err := primitives.Uint(slot[7:10])
	if err != nil {
		return PlaceRecord{}, false, fmt.Errorf("odometer: %w", err)
	}
	return PlaceRecord{
		EntryTime:                entryTime,
		EntryTypeDailyWorkPeriod: int(slot[4]),
		DailyWorkPeriodCountry:   int(slot[5]),
		DailyWorkPeriodRegion:    int(slot[6]),
		VehicleOdometerValue:     int(odo),
	}, true, nil
}

package card

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// LoadUnloadRecord is one decoded slot of EF_Load_Unload_Operations,
// the Gen2v2-only EF that logs cargo load and unload events.
//
// Source: 2021/1228 §2.24d CardLoadUnloadRecord. Byte layout (20 bytes
// total):
//
//	timeStamp             TimeReal               — 4 bytes
//	operationType         OperationType          — 1 byte enum
//	gnssPlaceAuthRecord   GNSSPlaceAuthRecord    — 12 bytes
//	vehicleOdometerValue  OdometerShort          — 3 bytes
type LoadUnloadRecord struct {
	TimeStamp     time.Time // when the operation was entered
	OperationType OperationType
	GnssPlaceAuth GnssPlaceAuth
	Odometer      int
}

// OperationType enumerates the 2021/1228 §2.114a values.
type OperationType int

const (
	OpUnknown               OperationType = -1
	OpLoad                  OperationType = 1
	OpUnload                OperationType = 2
	OpSimultaneousLoadUnload OperationType = 3
)

// String reports a stable token for JSON output / SQL storage.
func (o OperationType) String() string {
	switch o {
	case OpLoad:
		return "load"
	case OpUnload:
		return "unload"
	case OpSimultaneousLoadUnload:
		return "simultaneous"
	default:
		return "unknown"
	}
}

const loadUnloadRecordLen = 20

// DecodeLoadUnload parses an EF_Load_Unload_Operations body.
// Layout: 2-byte loadUnloadPointerNewestRecord + cyclic array.
// 2021/1228 §TCS_155 n11: NoOfLoadUnloadRecords = 1624 on a Gen2v2
// driver card; full body is 2 + 1624 × 20 = 32482 bytes.
func DecodeLoadUnload(body []byte) ([]LoadUnloadRecord, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: EF_Load_Unload_Operations body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]
	if len(arr)%loadUnloadRecordLen != 0 {
		return nil, fmt.Errorf("card: EF_Load_Unload_Operations array length %d not a multiple of %d",
			len(arr), loadUnloadRecordLen)
	}
	count := len(arr) / loadUnloadRecordLen
	if count == 0 {
		return nil, nil
	}
	if pointer >= count {
		pointer = count - 1
	}

	out := make([]LoadUnloadRecord, 0, count)
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*loadUnloadRecordLen : (idx+1)*loadUnloadRecordLen]
		rec, ok, err := decodeOneLoadUnload(slot)
		if err != nil {
			return nil, fmt.Errorf("card: EF_Load_Unload_Operations slot %d: %w", idx, err)
		}
		if ok {
			out = append(out, rec)
		}
	}
	return out, nil
}

func decodeOneLoadUnload(slot []byte) (LoadUnloadRecord, bool, error) {
	ts, err := primitives.TimeReal(slot[0:4])
	if err != nil {
		return LoadUnloadRecord{}, false, fmt.Errorf("timeStamp: %w", err)
	}
	if ts.IsZero() {
		return LoadUnloadRecord{}, false, nil
	}
	var op OperationType
	switch slot[4] {
	case 0x01:
		op = OpLoad
	case 0x02:
		op = OpUnload
	case 0x03:
		op = OpSimultaneousLoadUnload
	default:
		op = OpUnknown
	}
	gpa, err := decodeGnssPlaceAuth(slot[5:17])
	if err != nil {
		return LoadUnloadRecord{}, false, fmt.Errorf("gnssPlaceAuth: %w", err)
	}
	odo, err := primitives.Uint(slot[17:20])
	if err != nil {
		return LoadUnloadRecord{}, false, fmt.Errorf("odometer: %w", err)
	}
	return LoadUnloadRecord{
		TimeStamp:     ts,
		OperationType: op,
		GnssPlaceAuth: gpa,
		Odometer:      normalizeOdometer(odo),
	}, true, nil
}

package card

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// LoadTypeEntry is one decoded slot of EF_Load_Type_Entries, the
// Gen2v2-only EF that logs every time the driver changes the cargo
// kind (Goods / Passengers / Undefined).
//
// Source: 2021/1228 §2.24b CardLoadTypeEntryRecord. Byte layout (5
// bytes total):
//
//	timeStamp        TimeReal   — 4 bytes
//	loadTypeEntered  LoadType   — 1 byte enum
type LoadTypeEntry struct {
	TimeStamp time.Time
	LoadType  LoadType
}

// LoadType enumerates the 2021/1228 §2.90a values.
type LoadType int

const (
	LoadUndefined  LoadType = 0
	LoadGoods      LoadType = 1
	LoadPassengers LoadType = 2
	LoadUnknown    LoadType = -1
)

// String reports a stable token for JSON output / SQL storage.
func (l LoadType) String() string {
	switch l {
	case LoadGoods:
		return "goods"
	case LoadPassengers:
		return "passengers"
	case LoadUndefined:
		return "undefined"
	default:
		return "unknown"
	}
}

const loadTypeRecordLen = 5

// DecodeLoadType parses an EF_Load_Type_Entries body.
// Layout: 2-byte loadTypeEntryPointerNewestRecord + cyclic array of
// 5-byte records. 2021/1228 §TCS_155 n12: NoOfLoadTypeEntryRecords =
// 336 on a Gen2v2 driver card; full body is 2 + 336 × 5 = 1682 bytes.
func DecodeLoadType(body []byte) ([]LoadTypeEntry, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: EF_Load_Type_Entries body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]
	if len(arr)%loadTypeRecordLen != 0 {
		return nil, fmt.Errorf("card: EF_Load_Type_Entries array length %d not a multiple of %d",
			len(arr), loadTypeRecordLen)
	}
	count := len(arr) / loadTypeRecordLen
	if count == 0 {
		return nil, nil
	}
	if pointer >= count {
		pointer = count - 1
	}

	out := make([]LoadTypeEntry, 0, count)
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*loadTypeRecordLen : (idx+1)*loadTypeRecordLen]
		ts, err := primitives.TimeReal(slot[0:4])
		if err != nil {
			return nil, fmt.Errorf("card: EF_Load_Type_Entries slot %d timeStamp: %w", idx, err)
		}
		if ts.IsZero() {
			continue
		}
		var lt LoadType
		switch slot[4] {
		case 0x00:
			lt = LoadUndefined
		case 0x01:
			lt = LoadGoods
		case 0x02:
			lt = LoadPassengers
		default:
			lt = LoadUnknown
		}
		out = append(out, LoadTypeEntry{TimeStamp: ts, LoadType: lt})
	}
	return out, nil
}

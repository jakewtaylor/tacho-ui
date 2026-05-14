package card

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// DailyRecord is one decoded calendar day's activity, unwound from the
// cyclic buffer in EF_Driver_Activity_Data.
type DailyRecord struct {
	Date     time.Time
	Distance int
	Changes  []ActivityChange
}

// ActivityChange — App. 1 §2.1 ActivityChangeInfo. A single 2-byte
// word unpacked into named fields.
type ActivityChange struct {
	Driver      bool // true = driver slot (bit 15 = 0)
	Team        bool // true = crew operation (bit 14 = 1)
	CardPresent bool // true = card inserted (bit 13 = 0)
	WorkType    int  // 0=rest, 1=availability, 2=work, 3=driving (bits 12..11)
	Minutes     int  // minute of day, 0..1439 (bits 10..0)
}

// Activity buffer header (App. 1 §2.6 + App. 2 §4.2.3):
//
//	activityPointerOldestDayRecord: uint16 BE — byte offset of oldest record
//	activityPointerNewestRecord:    uint16 BE — byte offset of newest record
//	activityDailyRecords:           OCTET STRING (cyclic buffer)
//
// Each daily record (CardActivityDailyRecord, App. 1 §2.7) header:
//
//	activityPreviousRecordLength: uint16 BE (2)
//	activityRecordLength:         uint16 BE (2)
//	activityRecordDate:           TimeReal  (4)
//	activityDailyPresenceCounter: BCD       (2)
//	activityDayDistance:          uint16 BE (2)
//	activityChangeInfo[]:         ActivityChangeInfo (2 bytes each)
//
// dailyHeaderLen below counts everything before the variable-length
// activity-change array.
const dailyHeaderLen = 12

// DecodeDriverActivity unwinds EF_Driver_Activity_Data's cyclic buffer
// into a chronological slice of daily records (oldest first).
//
// The cyclic-buffer logic: records are appended one after another, with
// the newest record's start at activityPointerNewestRecord. When the
// buffer is full, new records overwrite the oldest. To iterate from
// oldest to newest we conceptually rotate the buffer so oldestPtr is at
// offset 0, then walk records by their declared length until we've
// covered every byte from oldest to (newest + newestRecordLength).
//
// Records that cross the physical buffer boundary are reassembled
// transparently because we double the buffer for the walk.
func DecodeDriverActivity(body []byte) ([]DailyRecord, error) {
	if len(body) < 4 {
		return nil, fmt.Errorf("card: EF_Driver_Activity_Data body too short: %d bytes", len(body))
	}
	oldest := int(binary.BigEndian.Uint16(body[0:2]))
	newest := int(binary.BigEndian.Uint16(body[2:4]))
	buf := body[4:]
	bufLen := len(buf)
	if bufLen == 0 {
		return nil, nil
	}
	if oldest >= bufLen || newest >= bufLen {
		return nil, fmt.Errorf("card: activity pointers out of range (oldest=%d newest=%d buf=%d)",
			oldest, newest, bufLen)
	}

	// Empty card: pointers identical and the record there has zero
	// length, or all bytes are zero. Probe the start to decide.
	if oldest == newest {
		// One record's worth of data is at oldest; if its length is 0
		// or its date is zero, treat as empty.
		hdr, err := peekRecord(buf, oldest)
		if err != nil || hdr.recordLength == 0 || hdr.date.IsZero() {
			return nil, nil
		}
	}

	// Build a linearised view starting at oldest, wrapping to oldest again.
	// Capacity is bufLen so we never read past the logical end.
	walk := make([]byte, bufLen)
	for i := 0; i < bufLen; i++ {
		walk[i] = buf[(oldest+i)%bufLen]
	}

	// The newest record's first byte sits at offset (newest - oldest) mod bufLen
	// within the linearised walk; we stop after consuming its bytes.
	newestOffset := (newest - oldest + bufLen) % bufLen

	var out []DailyRecord
	pos := 0
	for {
		if pos+dailyHeaderLen > bufLen {
			break
		}
		hdr, err := peekRecord(walk, pos)
		if err != nil {
			return nil, fmt.Errorf("card: activity record header at offset %d: %w", pos, err)
		}
		if hdr.recordLength < dailyHeaderLen || hdr.recordLength > bufLen-pos {
			// Malformed length — stop walking rather than spinning
			// indefinitely. Return what we have so far.
			break
		}
		body := walk[pos+dailyHeaderLen : pos+hdr.recordLength]
		changes, err := decodeActivityChanges(body)
		if err != nil {
			return nil, fmt.Errorf("card: activity changes at offset %d: %w", pos, err)
		}
		out = append(out, DailyRecord{
			Date:     hdr.date,
			Distance: int(hdr.distance),
			Changes:  changes,
		})
		if pos == newestOffset {
			break
		}
		pos += hdr.recordLength
		if pos >= bufLen {
			break
		}
	}
	return out, nil
}

type recordHeader struct {
	prevLength   int
	recordLength int
	date         time.Time
	distance     uint16
}

func peekRecord(walk []byte, pos int) (recordHeader, error) {
	if pos+dailyHeaderLen > len(walk) {
		return recordHeader{}, fmt.Errorf("truncated header at %d", pos)
	}
	prev := int(binary.BigEndian.Uint16(walk[pos : pos+2]))
	length := int(binary.BigEndian.Uint16(walk[pos+2 : pos+4]))
	date, err := primitives.TimeReal(walk[pos+4 : pos+8])
	if err != nil {
		return recordHeader{}, err
	}
	// bytes 8..10 = activityDailyPresenceCounter (BCD, unused here)
	distance := binary.BigEndian.Uint16(walk[pos+10 : pos+12])
	return recordHeader{
		prevLength:   prev,
		recordLength: length,
		date:         date,
		distance:     distance,
	}, nil
}

func decodeActivityChanges(body []byte) ([]ActivityChange, error) {
	if len(body)%2 != 0 {
		return nil, fmt.Errorf("activity change body length %d not a multiple of 2", len(body))
	}
	out := make([]ActivityChange, 0, len(body)/2)
	for i := 0; i < len(body); i += 2 {
		w := binary.BigEndian.Uint16(body[i : i+2])
		slot := (w >> 15) & 0x1        // bit 15
		crew := (w >> 14) & 0x1        // bit 14
		cardStatus := (w >> 13) & 0x1  // bit 13: 0 = inserted
		activity := int((w >> 11) & 0x3) // bits 12..11
		minutes := int(w & 0x7FF)      // bits 10..0
		out = append(out, ActivityChange{
			Driver:      slot == 0,
			Team:        crew == 1,
			CardPresent: cardStatus == 0,
			WorkType:    activity,
			Minutes:     minutes,
		})
	}
	return out, nil
}

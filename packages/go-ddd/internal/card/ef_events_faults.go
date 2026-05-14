package card

import (
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// EventOrFaultRecord — Appendix 1 §2.27 (CardEventRecord) and §2.74
// (CardFaultRecord). The two record types share the same byte layout
// so a single decoder serves both.
type EventOrFaultRecord struct {
	TypeCode           int
	BeginTime          time.Time
	EndTime            time.Time
	RegistrationNation int
	RegistrationNumber string
}

// Layout (Gen1):
//
//	EventFaultType  type      — 1 byte
//	TimeReal        begin     — 4 bytes
//	TimeReal        end       — 4 bytes
//	VehicleRegistration       — 15 bytes (1 nation + 14 regnum)
//
// Total: 24 bytes per record.
const eventFaultRecordLen = 24

// DecodeEventOrFaultBlock unwinds an EF_Events_Data or EF_Faults_Data
// body, which is a flat sequence of fixed-size records grouped into
// "buckets" by record type. The total number of records is derived from
// the body length.
//
// For downstream consumers that only iterate the flat list of records,
// the bucket boundaries are preserved as a single returned slice — the
// caller in parser.go re-buckets if it cares.
func DecodeEventOrFaultBlock(body []byte) ([]EventOrFaultRecord, error) {
	if len(body)%eventFaultRecordLen != 0 {
		return nil, fmt.Errorf("card: events/faults body length %d not a multiple of %d",
			len(body), eventFaultRecordLen)
	}
	count := len(body) / eventFaultRecordLen
	out := make([]EventOrFaultRecord, 0, count)
	for i := 0; i < count; i++ {
		slot := body[i*eventFaultRecordLen : (i+1)*eventFaultRecordLen]
		rec, ok, err := decodeOneEventFault(slot)
		if err != nil {
			return nil, fmt.Errorf("card: events/faults slot %d: %w", i, err)
		}
		if ok {
			out = append(out, rec)
		}
	}
	return out, nil
}

func decodeOneEventFault(slot []byte) (EventOrFaultRecord, bool, error) {
	begin, err := primitives.TimeReal(slot[1:5])
	if err != nil {
		return EventOrFaultRecord{}, false, fmt.Errorf("begin: %w", err)
	}
	if begin.IsZero() {
		return EventOrFaultRecord{}, false, nil
	}
	end, err := primitives.TimeReal(slot[5:9])
	if err != nil {
		return EventOrFaultRecord{}, false, fmt.Errorf("end: %w", err)
	}
	nation := int(slot[9])
	reg := primitives.CodePageString(slot[10], slot[11:24])
	return EventOrFaultRecord{
		TypeCode:           int(slot[0]),
		BeginTime:          begin,
		EndTime:            end,
		RegistrationNation: nation,
		RegistrationNumber: reg,
	}, true, nil
}

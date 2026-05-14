package card

import (
	"encoding/binary"
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// VehicleRecord is one decoded slot of EF_Vehicles_Used. Empty/sentinel
// slots (zero first-use date) are filtered out by the caller.
type VehicleRecord struct {
	OdometerBegin       int
	OdometerEnd         int
	FirstUse            time.Time
	LastUse             time.Time
	RegistrationNation  int
	RegistrationNumber  string
	VINIfPresent        string // Gen2 only; empty for Gen1
}

// CardVehicleRecord Gen1 byte layout (Appendix 1 §2.32):
//
//	OdometerShort vehicleOdometerBegin    — 3 bytes BE
//	OdometerShort vehicleOdometerEnd      — 3 bytes BE
//	TimeReal      vehicleFirstUse         — 4 bytes BE
//	TimeReal      vehicleLastUse          — 4 bytes BE
//	VehicleRegistrationIdentification     — 15 bytes
//	  NationNumeric registrationNation    — 1 byte
//	  VehicleRegistrationNumber           — 14 bytes (code page + 13 chars)
//	VuDataBlockCounter                    — 2 bytes BCD
//
// Total 31 bytes per record.
const cardVehicleRecordLen = 31

// Gen2 adds VehicleIdentificationNumber (VIN, 17 bytes IA5) after the
// counter, yielding 48 bytes per record. Reg. 2021/1228 (Gen2v2) keeps
// the same 48-byte layout.
const cardVehicleRecordLenGen2 = 48

// DecodeVehiclesUsed parses an EF_Vehicles_Used body. The body starts
// with a 2-byte pointer to the most recent slot, followed by a fixed
// cyclic array of records. The record width is inferred from the body
// length so the same decoder works for Gen1 (31-byte records) and Gen2
// (48-byte records).
func DecodeVehiclesUsed(body []byte) ([]VehicleRecord, error) {
	if len(body) < 2 {
		return nil, fmt.Errorf("card: EF_Vehicles_Used body too short: %d bytes", len(body))
	}
	pointer := int(binary.BigEndian.Uint16(body[:2]))
	arr := body[2:]

	recordLen, err := pickRecordWidth(len(arr), cardVehicleRecordLen, cardVehicleRecordLenGen2)
	if err != nil {
		return nil, fmt.Errorf("card: EF_Vehicles_Used: %w", err)
	}
	count := len(arr) / recordLen
	if pointer >= count {
		// pointer can be 0 on an empty card; otherwise it must index
		// into the array. Out-of-range is a non-fatal data oddity —
		// fall back to "decode every slot in physical order".
		pointer = count - 1
	}

	out := make([]VehicleRecord, 0, count)
	// Walk oldest-to-newest starting at (pointer+1) % count. Skip slots
	// whose first-use date is zero (unused).
	for i := 1; i <= count; i++ {
		idx := (pointer + i) % count
		slot := arr[idx*recordLen : (idx+1)*recordLen]
		rec, ok, err := decodeOneVehicleRecord(slot, recordLen == cardVehicleRecordLenGen2)
		if err != nil {
			return nil, fmt.Errorf("card: EF_Vehicles_Used slot %d: %w", idx, err)
		}
		if ok {
			out = append(out, rec)
		}
	}
	return out, nil
}

func decodeOneVehicleRecord(slot []byte, gen2 bool) (VehicleRecord, bool, error) {
	odoBegin, err := primitives.Uint(slot[0:3])
	if err != nil {
		return VehicleRecord{}, false, fmt.Errorf("odoBegin: %w", err)
	}
	odoEnd, err := primitives.Uint(slot[3:6])
	if err != nil {
		return VehicleRecord{}, false, fmt.Errorf("odoEnd: %w", err)
	}
	firstUse, err := primitives.TimeReal(slot[6:10])
	if err != nil {
		return VehicleRecord{}, false, fmt.Errorf("firstUse: %w", err)
	}
	lastUse, err := primitives.TimeReal(slot[10:14])
	if err != nil {
		return VehicleRecord{}, false, fmt.Errorf("lastUse: %w", err)
	}
	// Empty slot sentinel: no first-use timestamp.
	if firstUse.IsZero() && odoBegin == 0 && odoEnd == 0 {
		return VehicleRecord{}, false, nil
	}
	nation := int(slot[14])
	// VehicleRegistrationNumber: 14 bytes, 1 code page + 13 IA5 chars.
	reg := primitives.CodePageString(slot[15], slot[16:29])

	rec := VehicleRecord{
		OdometerBegin:      int(odoBegin),
		OdometerEnd:        int(odoEnd),
		FirstUse:           firstUse,
		LastUse:            lastUse,
		RegistrationNation: nation,
		RegistrationNumber: reg,
	}
	if gen2 {
		// VuDataBlockCounter is at 29..31; VIN at 31..48.
		rec.VINIfPresent = primitives.IA5String(slot[31:48])
	}
	return rec, true, nil
}

// pickRecordWidth chooses the record size that evenly divides the
// array length. EFs are fixed-size so exactly one width should fit.
func pickRecordWidth(arrayLen int, widths ...int) (int, error) {
	for _, w := range widths {
		if w > 0 && arrayLen%w == 0 && arrayLen/w > 0 {
			return w, nil
		}
	}
	return 0, fmt.Errorf("array length %d does not divide evenly by any expected record width %v", arrayLen, widths)
}

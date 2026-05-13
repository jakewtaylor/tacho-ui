package card

import (
	"encoding/binary"
	"testing"
	"time"
)

// makeVehicleSlot constructs one Gen1 31-byte record. Empty=true
// produces a zero-valued slot that the decoder must skip.
func makeVehicleSlot(odoBegin, odoEnd uint32, firstUse, lastUse time.Time, nation byte, reg string, empty bool) []byte {
	buf := make([]byte, cardVehicleRecordLen)
	if empty {
		return buf
	}
	// 3-byte BE odometer values.
	buf[0] = byte(odoBegin >> 16)
	buf[1] = byte(odoBegin >> 8)
	buf[2] = byte(odoBegin)
	buf[3] = byte(odoEnd >> 16)
	buf[4] = byte(odoEnd >> 8)
	buf[5] = byte(odoEnd)
	binary.BigEndian.PutUint32(buf[6:10], uint32(firstUse.Unix()))
	binary.BigEndian.PutUint32(buf[10:14], uint32(lastUse.Unix()))
	buf[14] = nation
	buf[15] = 0x01 // code page
	for i := 16; i < 29; i++ {
		buf[i] = 0x20
	}
	copy(buf[16:], reg)
	// vuDataBlockCounter at 29..31 — leave zeros, irrelevant for our extraction.
	return buf
}

func TestDecodeVehiclesUsedGen1(t *testing.T) {
	first := time.Date(2026, 4, 1, 8, 0, 0, 0, time.UTC)
	last := time.Date(2026, 4, 1, 18, 0, 0, 0, time.UTC)

	body := make([]byte, 2) // pointer to newest
	// 3 slots: empty, populated, populated. Pointer = 2 (newest).
	body[0], body[1] = 0x00, 0x02
	body = append(body, makeVehicleSlot(0, 0, time.Time{}, time.Time{}, 0, "", true)...)
	body = append(body, makeVehicleSlot(100000, 100500, first, last, 21, "XY12 ABC", false)...)
	body = append(body, makeVehicleSlot(100500, 101000, first.Add(24*time.Hour), last.Add(24*time.Hour), 21, "XY12 DEF", false)...)

	got, err := DecodeVehiclesUsed(body)
	if err != nil {
		t.Fatalf("DecodeVehiclesUsed: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("decoded %d records, want 2 (empty slot should be skipped)", len(got))
	}
	if got[0].RegistrationNumber != "XY12 ABC" {
		t.Errorf("first reg = %q, want XY12 ABC", got[0].RegistrationNumber)
	}
	if got[0].OdometerBegin != 100000 || got[0].OdometerEnd != 100500 {
		t.Errorf("first odo = %d..%d, want 100000..100500", got[0].OdometerBegin, got[0].OdometerEnd)
	}
	if got[0].RegistrationNation != 21 {
		t.Errorf("first nation = %d, want 21", got[0].RegistrationNation)
	}
	if !got[0].FirstUse.Equal(first) {
		t.Errorf("first use = %v, want %v", got[0].FirstUse, first)
	}
	if got[1].RegistrationNumber != "XY12 DEF" {
		t.Errorf("second reg = %q, want XY12 DEF", got[1].RegistrationNumber)
	}
}

func TestDecodeVehiclesUsedTooShort(t *testing.T) {
	if _, err := DecodeVehiclesUsed([]byte{0x00}); err == nil {
		t.Errorf("expected error for body too short for the pointer")
	}
}

func TestPickRecordWidth(t *testing.T) {
	w, err := pickRecordWidth(31*84, 31, 48)
	if err != nil || w != 31 {
		t.Errorf("Gen1: got w=%d err=%v, want 31", w, err)
	}
	w, err = pickRecordWidth(48*200, 31, 48)
	if err != nil || w != 48 {
		t.Errorf("Gen2: got w=%d err=%v, want 48", w, err)
	}
	if _, err := pickRecordWidth(100, 31, 48); err == nil {
		t.Errorf("expected error for non-divisible length")
	}
}

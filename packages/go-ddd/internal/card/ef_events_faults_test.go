package card

import (
	"encoding/binary"
	"testing"
	"time"
)

func makeEventFaultSlot(typeCode byte, begin, end time.Time, nation byte, reg string) []byte {
	buf := make([]byte, eventFaultRecordLen)
	buf[0] = typeCode
	binary.BigEndian.PutUint32(buf[1:5], uint32(begin.Unix()))
	binary.BigEndian.PutUint32(buf[5:9], uint32(end.Unix()))
	buf[9] = nation
	buf[10] = 0x01 // code page
	for i := 11; i < 24; i++ {
		buf[i] = 0x20
	}
	copy(buf[11:], reg)
	return buf
}

func TestDecodeEventOrFaultBlock(t *testing.T) {
	begin := time.Date(2026, 4, 1, 8, 0, 0, 0, time.UTC)
	end := begin.Add(time.Hour)
	body := append(
		makeEventFaultSlot(0x12, begin, end, 21, "XY12 ABC"),
		make([]byte, eventFaultRecordLen)..., // empty
	)
	body = append(body, makeEventFaultSlot(0x14, begin.Add(2*time.Hour), end.Add(2*time.Hour), 21, "XY12 DEF")...)

	got, err := DecodeEventOrFaultBlock(body)
	if err != nil {
		t.Fatalf("DecodeEventOrFaultBlock: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d records, want 2 (empty skipped)", len(got))
	}
	if got[0].TypeCode != 0x12 {
		t.Errorf("got[0].TypeCode = %#x, want 0x12", got[0].TypeCode)
	}
	if !got[0].BeginTime.Equal(begin) {
		t.Errorf("got[0].BeginTime = %v, want %v", got[0].BeginTime, begin)
	}
	if got[0].RegistrationNumber != "XY12 ABC" {
		t.Errorf("got[0].RegistrationNumber = %q, want XY12 ABC", got[0].RegistrationNumber)
	}
	if got[1].TypeCode != 0x14 {
		t.Errorf("got[1].TypeCode = %#x, want 0x14", got[1].TypeCode)
	}
}

func TestDecodeEventOrFaultBlockBadLength(t *testing.T) {
	if _, err := DecodeEventOrFaultBlock(make([]byte, 23)); err == nil {
		t.Errorf("expected error for length not a multiple of %d", eventFaultRecordLen)
	}
}

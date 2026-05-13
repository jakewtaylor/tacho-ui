package card

import (
	"encoding/binary"
	"testing"
	"time"
)

// makeDailyRecord builds a CardActivityDailyRecord matching the spec
// header layout (12 bytes) followed by the change words.
func makeDailyRecord(prevLen int, date int64, distance uint16, changes []uint16) []byte {
	totalLen := dailyHeaderLen + 2*len(changes)
	buf := make([]byte, totalLen)
	binary.BigEndian.PutUint16(buf[0:2], uint16(prevLen))
	binary.BigEndian.PutUint16(buf[2:4], uint16(totalLen))
	binary.BigEndian.PutUint32(buf[4:8], uint32(date))
	// presence counter at 8..10 left zero (BCD 0)
	binary.BigEndian.PutUint16(buf[10:12], distance)
	for i, w := range changes {
		binary.BigEndian.PutUint16(buf[dailyHeaderLen+2*i:dailyHeaderLen+2*i+2], w)
	}
	return buf
}

func TestDecodeDriverActivityLinear(t *testing.T) {
	// Two consecutive records, no wraparound. Buffer is exactly the
	// concatenation of the two records.
	day1 := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 4, 2, 0, 0, 0, 0, time.UTC)

	r1 := makeDailyRecord(0, day1.Unix(), 100, []uint16{
		0b0_0_0_11_00000000000, // bit15=0 driver, bit14=0 single, bit13=0 inserted, work_type=3 driving, minutes=0
		0b0_0_0_00_00111000000, // 0:00 → 03:44 driving → break
	})
	r2 := makeDailyRecord(len(r1), day2.Unix(), 150, []uint16{
		0b0_0_0_11_00000000000,
	})

	bufLen := len(r1) + len(r2) + 10 // leave 10 bytes empty
	body := make([]byte, 4+bufLen)
	binary.BigEndian.PutUint16(body[0:2], 0)            // oldestPtr = 0
	binary.BigEndian.PutUint16(body[2:4], uint16(len(r1))) // newestPtr = start of r2
	copy(body[4:], r1)
	copy(body[4+len(r1):], r2)

	got, err := DecodeDriverActivity(body)
	if err != nil {
		t.Fatalf("DecodeDriverActivity: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d days, want 2", len(got))
	}
	if !got[0].Date.Equal(day1) || !got[1].Date.Equal(day2) {
		t.Errorf("dates wrong: got %v, %v; want %v, %v", got[0].Date, got[1].Date, day1, day2)
	}
	if got[0].Distance != 100 || got[1].Distance != 150 {
		t.Errorf("distances wrong: got %d, %d; want 100, 150", got[0].Distance, got[1].Distance)
	}
	if len(got[0].Changes) != 2 || len(got[1].Changes) != 1 {
		t.Errorf("change counts wrong: got %d, %d", len(got[0].Changes), len(got[1].Changes))
	}
	if got[0].Changes[0].WorkType != 3 {
		t.Errorf("first change WorkType = %d, want 3 (driving)", got[0].Changes[0].WorkType)
	}
	if !got[0].Changes[0].CardPresent {
		t.Errorf("first change should be card-inserted")
	}
}

func TestDecodeDriverActivityWrap(t *testing.T) {
	// r1 lives at the end of the buffer, r2 wraps to the beginning.
	day1 := time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC)
	day2 := time.Date(2026, 4, 2, 0, 0, 0, 0, time.UTC)
	r1 := makeDailyRecord(0, day1.Unix(), 100, []uint16{0b0_0_0_11_00000000000})
	r2 := makeDailyRecord(len(r1), day2.Unix(), 150, []uint16{0b0_0_0_11_00000000000})

	bufLen := len(r1) + len(r2) + 5 // a bit of empty padding
	body := make([]byte, 4+bufLen)

	// Place r1 starting near end so part of r2 wraps to start.
	// Put r1 at physical offset (bufLen - len(r1) - 3) so r2 wraps.
	oldestPos := bufLen - len(r1) - 3
	// Copy r1
	for i, b := range r1 {
		body[4+(oldestPos+i)%bufLen] = b
	}
	// r2 immediately after r1
	newestPos := (oldestPos + len(r1)) % bufLen
	for i, b := range r2 {
		body[4+(newestPos+i)%bufLen] = b
	}
	binary.BigEndian.PutUint16(body[0:2], uint16(oldestPos))
	binary.BigEndian.PutUint16(body[2:4], uint16(newestPos))

	got, err := DecodeDriverActivity(body)
	if err != nil {
		t.Fatalf("DecodeDriverActivity: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d days, want 2 (with wrap)", len(got))
	}
	if !got[0].Date.Equal(day1) || !got[1].Date.Equal(day2) {
		t.Errorf("wrap dates wrong: got %v, %v", got[0].Date, got[1].Date)
	}
}

func TestDecodeActivityChangeBits(t *testing.T) {
	// driver=0 → Driver=true; team=1 → Team=true; card=1 → CardPresent=false;
	// activity=10 (work); minutes=720
	word := uint16(0)<<15 | uint16(1)<<14 | uint16(1)<<13 | uint16(2)<<11 | uint16(720)
	changes, err := decodeActivityChanges([]byte{byte(word >> 8), byte(word)})
	if err != nil {
		t.Fatalf("decodeActivityChanges: %v", err)
	}
	if len(changes) != 1 {
		t.Fatalf("got %d changes", len(changes))
	}
	c := changes[0]
	if !c.Driver || !c.Team || c.CardPresent || c.WorkType != 2 || c.Minutes != 720 {
		t.Errorf("got %+v, want Driver=true Team=true CardPresent=false WorkType=2 Minutes=720", c)
	}
}

func TestDecodeDriverActivityEmpty(t *testing.T) {
	// Empty buffer (pointers at 0, all zero data).
	body := make([]byte, 4+100)
	got, err := DecodeDriverActivity(body)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if len(got) != 0 {
		t.Errorf("expected 0 records for empty buffer, got %d", len(got))
	}
}

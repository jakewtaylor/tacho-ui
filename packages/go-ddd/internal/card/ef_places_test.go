package card

import (
	"encoding/binary"
	"testing"
	"time"
)

func makePlaceSlot(entryTime time.Time, entryType, country, region byte, odo uint32) []byte {
	buf := make([]byte, placeRecordLen)
	binary.BigEndian.PutUint32(buf[0:4], uint32(entryTime.Unix()))
	buf[4] = entryType
	buf[5] = country
	buf[6] = region
	buf[7] = byte(odo >> 16)
	buf[8] = byte(odo >> 8)
	buf[9] = byte(odo)
	return buf
}

func TestDecodePlacesGen1(t *testing.T) {
	t1 := time.Date(2026, 4, 1, 8, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 4, 1, 18, 0, 0, 0, time.UTC)

	body := []byte{0x02} // pointer = 2 (newest is the third slot)
	// three slots: empty, populated, populated
	body = append(body, make([]byte, placeRecordLen)...) // empty
	body = append(body, makePlaceSlot(t1, 0, 21, 0, 100000)...)
	body = append(body, makePlaceSlot(t2, 1, 21, 0, 100500)...)

	got, err := DecodePlaces(body)
	if err != nil {
		t.Fatalf("DecodePlaces: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d records, want 2 (empty skipped)", len(got))
	}
	if !got[0].EntryTime.Equal(t1) {
		t.Errorf("got[0].EntryTime = %v, want %v", got[0].EntryTime, t1)
	}
	if got[0].EntryTypeDailyWorkPeriod != 0 {
		t.Errorf("got[0].EntryType = %d, want 0", got[0].EntryTypeDailyWorkPeriod)
	}
	if got[0].DailyWorkPeriodCountry != 21 {
		t.Errorf("got[0].Country = %d, want 21", got[0].DailyWorkPeriodCountry)
	}
	if got[0].VehicleOdometerValue != 100000 {
		t.Errorf("got[0].Odometer = %d, want 100000", got[0].VehicleOdometerValue)
	}
}

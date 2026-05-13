package card

import (
	"encoding/binary"
	"math"
	"testing"
	"time"
)

func makeGnssSlot(ts time.Time, latRaw, lngRaw int32, odo uint32) []byte {
	buf := make([]byte, gnssRecordLen)
	binary.BigEndian.PutUint32(buf[0:4], uint32(ts.Unix()))
	binary.BigEndian.PutUint32(buf[4:8], uint32(ts.Unix())) // inner timestamp same as outer
	buf[8] = 0                                              // accuracy
	binary.BigEndian.PutUint32(buf[9:13], uint32(latRaw))
	binary.BigEndian.PutUint32(buf[13:17], uint32(lngRaw))
	buf[17] = byte(odo >> 16)
	buf[18] = byte(odo >> 8)
	buf[19] = byte(odo)
	return buf
}

func TestDecodeGnss(t *testing.T) {
	ts := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	body := []byte{0x00, 0x01} // 2-byte pointer = 1 (second slot is newest)
	// slot 0: empty
	body = append(body, make([]byte, gnssRecordLen)...)
	// slot 1: London-ish (lat ~51.5°N, lng ~-0.1°E)
	body = append(body, makeGnssSlot(ts, 515000, -1000, 100000)...)

	got, err := DecodeGnss(body)
	if err != nil {
		t.Fatalf("DecodeGnss: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d records, want 1 (empty skipped)", len(got))
	}
	if math.Abs(got[0].Latitude-51.5) > 1e-6 {
		t.Errorf("Latitude = %v, want ~51.5", got[0].Latitude)
	}
	if math.Abs(got[0].Longitude-(-0.1)) > 1e-6 {
		t.Errorf("Longitude = %v, want ~-0.1", got[0].Longitude)
	}
	if !got[0].TimeStamp.Equal(ts) {
		t.Errorf("TimeStamp = %v, want %v", got[0].TimeStamp, ts)
	}
	if got[0].Odometer != 100000 {
		t.Errorf("Odometer = %d, want 100000", got[0].Odometer)
	}
}

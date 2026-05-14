package card

import (
	"encoding/binary"
	"math"
	"testing"
	"time"
)

// makeGnssPlaceAuth constructs the 12-byte GNSSPlaceAuthRecord per
// 2021/1228 §2.79c.
func makeGnssPlaceAuth(ts time.Time, latRaw, lngRaw int32, auth byte) []byte {
	buf := make([]byte, gnssPlaceAuthLen)
	binary.BigEndian.PutUint32(buf[0:4], uint32(ts.Unix()))
	buf[4] = 1 // accuracy
	putInt24BE(buf[5:8], latRaw)
	putInt24BE(buf[8:11], lngRaw)
	buf[11] = auth
	return buf
}

func TestDecodeBorderCrossings(t *testing.T) {
	ts := time.Date(2026, 4, 12, 14, 32, 0, 0, time.UTC)
	body := []byte{0x00, 0x01} // pointer = 1 (second slot newest)

	// slot 0: empty
	body = append(body, make([]byte, borderCrossingRecordLen)...)

	// slot 1: FR → BE, ~50.963°N 1.85°E (near Calais), odo 534212 km.
	// 50° 57.8' N  → (50*100 + 57.8) * 10 = 50578
	//  1° 51.0' E  → (1*100  + 51.0) * 10 =  1510
	slot := make([]byte, borderCrossingRecordLen)
	slot[0] = 11 // countryLeft (NationNumeric 11 = France per Annex IC)
	slot[1] = 2  // countryEntered (2 = Belgium)
	copy(slot[2:14], makeGnssPlaceAuth(ts, 50578, 1510, 0x01)) // authenticated
	odo := uint32(534212)
	slot[14] = byte(odo >> 16)
	slot[15] = byte(odo >> 8)
	slot[16] = byte(odo)
	body = append(body, slot...)

	got, err := DecodeBorderCrossings(body)
	if err != nil {
		t.Fatalf("DecodeBorderCrossings: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d records, want 1 (empty skipped)", len(got))
	}
	r := got[0]
	if r.CountryLeft != 11 || r.CountryEntered != 2 {
		t.Errorf("countries = %d → %d, want 11 → 2", r.CountryLeft, r.CountryEntered)
	}
	if !r.GnssPlaceAuth.TimeStamp.Equal(ts) {
		t.Errorf("timestamp = %v, want %v", r.GnssPlaceAuth.TimeStamp, ts)
	}
	wantLat := 50 + 57.8/60.0
	if math.Abs(r.GnssPlaceAuth.Latitude-wantLat) > 1e-6 {
		t.Errorf("latitude = %v, want %v", r.GnssPlaceAuth.Latitude, wantLat)
	}
	if r.GnssPlaceAuth.AuthStatus != AuthAuthenticated {
		t.Errorf("auth = %v, want authenticated", r.GnssPlaceAuth.AuthStatus)
	}
	if r.Odometer != 534212 {
		t.Errorf("odo = %d, want 534212", r.Odometer)
	}
}

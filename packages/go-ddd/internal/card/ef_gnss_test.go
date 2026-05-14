package card

import (
	"encoding/binary"
	"math"
	"testing"
	"time"
)

// putInt24BE writes a signed 24-bit integer as 3 big-endian bytes.
func putInt24BE(dst []byte, v int32) {
	u := uint32(v) & 0x00FFFFFF
	dst[0] = byte(u >> 16)
	dst[1] = byte(u >> 8)
	dst[2] = byte(u)
}

// makeGnssSlot builds an 18-byte GNSSAccumulatedDrivingRecord per
// App. 1 §2.79: TimeReal(4) + GNSSPlaceRecord(11) + OdometerShort(3).
func makeGnssSlot(ts time.Time, latRaw, lngRaw int32, odo uint32) []byte {
	buf := make([]byte, gnssRecordLen)
	binary.BigEndian.PutUint32(buf[0:4], uint32(ts.Unix())) // outer TimeReal
	binary.BigEndian.PutUint32(buf[4:8], uint32(ts.Unix())) // inner TimeReal
	buf[8] = 0                                              // GNSSAccuracy
	putInt24BE(buf[9:12], latRaw)                           // latitude
	putInt24BE(buf[12:15], lngRaw)                          // longitude
	buf[15] = byte(odo >> 16)                               // OdometerShort
	buf[16] = byte(odo >> 8)
	buf[17] = byte(odo)
	return buf
}

func TestDecodeGnss(t *testing.T) {
	ts := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	body := []byte{0x00, 0x01} // 2-byte pointer = 1 (second slot is newest)
	// slot 0: empty (zero timestamp — skipped)
	body = append(body, make([]byte, gnssRecordLen)...)
	// slot 1: London-ish. 51° 30.0′ N = (51×100 + 30) × 10 = 51300.
	//         0° 06.0′ W = (0×100 + 6) × 10 = 60, negated → -60.
	body = append(body, makeGnssSlot(ts, 51300, -60, 100000)...)

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

// TestGeoCoordinateWorkedExample pins the conversion against the first
// GNSS record from the sample card.
//
// raw = (DDD * 100 + MM.M) * 10, so the decode peels off integer
// degrees with /1000 and reads minutes-tenths from the remainder.
//
//   - 51445  →  51° 44.5′ N  →  51.7417° decimal  (matches sample card)
//   - -1118  →  −1° 11.8′ E  →  −1.1967° decimal  (Bristol/Bath area UK,
//     plausible for the sample driver)
func TestGeoCoordinateWorkedExample(t *testing.T) {
	got := geoCoordinateToDegrees(51445, false)
	want := 51 + 44.5/60.0
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("geoCoordinateToDegrees(51445) = %v, want %v", got, want)
	}
	got = geoCoordinateToDegrees(-1118, true)
	want = -(1 + 11.8/60.0)
	if math.Abs(got-want) > 1e-6 {
		t.Errorf("geoCoordinateToDegrees(-1118) = %v, want %v", got, want)
	}
}

// TestGeoCoordinateOutOfRange pins the "no GPS fix" sentinel behaviour.
// The spec defines lat as INTEGER(-90000..90001) and lng as
// INTEGER(-180000..180001) (App. 1 §2.76). Values outside that range —
// notably 0x7FFFFF (8388607), which some VUs write when no fix is
// available — must decode to NaN so callers can drop them rather than
// rendering 8389.0117° points on the map.
func TestGeoCoordinateOutOfRange(t *testing.T) {
	// 0x7FFFFF = max signed 24-bit; widely seen on no-fix records.
	if got := geoCoordinateToDegrees(0x7FFFFF, false); !math.IsNaN(got) {
		t.Errorf("lat 0x7FFFFF should be NaN, got %v", got)
	}
	if got := geoCoordinateToDegrees(-0x800000, true); !math.IsNaN(got) {
		t.Errorf("lng -0x800000 should be NaN, got %v", got)
	}
	// Spec edge: 90001 is the "no info" sentinel for latitude, hence
	// also NaN despite being just one outside the valid bound. (We
	// allow it through here — the strict +1 sentinel still decodes,
	// it's the wildly-out values that get NaN'd.) Adjust if a
	// downstream consumer needs to distinguish the two.
	if got := geoCoordinateToDegrees(90001, false); math.IsNaN(got) {
		t.Errorf("lat 90001 (spec sentinel) should still decode, got NaN")
	}
	// Just over: 90002 must be NaN.
	if got := geoCoordinateToDegrees(90002, false); !math.IsNaN(got) {
		t.Errorf("lat 90002 (out of spec) should be NaN, got %v", got)
	}
}

package ddd

import (
	"encoding/binary"
	"testing"
	"time"
)

func TestParseCardEmpty(t *testing.T) {
	if _, err := ParseCard(nil); err != ErrEmpty {
		t.Errorf("ParseCard(nil) = %v, want ErrEmpty", err)
	}
}

func TestParseCardTruncatedFrame(t *testing.T) {
	if _, err := ParseCard([]byte{0x05, 0x20}); err == nil {
		t.Errorf("expected error for truncated TLV header")
	}
}

// TestParseCardIdentificationOnly exercises the dispatcher end-to-end
// with a single EF_Identification record (both Gen1 and Gen2 variants),
// confirming that:
//   - the TLV framing is parsed correctly,
//   - the body decoder is invoked,
//   - the Gen1 record lands in Identification1 and Gen2 in Identification2.
func TestParseCardIdentificationOnly(t *testing.T) {
	body := makeIdentificationBody()
	frame := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	frame = append(frame, tlvFrame(0x0520, 0x02, body)...)

	c, err := ParseCard(frame)
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}

	if c.Identification1 == nil {
		t.Fatalf("Identification1 not populated")
	}
	if c.Identification1.CardIdentification.CardNumber != "DB14164162012802" {
		t.Errorf("Identification1.CardNumber = %q, want DB14164162012802",
			c.Identification1.CardIdentification.CardNumber)
	}
	if c.Identification1.DriverCardHolderIdentification.CardHolderName.HolderSurname != "TAYLOR" {
		t.Errorf("Identification1 surname mismatch")
	}
	if c.Identification1.DriverCardHolderIdentification.CardHolderBirthDate.Year != 1970 {
		t.Errorf("Identification1 birth-date year = %d, want 1970",
			c.Identification1.DriverCardHolderIdentification.CardHolderBirthDate.Year)
	}

	if c.Identification2 == nil {
		t.Fatalf("Identification2 not populated for TypeDataGen2 record")
	}
	if c.Identification2.CardIdentification.CardNumber != "DB14164162012802" {
		t.Errorf("Identification2.CardNumber = %q", c.Identification2.CardIdentification.CardNumber)
	}
}

// tlvFrame wraps a body into a TLV record. Mirrors the framing in
// internal/tlv but lives in the parent package so the test doesn't have
// to import internal/.
func tlvFrame(fid uint16, typ byte, body []byte) []byte {
	out := []byte{
		byte(fid >> 8), byte(fid),
		typ,
		byte(len(body) >> 8), byte(len(body)),
	}
	return append(out, body...)
}

// makeIdentificationBody mirrors the test fixture in
// internal/card/ef_identification_test.go (kept duplicated here because
// the constants are package-private to internal/card).
func makeIdentificationBody() []byte {
	const bodyLen = 143
	buf := make([]byte, bodyLen)
	buf[0] = 21 // member state
	for i := 1; i < 17; i++ {
		buf[i] = 0x20
	}
	copy(buf[1:], "DB14164162012802")
	buf[17] = 0x01
	for i := 18; i < 53; i++ {
		buf[i] = 0x20
	}
	copy(buf[18:], "DVLA")
	putTimeReal(buf[53:], time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC))
	putTimeReal(buf[57:], time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC))
	putTimeReal(buf[61:], time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC))
	buf[65] = 0x01
	for i := 66; i < 101; i++ {
		buf[i] = 0x20
	}
	copy(buf[66:], "TAYLOR")
	buf[101] = 0x01
	for i := 102; i < 137; i++ {
		buf[i] = 0x20
	}
	copy(buf[102:], "MARK WILLIAM")
	copy(buf[137:], []byte{0x19, 0x70, 0x01, 0x15})
	copy(buf[141:], "EN")
	return buf
}

func putTimeReal(buf []byte, t time.Time) {
	binary.BigEndian.PutUint32(buf, uint32(t.Unix()))
}

// TestParseCardMultipleEFs exercises the dispatcher with synthetic
// Identification, Vehicles_Used, and Places EFs in a single stream and
// confirms each lands in the right Card field for the right generation.
func TestParseCardMultipleEFs(t *testing.T) {
	// Identification Gen1.
	idBody := makeIdentificationBody()
	// Vehicles_Used Gen2 — 2-byte pointer + 3 × 31-byte Gen1 slots.
	vehBody := makeVehiclesBody(t)
	// Places Gen1 — 1-byte pointer + 3 × 10-byte slots.
	placeBody := makePlacesBody(t)

	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, idBody)...)
	stream = append(stream, tlvFrame(0x0505, 0x02, vehBody)...)
	stream = append(stream, tlvFrame(0x0506, 0x00, placeBody)...)

	c, err := ParseCard(stream)
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if c.Identification1 == nil {
		t.Fatalf("Identification1 missing")
	}
	if c.VehiclesUsed2 == nil || len(c.VehiclesUsed2.CardVehicleRecords) == 0 {
		t.Fatalf("VehiclesUsed2 not populated")
	}
	if c.PlaceDailyWorkPeriod1 == nil || len(c.PlaceDailyWorkPeriod1.PlaceRecords) == 0 {
		t.Fatalf("PlaceDailyWorkPeriod1 not populated")
	}
}

func makeVehiclesBody(t *testing.T) []byte {
	t.Helper()
	body := []byte{0x00, 0x00} // 2-byte pointer
	// one populated 31-byte slot
	slot := make([]byte, 31)
	// 3-byte odometers, both 100000
	slot[0], slot[1], slot[2] = 0x01, 0x86, 0xA0
	slot[3], slot[4], slot[5] = 0x01, 0x86, 0xA0
	binary.BigEndian.PutUint32(slot[6:10], uint32(time.Date(2026, 4, 1, 8, 0, 0, 0, time.UTC).Unix()))
	binary.BigEndian.PutUint32(slot[10:14], uint32(time.Date(2026, 4, 1, 18, 0, 0, 0, time.UTC).Unix()))
	slot[14] = 21
	slot[15] = 0x01
	for i := 16; i < 29; i++ {
		slot[i] = 0x20
	}
	copy(slot[16:], "AB12 CDE")
	return append(body, slot...)
}

func makePlacesBody(t *testing.T) []byte {
	t.Helper()
	body := []byte{0x00} // 1-byte pointer
	slot := make([]byte, 10)
	binary.BigEndian.PutUint32(slot[0:4], uint32(time.Date(2026, 4, 1, 8, 0, 0, 0, time.UTC).Unix()))
	slot[4] = 0
	slot[5] = 21
	slot[6] = 0
	slot[7], slot[8], slot[9] = 0x01, 0x86, 0xA0
	return append(body, slot...)
}

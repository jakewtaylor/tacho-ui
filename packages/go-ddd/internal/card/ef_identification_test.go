package card

import (
	"encoding/binary"
	"testing"
	"time"
)

var (
	testIssueDate  = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	testExpiryDate = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
)

func putTimeReal(buf []byte, t time.Time) {
	binary.BigEndian.PutUint32(buf, uint32(t.Unix()))
}

// makeIdentificationBody constructs a synthetic 143-byte EF_Identification
// body matching the spec layout. Useful for offset and round-trip tests
// without needing a real card.
func makeIdentificationBody() []byte {
	buf := make([]byte, identificationBodyLen)

	// CardIssuingMemberState: 21 = United Kingdom
	buf[offCardIssuingMemberState] = 21

	// CardNumber: 16-byte IA5, right-padded with 0x20
	for i := offCardNumber; i < offCardNumber+16; i++ {
		buf[i] = 0x20
	}
	copy(buf[offCardNumber:], "DB14164162012802")

	// Authority Name: 1-byte code page + 35 bytes IA5
	buf[offCardIssuingAuthority] = 0x01
	for i := offCardIssuingAuthority + 1; i < offCardIssuingAuthority+36; i++ {
		buf[i] = 0x20
	}
	copy(buf[offCardIssuingAuthority+1:], "DVLA")

	putTimeReal(buf[offCardIssueDate:], testIssueDate)
	putTimeReal(buf[offCardValidityBegin:], testIssueDate)
	putTimeReal(buf[offCardExpiryDate:], testExpiryDate)

	// Holder Name: 2 × Name (36 bytes each)
	// Surname (offset 65): code page 1 + "TAYLOR" padded
	buf[offHolderName] = 0x01
	for i := offHolderName + 1; i < offHolderName+36; i++ {
		buf[i] = 0x20
	}
	copy(buf[offHolderName+1:], "TAYLOR")
	// FirstNames (offset 65+36=101): code page 1 + "MARK WILLIAM"
	buf[offHolderName+36] = 0x01
	for i := offHolderName + 37; i < offHolderName+72; i++ {
		buf[i] = 0x20
	}
	copy(buf[offHolderName+37:], "MARK WILLIAM")

	// Birth date: 1970-01-15 BCD
	copy(buf[offHolderBirthDate:], []byte{0x19, 0x70, 0x01, 0x15})

	// Preferred language: "EN"
	copy(buf[offHolderPreferredLang:], "EN")

	return buf
}

func TestDecodeIdentification(t *testing.T) {
	body := makeIdentificationBody()
	got, err := DecodeIdentification(body)
	if err != nil {
		t.Fatalf("DecodeIdentification: %v", err)
	}

	if got.CardIssuingMemberState != 21 {
		t.Errorf("issuing state = %d, want 21", got.CardIssuingMemberState)
	}
	if got.CardNumber != "DB14164162012802" {
		t.Errorf("card number = %q, want DB14164162012802", got.CardNumber)
	}
	if got.CardIssuingAuthority != "DVLA" {
		t.Errorf("authority = %q, want DVLA", got.CardIssuingAuthority)
	}
	if !got.CardIssueDate.Equal(testIssueDate) {
		t.Errorf("issue date = %v, want %v", got.CardIssueDate, testIssueDate)
	}
	if !got.CardExpiryDate.Equal(testExpiryDate) {
		t.Errorf("expiry date = %v, want %v", got.CardExpiryDate, testExpiryDate)
	}
	if got.HolderSurname != "TAYLOR" {
		t.Errorf("surname = %q, want TAYLOR", got.HolderSurname)
	}
	if got.HolderFirstNames != "MARK WILLIAM" {
		t.Errorf("first names = %q, want MARK WILLIAM", got.HolderFirstNames)
	}
	if got.HolderBirthDate.Year != 1970 || got.HolderBirthDate.Month != 1 || got.HolderBirthDate.Day != 15 {
		t.Errorf("birth date = %+v, want 1970-01-15", got.HolderBirthDate)
	}
	if got.PreferredLang != "EN" {
		t.Errorf("preferred lang = %q, want EN", got.PreferredLang)
	}
}

func TestDecodeIdentificationTooShort(t *testing.T) {
	if _, err := DecodeIdentification(make([]byte, identificationBodyLen-1)); err == nil {
		t.Errorf("expected error for short body")
	}
}

func TestDecodeIdentificationToleratesTrailingBytes(t *testing.T) {
	body := append(makeIdentificationBody(), 0xFF, 0xFF, 0xFF)
	if _, err := DecodeIdentification(body); err != nil {
		t.Errorf("decoder should tolerate trailing bytes (Gen2 extensions), got %v", err)
	}
}

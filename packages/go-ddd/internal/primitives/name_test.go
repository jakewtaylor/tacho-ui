package primitives

import "testing"

func TestName(t *testing.T) {
	// Build a 36-byte Name with code page 1 (ISO 8859 latin-1) and the
	// surname "TAYLOR" space-padded to 35 bytes.
	buf := make([]byte, NameLen)
	buf[0] = 0x01
	copy(buf[1:], "TAYLOR")
	for i := 1 + len("TAYLOR"); i < NameLen; i++ {
		buf[i] = 0x20
	}
	got, err := Name(buf)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if got != "TAYLOR" {
		t.Errorf("got %q, want %q", got, "TAYLOR")
	}
}

func TestNameTooShort(t *testing.T) {
	_, err := Name(make([]byte, NameLen-1))
	if err == nil {
		t.Errorf("expected error for short Name")
	}
}

func TestHolderName(t *testing.T) {
	buf := make([]byte, 2*NameLen)
	for i := range buf {
		buf[i] = 0x20
	}
	buf[0] = 0x01
	copy(buf[1:], "TAYLOR")
	buf[NameLen] = 0x01
	copy(buf[NameLen+1:], "MARK")

	got, err := HolderName(buf)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if got.Surname != "TAYLOR" {
		t.Errorf("surname = %q, want TAYLOR", got.Surname)
	}
	if got.FirstNames != "MARK" {
		t.Errorf("firstNames = %q, want MARK", got.FirstNames)
	}
}

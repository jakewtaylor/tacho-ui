package primitives

import "testing"

func TestBCDString(t *testing.T) {
	cases := []struct {
		name    string
		in      []byte
		want    string
		wantErr bool
	}{
		{"empty", []byte{}, "", false},
		{"single byte 12", []byte{0x12}, "12", false},
		{"date 2026-05-13 packed", []byte{0x20, 0x26, 0x05, 0x13}, "20260513", false},
		{"high nibble invalid", []byte{0xA1}, "", true},
		{"low nibble invalid", []byte{0x1F}, "", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := BCDString(tc.in)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr = %v", err, tc.wantErr)
			}
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestUnsignedBCD(t *testing.T) {
	cases := []struct {
		in   []byte
		want uint64
	}{
		{[]byte{0x00, 0x00}, 0},
		{[]byte{0x12, 0x34}, 1234},
		{[]byte{0x20, 0x26}, 2026},
	}
	for _, tc := range cases {
		got, err := UnsignedBCD(tc.in)
		if err != nil {
			t.Fatalf("err = %v", err)
		}
		if got != tc.want {
			t.Errorf("UnsignedBCD(% X) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

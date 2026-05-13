package primitives

import "testing"

func TestUint(t *testing.T) {
	cases := []struct {
		in   []byte
		want uint64
	}{
		{[]byte{0x00}, 0},
		{[]byte{0xFF}, 255},
		{[]byte{0x01, 0x00}, 256},
		{[]byte{0x12, 0x34, 0x56}, 0x123456},
		{[]byte{0x00, 0x00, 0x00, 0x01}, 1},
		{[]byte{0xFF, 0xFF, 0xFF, 0xFF}, 0xFFFFFFFF},
	}
	for _, tc := range cases {
		got, err := Uint(tc.in)
		if err != nil {
			t.Fatalf("Uint(% X): %v", tc.in, err)
		}
		if got != tc.want {
			t.Errorf("Uint(% X) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

func TestUintBoundary(t *testing.T) {
	if _, err := Uint(nil); err == nil {
		t.Errorf("expected err for nil input")
	}
	if _, err := Uint(make([]byte, 9)); err == nil {
		t.Errorf("expected err for >8 byte input")
	}
}

func TestInt32BE(t *testing.T) {
	cases := []struct {
		in   []byte
		want int32
	}{
		{[]byte{0x00, 0x00, 0x00, 0x00}, 0},
		{[]byte{0x00, 0x00, 0x00, 0x01}, 1},
		{[]byte{0xFF, 0xFF, 0xFF, 0xFF}, -1},
		{[]byte{0x80, 0x00, 0x00, 0x00}, -2147483648},
		{[]byte{0x7F, 0xFF, 0xFF, 0xFF}, 2147483647},
	}
	for _, tc := range cases {
		got, err := Int32BE(tc.in)
		if err != nil {
			t.Fatalf("Int32BE(% X): %v", tc.in, err)
		}
		if got != tc.want {
			t.Errorf("Int32BE(% X) = %d, want %d", tc.in, got, tc.want)
		}
	}
}

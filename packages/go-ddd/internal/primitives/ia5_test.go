package primitives

import "testing"

func TestIA5String(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
		want string
	}{
		{"plain", []byte("HELLO"), "HELLO"},
		{"space-padded right", []byte("HI   "), "HI"},
		{"null-padded right", []byte{'H', 'I', 0x00, 0x00}, "HI"},
		{"mixed padding right", []byte{'A', ' ', 0x00, ' '}, "A"},
		{"all padding", []byte{0x00, ' ', 0x00}, ""},
		{"leading space preserved", []byte("  AB"), "  AB"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IA5String(tc.in); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestCodePageString(t *testing.T) {
	cases := []struct {
		name     string
		codePage byte
		body     []byte
		want     string
	}{
		{"ascii", 1, []byte("TAYLOR"), "TAYLOR"},
		{"ascii padded", 1, []byte("MARK   "), "MARK"},
		{"default cp 0", 0, []byte("X"), "X"},
		{"latin-1 byte", 1, []byte{0xC9}, "É"}, // É at byte 0xC9
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := CodePageString(tc.codePage, tc.body); got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

package primitives

import "testing"

func TestDatef(t *testing.T) {
	cases := []struct {
		name string
		in   []byte
		want Date
	}{
		{"zero is no-value", []byte{0x00, 0x00, 0x00, 0x00}, Date{}},
		{"2026-05-13", []byte{0x20, 0x26, 0x05, 0x13}, Date{2026, 5, 13}},
		{"1985-12-31", []byte{0x19, 0x85, 0x12, 0x31}, Date{1985, 12, 31}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Datef(tc.in)
			if err != nil {
				t.Fatalf("err = %v", err)
			}
			if got != tc.want {
				t.Errorf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestDateISO(t *testing.T) {
	cases := []struct {
		d    Date
		want string
	}{
		{Date{}, ""},
		{Date{2026, 5, 13}, "2026-05-13"},
		{Date{1985, 12, 31}, "1985-12-31"},
	}
	for _, tc := range cases {
		if got := tc.d.ISO(); got != tc.want {
			t.Errorf("ISO(%+v) = %q, want %q", tc.d, got, tc.want)
		}
	}
}

func TestDateZero(t *testing.T) {
	if !(Date{}).Zero() {
		t.Errorf("Date{} should be Zero")
	}
	if (Date{2026, 1, 1}).Zero() {
		t.Errorf("non-empty date should not be Zero")
	}
}

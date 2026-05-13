package primitives

import (
	"testing"
	"time"
)

func TestTimeReal(t *testing.T) {
	cases := []struct {
		name    string
		in      []byte
		want    time.Time
		wantErr bool
	}{
		{"epoch zero is the no-value sentinel", []byte{0x00, 0x00, 0x00, 0x00}, time.Time{}, false},
		{"one second past epoch", []byte{0x00, 0x00, 0x00, 0x01}, time.Unix(1, 0).UTC(), false},
		{"max uint32", []byte{0xFF, 0xFF, 0xFF, 0xFF}, time.Unix(int64(^uint32(0)), 0).UTC(), false},
		{"too short", []byte{0x01, 0x02, 0x03}, time.Time{}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := TimeReal(tc.in)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr = %v", err, tc.wantErr)
			}
			if !got.Equal(tc.want) {
				t.Errorf("got %v, want %v", got, tc.want)
			}
		})
	}
}

// TestTimeRealKnownDate locks in a real-world timestamp so the byte
// layout (big-endian, seconds since 1970-01-01 UTC) does not silently
// drift. 2000-01-01T00:00:00Z = 946684800 = 0x386D4380.
func TestTimeRealKnownDate(t *testing.T) {
	want := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC)
	in := []byte{0x38, 0x6D, 0x43, 0x80}
	got, err := TimeReal(in)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if !got.Equal(want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

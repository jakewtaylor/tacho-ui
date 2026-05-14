package card

import (
	"encoding/binary"
	"testing"
	"time"
)

func TestDecodeLoadUnload(t *testing.T) {
	ts := time.Date(2026, 4, 15, 9, 0, 0, 0, time.UTC)
	body := []byte{0x00, 0x01}
	body = append(body, make([]byte, loadUnloadRecordLen)...) // empty slot 0

	slot := make([]byte, loadUnloadRecordLen)
	binary.BigEndian.PutUint32(slot[0:4], uint32(ts.Unix()))
	slot[4] = 0x01 // load
	copy(slot[5:17], makeGnssPlaceAuth(ts, 51500, -120, 0x00))
	odo := uint32(123456)
	slot[17] = byte(odo >> 16)
	slot[18] = byte(odo >> 8)
	slot[19] = byte(odo)
	body = append(body, slot...)

	got, err := DecodeLoadUnload(body)
	if err != nil {
		t.Fatalf("DecodeLoadUnload: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d records, want 1", len(got))
	}
	if got[0].OperationType != OpLoad {
		t.Errorf("op = %v, want load", got[0].OperationType)
	}
	if got[0].GnssPlaceAuth.AuthStatus != AuthNotAuthenticated {
		t.Errorf("auth = %v, want not_authenticated", got[0].GnssPlaceAuth.AuthStatus)
	}
	if got[0].Odometer != 123456 {
		t.Errorf("odo = %d, want 123456", got[0].Odometer)
	}
}

func TestOperationTypeString(t *testing.T) {
	cases := map[OperationType]string{
		OpLoad:                   "load",
		OpUnload:                 "unload",
		OpSimultaneousLoadUnload: "simultaneous",
		OpUnknown:                "unknown",
	}
	for op, want := range cases {
		if got := op.String(); got != want {
			t.Errorf("OperationType(%d).String() = %q, want %q", op, got, want)
		}
	}
}

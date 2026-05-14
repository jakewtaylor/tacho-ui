package card

import (
	"encoding/binary"
	"testing"
	"time"
)

func TestDecodeAuthStatus(t *testing.T) {
	ts := time.Date(2026, 4, 1, 10, 0, 0, 0, time.UTC)
	body := []byte{0x00, 0x01}

	// slot 0: zero timestamp — skipped
	body = append(body, make([]byte, authStatusRecordLen)...)

	// slot 1: authenticated
	slot := make([]byte, authStatusRecordLen)
	binary.BigEndian.PutUint32(slot[0:4], uint32(ts.Unix()))
	slot[4] = 0x01
	body = append(body, slot...)

	got, err := DecodeAuthStatus(body)
	if err != nil {
		t.Fatalf("DecodeAuthStatus: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d, want 1", len(got))
	}
	if !got[0].TimeStamp.Equal(ts) {
		t.Errorf("ts = %v, want %v", got[0].TimeStamp, ts)
	}
	if got[0].AuthStatus != AuthAuthenticated {
		t.Errorf("auth = %v, want authenticated", got[0].AuthStatus)
	}
}

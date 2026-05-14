package card

import (
	"encoding/binary"
	"testing"
	"time"
)

func TestDecodeLoadType(t *testing.T) {
	ts := time.Date(2026, 4, 1, 8, 0, 0, 0, time.UTC)
	body := []byte{0x00, 0x01}
	body = append(body, make([]byte, loadTypeRecordLen)...) // empty slot 0

	slot := make([]byte, loadTypeRecordLen)
	binary.BigEndian.PutUint32(slot[0:4], uint32(ts.Unix()))
	slot[4] = 0x01 // goods
	body = append(body, slot...)

	got, err := DecodeLoadType(body)
	if err != nil {
		t.Fatalf("DecodeLoadType: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d records, want 1", len(got))
	}
	if got[0].LoadType != LoadGoods {
		t.Errorf("type = %v, want goods", got[0].LoadType)
	}
	if !got[0].TimeStamp.Equal(ts) {
		t.Errorf("ts = %v, want %v", got[0].TimeStamp, ts)
	}
}

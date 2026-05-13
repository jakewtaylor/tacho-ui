package tlv

import (
	"errors"
	"io"
	"testing"
)

func makeRecord(fid uint16, typ Type, value []byte) []byte {
	out := []byte{
		byte(fid >> 8), byte(fid),
		byte(typ),
		byte(len(value) >> 8), byte(len(value)),
	}
	return append(out, value...)
}

func TestReadSingleRecord(t *testing.T) {
	body := []byte("HELLO")
	frame := makeRecord(0x0520, TypeData, body)
	rec, n, err := Read(frame, 0)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if rec.FID != 0x0520 {
		t.Errorf("FID = %#x, want 0x0520", rec.FID)
	}
	if rec.Type != TypeData {
		t.Errorf("Type = %#x, want %#x", rec.Type, TypeData)
	}
	if string(rec.Value) != "HELLO" {
		t.Errorf("Value = %q, want HELLO", rec.Value)
	}
	if n != HeaderLen+len(body) {
		t.Errorf("n = %d, want %d", n, HeaderLen+len(body))
	}
}

func TestReadEmptyValue(t *testing.T) {
	frame := makeRecord(0x0501, TypeData, nil)
	rec, _, err := Read(frame, 0)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if len(rec.Value) != 0 {
		t.Errorf("expected empty Value, got %d bytes", len(rec.Value))
	}
}

func TestReadTruncatedHeader(t *testing.T) {
	if _, _, err := Read([]byte{0x05, 0x20}, 0); err == nil {
		t.Errorf("expected truncation error")
	}
}

func TestReadTruncatedValue(t *testing.T) {
	frame := []byte{0x05, 0x20, byte(TypeData), 0x00, 0x05, 'A', 'B'}
	if _, _, err := Read(frame, 0); err == nil {
		t.Errorf("expected truncated-value error")
	}
}

func TestReadAtEnd(t *testing.T) {
	if _, _, err := Read(nil, 0); !errors.Is(err, io.EOF) {
		t.Errorf("expected io.EOF at end, got %v", err)
	}
}

func TestReadOversizeLength(t *testing.T) {
	// Maximum 16-bit length is 65535, well under MaxLength (1 MiB), so we
	// can't construct an oversize input directly. Use Walk on a sequence
	// that declares a giant length via a hand-crafted oversize cap.
	// Build a record claiming 0xFFFF bytes but only providing 1.
	frame := []byte{0x05, 0x20, byte(TypeData), 0xFF, 0xFF, 0x00}
	if _, _, err := Read(frame, 0); err == nil {
		t.Errorf("expected truncated-value error for oversize declared length")
	}
}

func TestTypePredicates(t *testing.T) {
	if !TypeData.IsData() || !TypeDataGen2.IsData() || !TypeDataGen2v2.IsData() {
		t.Errorf("data predicates wrong")
	}
	if !TypeSignature.IsSignature() || !TypeSignatureG2.IsSignature() || !TypeSignatureG2v.IsSignature() {
		t.Errorf("signature predicates wrong")
	}
	if TypeData.IsSignature() || TypeSignature.IsData() {
		t.Errorf("data/signature predicates overlap")
	}
	if TypeData.Generation() != 1 || TypeDataGen2.Generation() != 2 || TypeDataGen2v2.Generation() != 22 {
		t.Errorf("generation map wrong")
	}
}

func TestWalkMultipleRecords(t *testing.T) {
	var stream []byte
	stream = append(stream, makeRecord(0x0501, TypeData, []byte("A"))...)
	stream = append(stream, makeRecord(0x0501, TypeSignature, []byte("B"))...)
	stream = append(stream, makeRecord(0x0520, TypeData, []byte("CC"))...)

	var got []Record
	err := Walk(stream, func(r Record) error {
		got = append(got, r)
		return nil
	})
	if err != nil {
		t.Fatalf("Walk: %v", err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d records, want 3", len(got))
	}
	if got[0].FID != 0x0501 || got[1].Type != TypeSignature || got[2].FID != 0x0520 {
		t.Errorf("unexpected record sequence: %+v", got)
	}
}

func TestWalkStopsOnError(t *testing.T) {
	stream := makeRecord(0x0501, TypeData, []byte("X"))
	sentinel := errors.New("stop")
	err := Walk(stream, func(r Record) error { return sentinel })
	if err != sentinel {
		t.Errorf("Walk should return caller error verbatim, got %v", err)
	}
}

func FuzzRead(f *testing.F) {
	f.Add(makeRecord(0x0520, TypeData, []byte("HELLO")))
	f.Add([]byte{})
	f.Add([]byte{0x05, 0x20})
	f.Add([]byte{0x05, 0x20, byte(TypeData), 0xFF, 0xFF, 0x00})

	f.Fuzz(func(t *testing.T, data []byte) {
		// We assert only that the reader never panics. Errors are
		// expected for garbage input.
		_ = Walk(data, func(Record) error { return nil })
	})
}

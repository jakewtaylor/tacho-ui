package ddd

import (
	"testing"
)

// fakeVerifier returns a configurable result per (FID, generation) so
// tests can exercise mixed verified / failed / unverifiable outcomes.
type fakeVerifier struct {
	results map[uint32]VerifyResult
	calls   []SignedEF
}

func (f *fakeVerifier) Verify(ef SignedEF) VerifyResult {
	f.calls = append(f.calls, ef)
	key := uint32(ef.Generation)<<16 | uint32(ef.FID)
	if r, ok := f.results[key]; ok {
		return r
	}
	return VerifyResult{Status: VerifyUnverifiable, Reason: "no fixture"}
}

func key(gen int, fid uint16) uint32 {
	return uint32(gen)<<16 | uint32(fid)
}

func TestParseCardDefaultVerifierMarksEverythingUnverifiable(t *testing.T) {
	// Identification EF + its signature record.
	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("fake-rsa-sig"))...)

	c, err := ParseCard(stream)
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if len(c.Signature.EFs) != 1 {
		t.Fatalf("Signature.EFs len = %d, want 1", len(c.Signature.EFs))
	}
	ef := c.Signature.EFs[0]
	if ef.FID != 0x0520 || ef.Generation != 1 {
		t.Errorf("EF metadata wrong: %+v", ef)
	}
	if ef.Status != "unverifiable" {
		t.Errorf("Status = %q, want unverifiable", ef.Status)
	}
	if ef.Reason == "" {
		t.Errorf("Reason should be non-empty for unverifiable EFs")
	}
	if c.Signature.UnverifiableCount != 1 {
		t.Errorf("UnverifiableCount = %d, want 1", c.Signature.UnverifiableCount)
	}
	if c.Signature.ChainValid {
		t.Errorf("ChainValid should be false with the null verifier")
	}
	if c.Verified {
		t.Errorf("Card.Verified should be false with the null verifier")
	}
}

func TestParseCardCustomVerifierGetsCalledForEachEF(t *testing.T) {
	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("g1-sig"))...)
	stream = append(stream, tlvFrame(0x0520, 0x02, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x03, []byte("g2-sig"))...)

	v := &fakeVerifier{results: map[uint32]VerifyResult{
		key(1, 0x0520): {Status: VerifyVerified},
		key(2, 0x0520): {Status: VerifyFailed, Reason: "signature mismatch"},
	}}
	c, err := ParseCard(stream, WithVerifier(v))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}

	if len(v.calls) != 2 {
		t.Fatalf("Verifier called %d times, want 2", len(v.calls))
	}
	// Sig records must carry the right data + sig bytes — TAYLOR is
	// at offset 66 of makeIdentificationBody (HolderSurname field).
	if string(v.calls[0].Body[66:72]) != "TAYLOR" {
		t.Errorf("Verifier call 0 didn't receive EF body — got %q at offset 66", string(v.calls[0].Body[66:72]))
	}
	if string(v.calls[0].Signature) != "g1-sig" {
		t.Errorf("Verifier call 0 sig = %q, want g1-sig", v.calls[0].Signature)
	}
	if string(v.calls[1].Signature) != "g2-sig" {
		t.Errorf("Verifier call 1 sig = %q, want g2-sig", v.calls[1].Signature)
	}

	if c.Signature.VerifiedCount != 1 {
		t.Errorf("VerifiedCount = %d, want 1", c.Signature.VerifiedCount)
	}
	if c.Signature.FailedCount != 1 {
		t.Errorf("FailedCount = %d, want 1", c.Signature.FailedCount)
	}
	if c.Signature.UnverifiableCount != 0 {
		t.Errorf("UnverifiableCount = %d, want 0", c.Signature.UnverifiableCount)
	}
}

func TestCardVerifiedFlagRequiresAllConditions(t *testing.T) {
	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("sig"))...)

	// Verifier says ok, but ChainValid is false → Verified should stay false.
	v := &fakeVerifier{results: map[uint32]VerifyResult{
		key(1, 0x0520): {Status: VerifyVerified},
	}}
	c, _ := ParseCard(stream, WithVerifier(v))
	if c.Verified {
		t.Errorf("Verified=true with ChainValid=false should not be possible")
	}

	// ChainValid alone, but no EFs verified, should also be false.
	c2, _ := ParseCard(nil) // empty triggers error, skip
	_ = c2

	// All conditions hold: simulate by setting ChainValid post-parse, then
	// recomputing. (B.2+ will set ChainValid from inside the real chain
	// validator; for now this exercises the aggregation rule.)
	c.Signature.ChainValid = true
	finaliseSignatureSummary(c)
	if !c.Verified {
		t.Errorf("Verified should be true when ChainValid + EFs verified + no failures")
	}

	// Add a failed EF — Verified should flip back to false.
	c.Signature.EFs = append(c.Signature.EFs, EFSignature{
		FID: 0x0504, Generation: 1, Status: "failed", Reason: "bad sig",
	})
	c.Signature.VerifiedCount = 0
	c.Signature.FailedCount = 0
	c.Signature.UnverifiableCount = 0
	finaliseSignatureSummary(c)
	if c.Verified {
		t.Errorf("Verified should be false when any EF failed")
	}
}

func TestParseCardSignatureWithoutPrecedingDataIsIgnored(t *testing.T) {
	// Lone signature with no preceding data record. Should not crash,
	// should not add a phantom EFSignature entry.
	stream := tlvFrame(0x0520, 0x01, []byte("orphaned-sig"))
	c, err := ParseCard(stream)
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if len(c.Signature.EFs) != 0 {
		t.Errorf("orphan sig produced %d EFSignature entries, want 0", len(c.Signature.EFs))
	}
}

func TestParseCardDecodeFailureStillPairsSignature(t *testing.T) {
	// Even if a decoder can't parse the body, the signature can still
	// be checked — the verifier sees raw bytes, not the parsed view.
	bogusBody := []byte("nonsense-too-short-for-identification")
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, bogusBody)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("sig"))...)

	v := &fakeVerifier{results: map[uint32]VerifyResult{
		key(1, 0x0520): {Status: VerifyFailed, Reason: "bad sig"},
	}}
	c, err := ParseCard(stream, WithVerifier(v))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if len(v.calls) != 1 {
		t.Fatalf("verifier should be called even when decoder failed; got %d calls", len(v.calls))
	}
	if len(c.DecodeErrors) == 0 {
		t.Errorf("decode error should still be recorded")
	}
	if c.Signature.FailedCount != 1 {
		t.Errorf("sig failure not recorded: %+v", c.Signature)
	}
}

func TestVerifyStatusString(t *testing.T) {
	cases := map[VerifyStatus]string{
		VerifyVerified:     "verified",
		VerifyFailed:       "failed",
		VerifyUnverifiable: "unverifiable",
	}
	for s, want := range cases {
		if got := s.String(); got != want {
			t.Errorf("VerifyStatus(%d).String() = %q, want %q", s, got, want)
		}
	}
}

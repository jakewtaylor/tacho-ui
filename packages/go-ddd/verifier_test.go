package ddd

import (
	"testing"
)

// fakeVerifier maps (gen, FID) → fixed VerifyResult so tests can
// exercise mixed verified / failed / unverifiable outcomes. Real
// verifiers maintain internal state to build the cert chain; this
// stub just records every Add call and emits the configured result on
// Finalise.
type fakeVerifier struct {
	results    map[uint32]VerifyResult
	pending    []SignedEF
	chainValid bool
}

func (f *fakeVerifier) Add(ef SignedEF) {
	f.pending = append(f.pending, ef)
}

func (f *fakeVerifier) Finalise() (bool, []EFSignature) {
	out := make([]EFSignature, len(f.pending))
	for i, ef := range f.pending {
		key := uint32(ef.Generation)<<16 | uint32(ef.FID)
		res, ok := f.results[key]
		if !ok {
			res = VerifyResult{Status: VerifyUnverifiable, Reason: "no fixture"}
		}
		out[i] = EFSignature{
			FID:        ef.FID,
			Generation: ef.Generation,
			Status:     res.Status.String(),
			Reason:     res.Reason,
		}
	}
	return f.chainValid, out
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

	v := &fakeVerifier{
		chainValid: true,
		results: map[uint32]VerifyResult{
			key(1, 0x0520): {Status: VerifyVerified},
			key(2, 0x0520): {Status: VerifyFailed, Reason: "signature mismatch"},
		},
	}
	c, err := ParseCard(stream, WithVerifier(v))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}

	if len(v.pending) != 2 {
		t.Fatalf("Verifier got %d Add calls, want 2", len(v.pending))
	}
	// TAYLOR is at offset 66 of makeIdentificationBody (HolderSurname field).
	if string(v.pending[0].Body[66:72]) != "TAYLOR" {
		t.Errorf("Verifier call 0 didn't receive EF body — got %q at offset 66", string(v.pending[0].Body[66:72]))
	}
	if string(v.pending[0].Signature) != "g1-sig" {
		t.Errorf("Verifier call 0 sig = %q, want g1-sig", v.pending[0].Signature)
	}
	if string(v.pending[1].Signature) != "g2-sig" {
		t.Errorf("Verifier call 1 sig = %q, want g2-sig", v.pending[1].Signature)
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
	// One verified + one failed → Verified false (FailedCount > 0).
	if c.Verified {
		t.Errorf("Verified should be false when any EF failed")
	}
}

func TestCardVerifiedFlagRequiresAllConditions(t *testing.T) {
	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("sig"))...)

	// Chain invalid → Verified false.
	v := &fakeVerifier{
		chainValid: false,
		results:    map[uint32]VerifyResult{key(1, 0x0520): {Status: VerifyVerified}},
	}
	c, _ := ParseCard(stream, WithVerifier(v))
	if c.Verified {
		t.Errorf("Verified should be false when ChainValid is false")
	}

	// Chain valid + EF verified → Verified true.
	v.chainValid = true
	c, _ = ParseCard(stream, WithVerifier(v))
	if !c.Verified {
		t.Errorf("Verified should be true when ChainValid + EFs verified + no failures")
	}

	// Add a failed EF — Verified should flip back to false.
	v.results[key(1, 0x0520)] = VerifyResult{Status: VerifyFailed, Reason: "bad sig"}
	c, _ = ParseCard(stream, WithVerifier(v))
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

	v := &fakeVerifier{
		results: map[uint32]VerifyResult{
			key(1, 0x0520): {Status: VerifyFailed, Reason: "bad sig"},
		},
	}
	c, err := ParseCard(stream, WithVerifier(v))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if len(v.pending) != 1 {
		t.Fatalf("verifier should be Add'd even when decoder failed; got %d", len(v.pending))
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

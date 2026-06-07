package ddd

import "testing"

func TestCompositeVerifierMergesByBestStatus(t *testing.T) {
	gen1 := &fakeVerifier{
		chainValid: true,
		results: map[uint32]VerifyResult{
			key(1, 0x0520): {Status: VerifyVerified},
			// Gen2 EF passed through; sub-verifier returns "not applicable" via the default unverifiable result.
		},
	}
	gen2 := &fakeVerifier{
		chainValid: false,
		results: map[uint32]VerifyResult{
			key(2, 0x0520): {Status: VerifyFailed, Reason: "bad sig"},
		},
	}
	composite := NewCompositeVerifier(gen1, gen2)

	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("g1sig"))...)
	stream = append(stream, tlvFrame(0x0520, 0x02, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x03, []byte("g2sig"))...)

	c, err := ParseCard(stream, WithVerifier(composite))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if !c.Signature.ChainValid {
		t.Errorf("ChainValid should be true (gen1 sub reports valid)")
	}
	// Two distinct EFs: (1, 0x0520) verified, (2, 0x0520) failed.
	if len(c.Signature.EFs) != 2 {
		t.Fatalf("EFs len = %d, want 2", len(c.Signature.EFs))
	}
	statuses := map[uint32]string{}
	for _, ef := range c.Signature.EFs {
		statuses[uint32(ef.Generation)<<16|uint32(ef.FID)] = ef.Status
	}
	if s := statuses[key(1, 0x0520)]; s != "verified" {
		t.Errorf("Gen1 EF status = %q, want verified", s)
	}
	if s := statuses[key(2, 0x0520)]; s != "failed" {
		t.Errorf("Gen2 EF status = %q, want failed", s)
	}
}

func TestCompositeVerifierPicksVerifiedOverUnverifiable(t *testing.T) {
	// Both sub-verifiers see the same EF. One says verified, one
	// says unverifiable. Result should be verified.
	subA := &fakeVerifier{chainValid: true, results: map[uint32]VerifyResult{
		key(1, 0x0520): {Status: VerifyVerified},
	}}
	subB := &fakeVerifier{} // returns unverifiable for everything
	composite := NewCompositeVerifier(subA, subB)

	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("sig"))...)

	c, _ := ParseCard(stream, WithVerifier(composite))
	if len(c.Signature.EFs) != 1 {
		t.Fatalf("EFs len = %d, want 1", len(c.Signature.EFs))
	}
	if c.Signature.EFs[0].Status != "verified" {
		t.Errorf("Status = %q, want verified (better than unverifiable)", c.Signature.EFs[0].Status)
	}
}

func TestCompositeVerifierEmpty(t *testing.T) {
	composite := NewCompositeVerifier()
	body := makeIdentificationBody()
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, body)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("sig"))...)
	c, _ := ParseCard(stream, WithVerifier(composite))
	if len(c.Signature.EFs) != 0 {
		t.Errorf("empty composite should produce no EF results; got %d", len(c.Signature.EFs))
	}
	if c.Signature.ChainValid {
		t.Errorf("empty composite should not claim chain valid")
	}
}

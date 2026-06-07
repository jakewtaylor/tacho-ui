package ddd

import (
	"errors"
	"testing"
)

// TestEmbeddedERCAReturnsClearErrorWhenEmpty pins the UX of the
// constructors when the user hasn't run refresh-pks yet. The message
// must tell them what to do next.
func TestEmbeddedERCAReturnsClearErrorWhenEmpty(t *testing.T) {
	if len(embeddedERCAGen1) != 0 {
		t.Skip("embedded Gen1 ERCA key is populated; this test only runs when empty")
	}
	if _, err := NewGen1VerifierFromEmbedded(); err == nil {
		t.Errorf("expected ErrMissingERCAKey when erca_gen1.bin is empty, got nil")
	} else if !errors.Is(err, ErrMissingERCAKey) {
		t.Errorf("error doesn't wrap ErrMissingERCAKey: %v", err)
	}
}

func TestParseGen1ERCAPublicKeyRejectsWrongLength(t *testing.T) {
	if _, err := parseGen1ERCAPublicKey(make([]byte, 100)); err == nil {
		t.Errorf("expected error for wrong-length blob")
	}
}

func TestParseGen1ERCAPublicKeyParsesValidBlob(t *testing.T) {
	blob := make([]byte, 132)
	// Set a small modulus + exponent so we have something parseable.
	blob[127] = 0x65 // bottom byte of modulus
	// Exponent at offset 128..132, big-endian. Use 65537 (0x010001).
	blob[129] = 0x01
	blob[131] = 0x01
	pub, err := parseGen1ERCAPublicKey(blob)
	if err != nil {
		t.Fatalf("parseGen1ERCAPublicKey: %v", err)
	}
	if pub.E != 0x010001 {
		t.Errorf("exponent = 0x%X, want 0x010001", pub.E)
	}
	if pub.N.Uint64() != 0x65 {
		t.Errorf("modulus low byte = 0x%X, want 0x65", pub.N.Uint64())
	}
}

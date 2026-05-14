package crypto

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1" //nolint:gosec // mandated by spec
	"math/big"
	"testing"
)

// signISO9796_2Scheme1 is a test-only signer that produces the exact
// encoded-message format VerifyISO9796_2Scheme1 expects, so we can
// round-trip without pulling in another library.
func signISO9796_2Scheme1(t *testing.T, priv *rsa.PrivateKey, message []byte) (signature, nonRecoverable []byte) {
	t.Helper()
	k := priv.Size()
	const hashLen = sha1.Size
	mrLen := k - 2 - hashLen
	if len(message) < mrLen {
		t.Fatalf("test message must be at least %d bytes for round-trip", mrLen)
	}
	mr := message[:mrLen]
	nr := message[mrLen:]

	h := sha1.New() //nolint:gosec
	h.Write(message)
	digest := h.Sum(nil)

	encoded := make([]byte, k)
	encoded[0] = 0x6A
	copy(encoded[1:1+mrLen], mr)
	copy(encoded[1+mrLen:1+mrLen+hashLen], digest)
	encoded[k-1] = 0xBC

	// RSA "decrypt" the encoded message with the private key to make
	// the signature: s = encoded^d mod n.
	encodedInt := new(big.Int).SetBytes(encoded)
	if encodedInt.Cmp(priv.N) >= 0 {
		t.Fatalf("encoded message >= modulus — should never happen for header 0x6A")
	}
	sigInt := new(big.Int).Exp(encodedInt, priv.D, priv.N)
	sig := make([]byte, k)
	sigBytes := sigInt.Bytes()
	copy(sig[k-len(sigBytes):], sigBytes)
	return sig, nr
}

func TestVerifyISO9796_2RoundTrip(t *testing.T) {
	priv, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("GenerateKey: %v", err)
	}
	// 164-byte message — matches Gen1 cert content length.
	message := make([]byte, 164)
	for i := range message {
		message[i] = byte(i)
	}
	sig, nr := signISO9796_2Scheme1(t, priv, message)

	recovered, err := VerifyISO9796_2Scheme1(&priv.PublicKey, sig, nr)
	if err != nil {
		t.Fatalf("VerifyISO9796_2Scheme1: %v", err)
	}
	if len(recovered) != len(message) {
		t.Fatalf("recovered len %d != message len %d", len(recovered), len(message))
	}
	for i := range message {
		if recovered[i] != message[i] {
			t.Fatalf("recovered byte %d = 0x%02X, want 0x%02X", i, recovered[i], message[i])
		}
	}
}

func TestVerifyISO9796_2RejectsTamperedSignature(t *testing.T) {
	priv, _ := rsa.GenerateKey(rand.Reader, 1024)
	message := make([]byte, 164)
	for i := range message {
		message[i] = byte(i)
	}
	sig, nr := signISO9796_2Scheme1(t, priv, message)

	sig[10] ^= 0x01
	if _, err := VerifyISO9796_2Scheme1(&priv.PublicKey, sig, nr); err == nil {
		t.Errorf("expected error for tampered signature, got nil")
	}
}

func TestVerifyISO9796_2RejectsTamperedNonRecoverable(t *testing.T) {
	priv, _ := rsa.GenerateKey(rand.Reader, 1024)
	message := make([]byte, 164)
	for i := range message {
		message[i] = byte(i)
	}
	sig, nr := signISO9796_2Scheme1(t, priv, message)

	nrCopy := append([]byte(nil), nr...)
	nrCopy[5] ^= 0x01
	if _, err := VerifyISO9796_2Scheme1(&priv.PublicKey, sig, nrCopy); err == nil {
		t.Errorf("expected hash mismatch error, got nil")
	}
}

func TestVerifyISO9796_2WrongKey(t *testing.T) {
	priv, _ := rsa.GenerateKey(rand.Reader, 1024)
	priv2, _ := rsa.GenerateKey(rand.Reader, 1024)
	message := make([]byte, 164)
	for i := range message {
		message[i] = byte(i)
	}
	sig, nr := signISO9796_2Scheme1(t, priv, message)

	if _, err := VerifyISO9796_2Scheme1(&priv2.PublicKey, sig, nr); err == nil {
		t.Errorf("expected error verifying with wrong key, got nil")
	}
}

func TestVerifyISO9796_2WrongSignatureLength(t *testing.T) {
	priv, _ := rsa.GenerateKey(rand.Reader, 1024)
	if _, err := VerifyISO9796_2Scheme1(&priv.PublicKey, make([]byte, 127), nil); err == nil {
		t.Errorf("expected error for short signature, got nil")
	}
}

package ddd

import (
	stdcrypto "crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1" //nolint:gosec // mandated by Reg. 2016/799 Annex IC App. 11 Part A §6
	"encoding/binary"
	"math/big"
	"testing"
	"time"
)

// gen1CertFixture constructs a 194-byte Gen1 certificate signed by
// `signer` for a holder identified by `chr` carrying the given public
// key. Mirrors makeGen1CertBytes in the internal/crypto tests but
// kept inline here so the public-package test suite is self-contained.
func gen1CertFixture(t *testing.T, signer *rsa.PrivateKey, car, chr [8]byte, eov time.Time, holderPub *rsa.PublicKey) []byte {
	t.Helper()
	content := make([]byte, 164)
	content[0] = 0x01
	copy(content[1:9], car[:])
	for i := 9; i < 16; i++ {
		content[i] = 0xFF
	}
	binary.BigEndian.PutUint32(content[16:20], uint32(eov.Unix()))
	copy(content[20:28], chr[:])
	modBytes := holderPub.N.Bytes()
	copy(content[28+(128-len(modBytes)):], modBytes)
	expBytes := big.NewInt(int64(holderPub.E)).Bytes()
	copy(content[156+(8-len(expBytes)):], expBytes)

	const hashLen = sha1.Size
	mrLen := 128 - 2 - hashLen // 106
	h := sha1.New()            //nolint:gosec
	h.Write(content)
	digest := h.Sum(nil)
	encoded := make([]byte, 128)
	encoded[0] = 0x6A
	copy(encoded[1:1+mrLen], content[:mrLen])
	copy(encoded[1+mrLen:1+mrLen+hashLen], digest)
	encoded[127] = 0xBC
	encodedInt := new(big.Int).SetBytes(encoded)
	sigInt := new(big.Int).Exp(encodedInt, signer.D, signer.N)
	sig := make([]byte, 128)
	sigBytes := sigInt.Bytes()
	copy(sig[128-len(sigBytes):], sigBytes)

	out := make([]byte, 194)
	copy(out[0:128], sig)
	copy(out[128:186], content[mrLen:])
	copy(out[186:194], car[:])
	return out
}

// gen1EFSig signs `body` under PKCS#1 v1.5 + SHA-1 to produce a per-EF
// signature record (App. 11 Part A §6 CSM_034).
func gen1EFSig(t *testing.T, signer *rsa.PrivateKey, body []byte) []byte {
	t.Helper()
	h := sha1.Sum(body) //nolint:gosec
	sig, err := rsa.SignPKCS1v15(rand.Reader, signer, stdcrypto.SHA1, h[:])
	if err != nil {
		t.Fatalf("SignPKCS1v15: %v", err)
	}
	return sig
}

func TestGen1VerifierHappyPath(t *testing.T) {
	ercaKey, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("GenerateKey ERCA: %v", err)
	}
	mscaKey, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("GenerateKey MSCA: %v", err)
	}
	cardKey, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("GenerateKey card: %v", err)
	}

	ercaCHR := [8]byte{0xFD, 'E', 'C', ' ', 0x01, 0x00, 0x00, 0xFF}
	mscaCHR := [8]byte{0x15, 'G', 'B', 'R', 0x01, 0x00, 0x00, 0xFF}
	cardCHR := [8]byte{0x15, 'G', 'B', 'R', 0x01, 0xAB, 0xCD, 0xEF}
	eov := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)

	// MSCA cert: signed by ERCA, holder = MSCA key.
	caCertBytes := gen1CertFixture(t, ercaKey, ercaCHR, mscaCHR, eov, &mscaKey.PublicKey)
	// Card cert: signed by MSCA, holder = card key.
	cardCertBytes := gen1CertFixture(t, mscaKey, mscaCHR, cardCHR, eov, &cardKey.PublicKey)

	// EF_Identification body + per-EF signature signed by card key.
	idBody := makeIdentificationBody()
	idSig := gen1EFSig(t, cardKey, idBody)

	// Build a stream: C100 (card cert), C108 (CA cert), EF_Identification, sig.
	stream := append([]byte(nil), tlvFrame(0xC100, 0x00, cardCertBytes)...)
	stream = append(stream, tlvFrame(0xC108, 0x00, caCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x00, idBody)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, idSig)...)

	v := NewGen1Verifier(&ercaKey.PublicKey)
	c, err := ParseCard(stream, WithVerifier(v))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if !c.Signature.ChainValid {
		t.Fatalf("ChainValid should be true (ERCA → MSCA → card); EFs = %+v", c.Signature.EFs)
	}
	if c.Signature.VerifiedCount != 1 {
		t.Fatalf("VerifiedCount = %d, want 1; EFs = %+v", c.Signature.VerifiedCount, c.Signature.EFs)
	}
	if c.Signature.FailedCount != 0 {
		t.Errorf("FailedCount = %d, want 0", c.Signature.FailedCount)
	}
	if !c.Verified {
		t.Errorf("Card.Verified should be true")
	}
}

func TestGen1VerifierTamperedEFFailsButChainStaysValid(t *testing.T) {
	ercaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	mscaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	cardKey, _ := rsa.GenerateKey(rand.Reader, 1024)

	caCertBytes := gen1CertFixture(t, ercaKey, [8]byte{}, [8]byte{}, time.Now().Add(time.Hour*24*365*5), &mscaKey.PublicKey)
	cardCertBytes := gen1CertFixture(t, mscaKey, [8]byte{}, [8]byte{}, time.Now().Add(time.Hour*24*365*5), &cardKey.PublicKey)

	idBody := makeIdentificationBody()
	idSig := gen1EFSig(t, cardKey, idBody)

	// Tamper with the EF body (flip one byte) — sig should no longer match.
	tampered := append([]byte(nil), idBody...)
	tampered[5] ^= 0x01

	stream := append([]byte(nil), tlvFrame(0xC100, 0x00, cardCertBytes)...)
	stream = append(stream, tlvFrame(0xC108, 0x00, caCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x00, tampered)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, idSig)...)

	v := NewGen1Verifier(&ercaKey.PublicKey)
	c, _ := ParseCard(stream, WithVerifier(v))

	if !c.Signature.ChainValid {
		t.Errorf("chain should still be valid; EF tamper doesn't invalidate chain")
	}
	if c.Signature.FailedCount != 1 {
		t.Errorf("FailedCount = %d, want 1; EFs = %+v", c.Signature.FailedCount, c.Signature.EFs)
	}
	if c.Verified {
		t.Errorf("Card.Verified should be false when any EF failed")
	}
}

func TestGen1VerifierMissingMSCAReportsChainInvalid(t *testing.T) {
	ercaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	mscaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	cardKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	cardCertBytes := gen1CertFixture(t, mscaKey, [8]byte{}, [8]byte{}, time.Now().Add(time.Hour*24*365), &cardKey.PublicKey)

	// Build a stream WITHOUT EF_CA_Certificate.
	idBody := makeIdentificationBody()
	idSig := gen1EFSig(t, cardKey, idBody)
	stream := append([]byte(nil), tlvFrame(0xC100, 0x00, cardCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x00, idBody)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, idSig)...)

	v := NewGen1Verifier(&ercaKey.PublicKey)
	c, _ := ParseCard(stream, WithVerifier(v))

	if c.Signature.ChainValid {
		t.Errorf("ChainValid should be false without EF_CA_Certificate")
	}
	if c.Signature.UnverifiableCount != 1 {
		t.Errorf("UnverifiableCount = %d, want 1; EFs = %+v", c.Signature.UnverifiableCount, c.Signature.EFs)
	}
	if c.Signature.EFs[0].Reason == "" {
		t.Errorf("Reason should explain why the EF was unverifiable")
	}
}

func TestGen1VerifierWrongERCARootRejectsChain(t *testing.T) {
	ercaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	otherERCAKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	mscaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	cardKey, _ := rsa.GenerateKey(rand.Reader, 1024)

	caCertBytes := gen1CertFixture(t, ercaKey, [8]byte{}, [8]byte{}, time.Now().Add(time.Hour*24*365), &mscaKey.PublicKey)
	cardCertBytes := gen1CertFixture(t, mscaKey, [8]byte{}, [8]byte{}, time.Now().Add(time.Hour*24*365), &cardKey.PublicKey)
	idBody := makeIdentificationBody()
	idSig := gen1EFSig(t, cardKey, idBody)

	stream := append([]byte(nil), tlvFrame(0xC100, 0x00, cardCertBytes)...)
	stream = append(stream, tlvFrame(0xC108, 0x00, caCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x00, idBody)...)
	stream = append(stream, tlvFrame(0x0520, 0x01, idSig)...)

	// Configure the verifier with the WRONG ERCA root.
	v := NewGen1Verifier(&otherERCAKey.PublicKey)
	c, _ := ParseCard(stream, WithVerifier(v))

	if c.Signature.ChainValid {
		t.Errorf("ChainValid should be false when ERCA root doesn't match")
	}
	if c.Verified {
		t.Errorf("Card.Verified should be false")
	}
}

func TestGen1VerifierIgnoresGen2EFs(t *testing.T) {
	// A Gen1 verifier should not assert anything about Gen2 EFs — they
	// belong to the Gen2 verifier. Test by feeding a Gen2 EF and
	// expecting "unverifiable / Gen1 verifier not applicable".
	ercaKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	stream := append([]byte(nil), tlvFrame(0x0520, 0x02, makeIdentificationBody())...)
	stream = append(stream, tlvFrame(0x0520, 0x03, []byte("gen2-sig"))...)

	v := NewGen1Verifier(&ercaKey.PublicKey)
	c, _ := ParseCard(stream, WithVerifier(v))

	if len(c.Signature.EFs) != 1 {
		t.Fatalf("EFs len = %d, want 1", len(c.Signature.EFs))
	}
	if c.Signature.EFs[0].Status != "unverifiable" {
		t.Errorf("Gen2 EF status = %q, want unverifiable", c.Signature.EFs[0].Status)
	}
}

package ddd

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"hash"
	"math/big"
	"testing"
	"time"

	internalcrypto "github.com/jakewtaylor/go-ddd/internal/crypto"
)

// brainpoolP256r1ForTest is the BrainpoolP256r1 curve, fetched from
// internal/crypto for use in this package's tests only. Tests in the
// outer (public) package can import internal/* freely since they're
// inside the same module.
var brainpoolP256r1ForTest = internalcrypto.BrainpoolP256r1()

// gen2CurveOID is the on-wire OID for BrainpoolP256r1.
var gen2CurveOID = []byte{0x2B, 0x24, 0x03, 0x03, 0x02, 0x08, 0x01, 0x01, 0x07}

// brainpoolP256r1ForTest is fetched via a package-internal helper to
// avoid pulling internal/crypto into the public-package test binary.
// We re-use crypto/elliptic.P256() — wait, no, we need the actual
// Brainpool curve. Since the public package can't import
// internal/crypto, we generate a fresh package-level binding.

// gen2DERTag emits a DER tag (1 or 2 bytes).
func gen2DERTag(tag uint16) []byte {
	if tag > 0xFF {
		return []byte{byte(tag >> 8), byte(tag)}
	}
	return []byte{byte(tag)}
}

func gen2DERLen(n int) []byte {
	switch {
	case n < 0x80:
		return []byte{byte(n)}
	case n <= 0xFF:
		return []byte{0x81, byte(n)}
	default:
		return []byte{0x82, byte(n >> 8), byte(n)}
	}
}

func gen2DERTLV(tag uint16, value []byte) []byte {
	out := append([]byte(nil), gen2DERTag(tag)...)
	out = append(out, gen2DERLen(len(value))...)
	return append(out, value...)
}

func gen2PaddedBytes(n *big.Int, size int) []byte {
	out := make([]byte, size)
	b := n.Bytes()
	copy(out[size-len(b):], b)
	return out
}

// gen2BuildCert assembles a complete Gen2 cert (with outer 7F21
// wrapper) signed by `signer`, encoding `holderPub` as the cert's key.
// Returns the on-wire bytes ready to drop into an EF body.
func gen2BuildCert(t *testing.T, signer *ecdsa.PrivateKey, holderPub *ecdsa.PublicKey,
	curve elliptic.Curve, hashNew func() hash.Hash,
	car, chr [8]byte, effective, expires time.Time,
) []byte {
	t.Helper()
	coordLen := (curve.Params().BitSize + 7) / 8
	// Body content:
	body := append([]byte(nil), gen2DERTLV(0x5F29, []byte{0x00})...) // CPI = 0
	body = append(body, gen2DERTLV(0x42, car[:])...)
	body = append(body, gen2DERTLV(0x5F4C, []byte{0xFF, 0x53, 0x4D, 0x52, 0x44, 0x54, 0x11})...)

	// Public key: 06 OID || 86 point
	xBytes := gen2PaddedBytes(holderPub.X, coordLen)
	yBytes := gen2PaddedBytes(holderPub.Y, coordLen)
	point := append([]byte{0x04}, append(xBytes, yBytes...)...)
	pk := append(gen2DERTLV(0x06, gen2CurveOID), gen2DERTLV(0x86, point)...)
	body = append(body, gen2DERTLV(0x7F49, pk)...)

	body = append(body, gen2DERTLV(0x5F20, chr[:])...)
	dateBytes := func(t time.Time) []byte {
		b := make([]byte, 4)
		binary.BigEndian.PutUint32(b, uint32(t.Unix()))
		return b
	}
	body = append(body, gen2DERTLV(0x5F25, dateBytes(effective))...)
	body = append(body, gen2DERTLV(0x5F24, dateBytes(expires))...)

	bodyTLV := gen2DERTLV(0x7F4E, body)

	// Sign the body TLV (tag+length+content).
	h := hashNew()
	h.Write(bodyTLV)
	digest := h.Sum(nil)
	r, s, err := ecdsa.Sign(rand.Reader, signer, digest)
	if err != nil {
		t.Fatalf("ecdsa.Sign cert body: %v", err)
	}
	sCoordLen := (signer.PublicKey.Curve.Params().BitSize + 7) / 8
	sig := append(gen2PaddedBytes(r, sCoordLen), gen2PaddedBytes(s, sCoordLen)...)
	sigTLV := gen2DERTLV(0x5F37, sig)

	inner := append(bodyTLV, sigTLV...)
	return gen2DERTLV(0x7F21, inner)
}

// gen2EFSig produces a plain-format ECDSA signature (r||s) of `body`
// under `signer` for use as a per-EF Gen2 signature record.
func gen2EFSig(t *testing.T, signer *ecdsa.PrivateKey, body []byte) []byte {
	t.Helper()
	h := sha256.Sum256(body)
	r, s, err := ecdsa.Sign(rand.Reader, signer, h[:])
	if err != nil {
		t.Fatalf("ecdsa.Sign EF: %v", err)
	}
	coordLen := (signer.PublicKey.Curve.Params().BitSize + 7) / 8
	return append(gen2PaddedBytes(r, coordLen), gen2PaddedBytes(s, coordLen)...)
}

// gen2CurveFromTestPackage exposes the curve internal/crypto uses.
// We avoid importing internal/crypto from this test file by piggybacking
// on the Gen2 verifier's chain code, which produces a parsed Gen2Cert
// with c.PublicKey.Curve set. For test cert generation we just use
// crypto/elliptic.P256()... no wait, we need the actual Brainpool
// curve to match what ParseGen2Cert resolves via the OID. Brainpool
// has to be created via the internal package.
//
// Workaround: drive everything via `ecdsa.GenerateKey(curve, rand.Reader)`
// using a curve obtained via a tiny pass-through that internal/crypto
// happens to expose for tests. Since internal/crypto is internal-only
// for the production code, we add a re-export hook below.

// gen2Curve grabs the BrainpoolP256r1 curve via the internal crypto
// package — used only in tests. Test files in this package can import
// internal/crypto since the import-restriction is on the .go (non-
// test) files of OUTSIDE packages; internal/* is freely importable
// from within the same module.
func gen2Curve(t *testing.T) elliptic.Curve {
	t.Helper()
	c := brainpoolP256r1ForTest
	if c == nil {
		t.Fatalf("brainpoolP256r1ForTest not initialised")
	}
	return c
}

func TestGen2VerifierHappyPath(t *testing.T) {
	curve := gen2Curve(t)
	ercaKey, err := ecdsa.GenerateKey(curve, rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey ERCA: %v", err)
	}
	mscaKey, err := ecdsa.GenerateKey(curve, rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey MSCA: %v", err)
	}
	signKey, err := ecdsa.GenerateKey(curve, rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey sign: %v", err)
	}

	caCertBytes := gen2BuildCert(t, ercaKey, &mscaKey.PublicKey, curve, sha256.New,
		[8]byte{0xFD, 'E', 'C', ' ', 0x01, 0x00, 0x00, 0xFF},
		[8]byte{0x15, 'G', 'B', 'R', 0x01, 0x00, 0x00, 0xFF},
		time.Now().Add(-time.Hour*24*365), time.Now().Add(time.Hour*24*365*5))
	signCertBytes := gen2BuildCert(t, mscaKey, &signKey.PublicKey, curve, sha256.New,
		[8]byte{0x15, 'G', 'B', 'R', 0x01, 0x00, 0x00, 0xFF},
		[8]byte{0x15, 'G', 'B', 'R', 0x01, 0xAB, 0xCD, 0xEF},
		time.Now().Add(-time.Hour*24*365), time.Now().Add(time.Hour*24*365*5))

	idBody := makeIdentificationBody()
	idSig := gen2EFSig(t, signKey, idBody)

	stream := append([]byte(nil), tlvFrame(0xC101, 0x02, signCertBytes)...)
	stream = append(stream, tlvFrame(0xC108, 0x02, caCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x02, idBody)...)
	stream = append(stream, tlvFrame(0x0520, 0x03, idSig)...)

	v := NewGen2Verifier(&ercaKey.PublicKey, sha256.New)
	c, err := ParseCard(stream, WithVerifier(v))
	if err != nil {
		t.Fatalf("ParseCard: %v", err)
	}
	if !c.Signature.ChainValid {
		t.Fatalf("ChainValid should be true (ERCA → MSCA → signCert); EFs = %+v", c.Signature.EFs)
	}
	if c.Signature.VerifiedCount != 1 {
		t.Fatalf("VerifiedCount = %d, want 1; EFs = %+v", c.Signature.VerifiedCount, c.Signature.EFs)
	}
	if !c.Verified {
		t.Errorf("Card.Verified should be true")
	}
}

func TestGen2VerifierTamperedEFFails(t *testing.T) {
	curve := gen2Curve(t)
	ercaKey, _ := ecdsa.GenerateKey(curve, rand.Reader)
	mscaKey, _ := ecdsa.GenerateKey(curve, rand.Reader)
	signKey, _ := ecdsa.GenerateKey(curve, rand.Reader)

	caCertBytes := gen2BuildCert(t, ercaKey, &mscaKey.PublicKey, curve, sha256.New,
		[8]byte{}, [8]byte{}, time.Now(), time.Now().Add(time.Hour*24*365))
	signCertBytes := gen2BuildCert(t, mscaKey, &signKey.PublicKey, curve, sha256.New,
		[8]byte{}, [8]byte{}, time.Now(), time.Now().Add(time.Hour*24*365))

	idBody := makeIdentificationBody()
	idSig := gen2EFSig(t, signKey, idBody)
	tampered := append([]byte(nil), idBody...)
	tampered[5] ^= 0x01

	stream := append([]byte(nil), tlvFrame(0xC101, 0x02, signCertBytes)...)
	stream = append(stream, tlvFrame(0xC108, 0x02, caCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x02, tampered)...)
	stream = append(stream, tlvFrame(0x0520, 0x03, idSig)...)

	v := NewGen2Verifier(&ercaKey.PublicKey, sha256.New)
	c, _ := ParseCard(stream, WithVerifier(v))
	if !c.Signature.ChainValid {
		t.Errorf("chain should be valid even with EF body tampered")
	}
	if c.Signature.FailedCount != 1 {
		t.Errorf("FailedCount = %d, want 1; EFs = %+v", c.Signature.FailedCount, c.Signature.EFs)
	}
}

func TestGen2VerifierMissingCertChainInvalid(t *testing.T) {
	curve := gen2Curve(t)
	ercaKey, _ := ecdsa.GenerateKey(curve, rand.Reader)
	signKey, _ := ecdsa.GenerateKey(curve, rand.Reader)
	mscaKey, _ := ecdsa.GenerateKey(curve, rand.Reader)
	signCertBytes := gen2BuildCert(t, mscaKey, &signKey.PublicKey, curve, sha256.New,
		[8]byte{}, [8]byte{}, time.Now(), time.Now().Add(time.Hour*24*365))

	// No C108!
	idBody := makeIdentificationBody()
	idSig := gen2EFSig(t, signKey, idBody)
	stream := append([]byte(nil), tlvFrame(0xC101, 0x02, signCertBytes)...)
	stream = append(stream, tlvFrame(0x0520, 0x02, idBody)...)
	stream = append(stream, tlvFrame(0x0520, 0x03, idSig)...)

	v := NewGen2Verifier(&ercaKey.PublicKey, sha256.New)
	c, _ := ParseCard(stream, WithVerifier(v))
	if c.Signature.ChainValid {
		t.Errorf("ChainValid should be false without EF_CA_Certificate")
	}
	if c.Signature.UnverifiableCount != 1 {
		t.Errorf("UnverifiableCount = %d, want 1", c.Signature.UnverifiableCount)
	}
}

func TestGen2VerifierIgnoresGen1EFs(t *testing.T) {
	curve := gen2Curve(t)
	ercaKey, _ := ecdsa.GenerateKey(curve, rand.Reader)
	stream := append([]byte(nil), tlvFrame(0x0520, 0x00, makeIdentificationBody())...)
	stream = append(stream, tlvFrame(0x0520, 0x01, []byte("gen1-sig"))...)

	v := NewGen2Verifier(&ercaKey.PublicKey, sha256.New)
	c, _ := ParseCard(stream, WithVerifier(v))
	if len(c.Signature.EFs) != 1 {
		t.Fatalf("EFs len = %d, want 1", len(c.Signature.EFs))
	}
	if c.Signature.EFs[0].Status != "unverifiable" {
		t.Errorf("Gen1 EF status = %q, want unverifiable", c.Signature.EFs[0].Status)
	}
}

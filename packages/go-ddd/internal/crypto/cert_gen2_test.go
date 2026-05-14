package crypto

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
)

// gen2CertBuilder is a tiny test helper that builds the DER-TLV
// encoding of a Gen2 certificate body + signs it, returning the on-
// wire bytes (with outer 7F21 wrapper).
type gen2CertBuilder struct {
	t                 *testing.T
	profileIdentifier int
	car               [8]byte
	cha               [7]byte
	curve             elliptic.Curve
	curveOID          []byte
	hashNew           func() hash.Hash
	holderPub         *ecdsa.PublicKey
	chr               [8]byte
	effectiveDate     time.Time
	expirationDate    time.Time
}

func (b *gen2CertBuilder) buildBody() []byte {
	body := []byte{}
	body = append(body, derTLVBytes(b.t, tagProfileIdentifier, []byte{byte(b.profileIdentifier)})...)
	body = append(body, derTLVBytes(b.t, tagCAR, b.car[:])...)
	body = append(body, derTLVBytes(b.t, tagCHA, b.cha[:])...)

	// Public Key 7F49 = [06 oid] [86 04||X||Y]
	coordLen := (b.curve.Params().BitSize + 7) / 8
	xBytes := paddedBytes(b.holderPub.X, coordLen)
	yBytes := paddedBytes(b.holderPub.Y, coordLen)
	point := append([]byte{0x04}, append(xBytes, yBytes...)...)
	pk := append(derTLVBytes(b.t, tagDomainParameters, b.curveOID), derTLVBytes(b.t, tagPublicPoint, point)...)
	body = append(body, derTLVBytes(b.t, tagPublicKey, pk)...)

	body = append(body, derTLVBytes(b.t, tagCHR, b.chr[:])...)
	eov := make([]byte, 4)
	binary.BigEndian.PutUint32(eov, uint32(b.effectiveDate.Unix()))
	body = append(body, derTLVBytes(b.t, tagEffectiveDate, eov)...)
	exd := make([]byte, 4)
	binary.BigEndian.PutUint32(exd, uint32(b.expirationDate.Unix()))
	body = append(body, derTLVBytes(b.t, tagExpirationDate, exd)...)

	return body
}

func (b *gen2CertBuilder) sign(signer *ecdsa.PrivateKey) []byte {
	bodyContent := b.buildBody()
	bodyTLV := derTLVBytes(b.t, tagCertBody, bodyContent)

	// Sign the encoded body (tag + length + content).
	h := b.hashNew()
	h.Write(bodyTLV)
	digest := h.Sum(nil)
	r, s, err := ecdsa.Sign(rand.Reader, signer, digest)
	if err != nil {
		b.t.Fatalf("ecdsa.Sign: %v", err)
	}
	coordLen := (signer.PublicKey.Curve.Params().BitSize + 7) / 8
	sig := append(paddedBytes(r, coordLen), paddedBytes(s, coordLen)...)
	sigTLV := derTLVBytes(b.t, tagSignature, sig)

	inner := append(bodyTLV, sigTLV...)
	return derTLVBytes(b.t, tagECCCertificate, inner)
}

func derTLVBytes(t *testing.T, tag derTag, value []byte) []byte {
	t.Helper()
	out := []byte{}
	if tag > 0xFF {
		out = append(out, byte(tag>>8), byte(tag))
	} else {
		out = append(out, byte(tag))
	}
	// Length encoding.
	switch {
	case len(value) < 0x80:
		out = append(out, byte(len(value)))
	case len(value) <= 0xFF:
		out = append(out, 0x81, byte(len(value)))
	case len(value) <= 0xFFFF:
		out = append(out, 0x82, byte(len(value)>>8), byte(len(value)))
	default:
		t.Fatalf("derTLVBytes: value too long (%d bytes)", len(value))
	}
	out = append(out, value...)
	return out
}

func paddedBytes(n *big.Int, size int) []byte {
	out := make([]byte, size)
	b := n.Bytes()
	copy(out[size-len(b):], b)
	return out
}

func TestParseGen2CertRoundTripBrainpoolP256(t *testing.T) {
	caKey, err := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey CA: %v", err)
	}
	holderKey, err := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	if err != nil {
		t.Fatalf("GenerateKey holder: %v", err)
	}

	b := &gen2CertBuilder{
		t:                 t,
		profileIdentifier: 0,
		car:               [8]byte{0xFD, 'E', 'C', ' ', 0x01, 0x00, 0x00, 0xFF},
		cha:               [7]byte{0xFF, 0x53, 0x4D, 0x52, 0x44, 0x54, 0x11},
		curve:             BrainpoolP256r1(),
		curveOID:          oidBrainpoolP256r1,
		hashNew:           sha256.New,
		holderPub:         &holderKey.PublicKey,
		chr:               [8]byte{0x15, 'G', 'B', 'R', 0x01, 0xAB, 0xCD, 0xEF},
		effectiveDate:     time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
		expirationDate:    time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC),
	}
	raw := b.sign(caKey)

	c, err := ParseGen2Cert(raw)
	if err != nil {
		t.Fatalf("ParseGen2Cert: %v", err)
	}
	if c.ProfileIdentifier != 0 {
		t.Errorf("ProfileIdentifier = %d, want 0", c.ProfileIdentifier)
	}
	if c.CAR != b.car {
		t.Errorf("CAR = %v, want %v", c.CAR, b.car)
	}
	if c.CHR != b.chr {
		t.Errorf("CHR = %v, want %v", c.CHR, b.chr)
	}
	if !c.EffectiveDate.Equal(b.effectiveDate) {
		t.Errorf("EffectiveDate = %v, want %v", c.EffectiveDate, b.effectiveDate)
	}
	if !c.ExpirationDate.Equal(b.expirationDate) {
		t.Errorf("ExpirationDate = %v, want %v", c.ExpirationDate, b.expirationDate)
	}
	if c.PublicKey == nil {
		t.Fatalf("PublicKey nil")
	}
	if c.PublicKey.X.Cmp(holderKey.PublicKey.X) != 0 || c.PublicKey.Y.Cmp(holderKey.PublicKey.Y) != 0 {
		t.Errorf("Public key coords don't match")
	}
	if c.Verified() {
		t.Errorf("Verified should be false before Verify()")
	}

	if err := c.Verify(&caKey.PublicKey, sha256.New); err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !c.Verified() {
		t.Errorf("Verified() should be true after Verify()")
	}
}

func TestVerifyGen2CertRejectsWrongSigner(t *testing.T) {
	caKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	otherKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	holderKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)

	b := &gen2CertBuilder{
		t: t, curve: BrainpoolP256r1(), curveOID: oidBrainpoolP256r1,
		hashNew: sha256.New, holderPub: &holderKey.PublicKey,
		effectiveDate: time.Now(), expirationDate: time.Now().Add(time.Hour),
	}
	raw := b.sign(caKey)
	c, _ := ParseGen2Cert(raw)
	if err := c.Verify(&otherKey.PublicKey, sha256.New); err == nil {
		t.Errorf("expected verification failure with wrong signer key")
	}
}

func TestParseGen2CertRejectsCorruptOID(t *testing.T) {
	caKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	holderKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	b := &gen2CertBuilder{
		t: t, curve: BrainpoolP256r1(),
		curveOID: []byte{0x00, 0x00, 0x00, 0x00},
		hashNew:  sha256.New, holderPub: &holderKey.PublicKey,
		effectiveDate: time.Now(), expirationDate: time.Now().Add(time.Hour),
	}
	raw := b.sign(caKey)
	if _, err := ParseGen2Cert(raw); err == nil {
		t.Errorf("expected parse error for unknown OID")
	}
}

func TestVerifyDataRoundTripGen2(t *testing.T) {
	caKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	holderKey, _ := ecdsa.GenerateKey(BrainpoolP256r1(), rand.Reader)
	b := &gen2CertBuilder{
		t: t, curve: BrainpoolP256r1(), curveOID: oidBrainpoolP256r1,
		hashNew: sha256.New, holderPub: &holderKey.PublicKey,
		effectiveDate: time.Now(), expirationDate: time.Now().Add(time.Hour),
	}
	raw := b.sign(caKey)
	c, _ := ParseGen2Cert(raw)
	if err := c.Verify(&caKey.PublicKey, sha256.New); err != nil {
		t.Fatalf("cert verify: %v", err)
	}

	// Sign some data with the holder key, then verify via the cert.
	data := []byte("some EF body")
	h := sha256.Sum256(data)
	r, s, _ := ecdsa.Sign(rand.Reader, holderKey, h[:])
	coordLen := 32
	sig := append(paddedBytes(r, coordLen), paddedBytes(s, coordLen)...)
	if err := c.VerifyData(data, sig); err != nil {
		t.Errorf("VerifyData: %v", err)
	}
	// Tamper → should fail.
	if err := c.VerifyData([]byte("tampered"), sig); err == nil {
		t.Errorf("expected VerifyData failure on tampered data")
	}
}

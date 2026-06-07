package crypto

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/binary"
	"math/big"
	"testing"
	"time"
)

// makeGen1CertBytes constructs a 194-byte Gen1 cert signed by `signer`
// for a holder identified by `chr` carrying the given public key. The
// returned bytes match the on-wire layout the parser expects.
func makeGen1CertBytes(t *testing.T, signer *rsa.PrivateKey, car, chr KeyIdentifier, eov time.Time, holderPub *rsa.PublicKey) []byte {
	t.Helper()
	content := make([]byte, 164)
	content[0] = 0x01 // profile identifier
	copy(content[1:9], car[:])
	// CHA: spec field, content opaque for the test
	for i := 9; i < 16; i++ {
		content[i] = 0xFF
	}
	binary.BigEndian.PutUint32(content[16:20], uint32(eov.Unix()))
	copy(content[20:28], chr[:])

	// publicKey: modulus (128) || exponent (8)
	modBytes := holderPub.N.Bytes()
	if len(modBytes) > 128 {
		t.Fatalf("modulus longer than 128 bytes")
	}
	copy(content[28+(128-len(modBytes)):], modBytes)
	expBytes := big.NewInt(int64(holderPub.E)).Bytes()
	if len(expBytes) > 8 {
		t.Fatalf("exponent longer than 8 bytes")
	}
	copy(content[156+(8-len(expBytes)):], expBytes)

	sig, nr := signISO9796_2Scheme1(t, signer, content)
	out := make([]byte, Gen1CertLen)
	copy(out[0:128], sig)
	copy(out[128:186], nr)
	copy(out[186:194], car[:]) // appended CAR matches the inner one
	return out
}

func TestGen1CertRoundTrip(t *testing.T) {
	caKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	holderKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	car := KeyIdentifier{0x01, 'D', 'E', 'U', 0x01, 0x00, 0x00, 0xFF}
	chr := KeyIdentifier{0x15, 'G', 'B', 'R', 0x01, 0x12, 0x34, 0xFF}
	eov := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)

	raw := makeGen1CertBytes(t, caKey, car, chr, eov, &holderKey.PublicKey)
	c, err := ParseGen1Cert(raw)
	if err != nil {
		t.Fatalf("ParseGen1Cert: %v", err)
	}
	if !c.AppendedCAR.Equal(car) {
		t.Errorf("AppendedCAR = %s, want %s", c.AppendedCAR, car)
	}
	if c.Verified() {
		t.Errorf("Verified should be false before Verify()")
	}

	if err := c.Verify(&caKey.PublicKey); err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if c.ProfileIdentifier != 0x01 {
		t.Errorf("ProfileIdentifier = 0x%02X, want 0x01", c.ProfileIdentifier)
	}
	if !c.CAR.Equal(car) {
		t.Errorf("CAR = %s, want %s", c.CAR, car)
	}
	if !c.CHR.Equal(chr) {
		t.Errorf("CHR = %s, want %s", c.CHR, chr)
	}
	if !c.EndOfValidity.Equal(eov) {
		t.Errorf("EOV = %v, want %v", c.EndOfValidity, eov)
	}
	if c.PublicKey.N.Cmp(holderKey.PublicKey.N) != 0 {
		t.Errorf("recovered modulus doesn't match holder key")
	}
	if c.PublicKey.E != holderKey.PublicKey.E {
		t.Errorf("recovered exponent %d != %d", c.PublicKey.E, holderKey.PublicKey.E)
	}
}

func TestGen1CertVerifyWithWrongSignerFails(t *testing.T) {
	caKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	otherKey, _ := rsa.GenerateKey(rand.Reader, 1024)
	holderKey, _ := rsa.GenerateKey(rand.Reader, 1024)

	raw := makeGen1CertBytes(t, caKey, KeyIdentifier{}, KeyIdentifier{}, time.Now(), &holderKey.PublicKey)
	c, _ := ParseGen1Cert(raw)
	if err := c.Verify(&otherKey.PublicKey); err == nil {
		t.Errorf("expected Verify failure with wrong signer key")
	}
	if c.Verified() {
		t.Errorf("Verified() should be false after failure")
	}
}

func TestParseGen1CertRejectsWrongLength(t *testing.T) {
	if _, err := ParseGen1Cert(make([]byte, 100)); err == nil {
		t.Errorf("expected error for short cert")
	}
	if _, err := ParseGen1Cert(make([]byte, 300)); err == nil {
		t.Errorf("expected error for long cert")
	}
}

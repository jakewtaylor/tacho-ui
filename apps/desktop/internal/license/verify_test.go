package license

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// withTestKey swaps the embedded public key for a freshly-generated one for
// the lifetime of the test. Returns the private key (for signing) and a
// cleanup func.
func withTestKey(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	spki, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatalf("marshal public: %v", err)
	}
	pemBytes := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: spki})

	prevConst := LicenseSigningPublicKeyPEM
	prevParsed := parsedPublicKey
	prevDone := parsedKeyDone
	prevErr := parsedKeyErr
	_ = prevConst // const, can't swap; we swap the parsed cache instead
	parsedPublicKey = pub
	parsedKeyDone = true
	parsedKeyErr = nil

	t.Cleanup(func() {
		parsedPublicKey = prevParsed
		parsedKeyDone = prevDone
		parsedKeyErr = prevErr
	})
	_ = pemBytes
	return priv
}

func signTestJWT(t *testing.T, priv ed25519.PrivateKey, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(&jwt.SigningMethodEd25519{}, claims)
	signed, err := token.SignedString(priv)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signed
}

func baseClaims() jwt.MapClaims {
	now := time.Now().Unix()
	return jwt.MapClaims{
		"iss":                      "tacholens.com",
		"sub":                      "alice@example.com",
		"license_key":              "tlx-AAAA-BBBB-CCCC-DDDD",
		"machine_id":               "deadbeef",
		"update_window_expires_at": time.Now().Add(365 * 24 * time.Hour).Unix(),
		"iat":                      now,
		"exp":                      now + 14*24*60*60,
	}
}

func TestVerifyHappyPath(t *testing.T) {
	priv := withTestKey(t)
	token := signTestJWT(t, priv, baseClaims())
	claims, err := Verify(token)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if claims.Email != "alice@example.com" {
		t.Errorf("email = %q, want alice@example.com", claims.Email)
	}
	if claims.LicenseKey != "tlx-AAAA-BBBB-CCCC-DDDD" {
		t.Errorf("license_key = %q", claims.LicenseKey)
	}
	if claims.MachineID != "deadbeef" {
		t.Errorf("machine_id = %q", claims.MachineID)
	}
	if claims.UpdateWindowExpiresAt.Before(time.Now()) {
		t.Errorf("update window in the past: %v", claims.UpdateWindowExpiresAt)
	}
}

func TestVerifyRejectsTamperedSignature(t *testing.T) {
	priv := withTestKey(t)
	token := signTestJWT(t, priv, baseClaims())
	// Flip the last char of the signature.
	tampered := token[:len(token)-1] + flipChar(token[len(token)-1:])
	if _, err := Verify(tampered); err == nil {
		t.Fatalf("expected verification to fail on tampered token")
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	priv := withTestKey(t)
	c := baseClaims()
	c["iat"] = time.Now().Add(-30 * 24 * time.Hour).Unix()
	c["exp"] = time.Now().Add(-15 * 24 * time.Hour).Unix()
	token := signTestJWT(t, priv, c)
	if _, err := Verify(token); err == nil {
		t.Fatalf("expected verification to fail on expired token")
	}
}

func TestVerifyRejectsWrongIssuer(t *testing.T) {
	priv := withTestKey(t)
	c := baseClaims()
	c["iss"] = "someone-else.com"
	token := signTestJWT(t, priv, c)
	if _, err := Verify(token); err == nil {
		t.Fatalf("expected verification to fail on wrong issuer")
	}
}

func TestVerifyRequiresClaims(t *testing.T) {
	priv := withTestKey(t)
	c := baseClaims()
	delete(c, "license_key")
	token := signTestJWT(t, priv, c)
	if _, err := Verify(token); err == nil {
		t.Fatalf("expected verification to fail without license_key claim")
	}
}

func flipChar(s string) string {
	if len(s) == 0 {
		return s
	}
	b := []byte(s)
	if b[0] == 'a' {
		b[0] = 'b'
	} else {
		b[0] = 'a'
	}
	return string(b)
}

package license

import (
	"crypto/ed25519"
	"crypto/x509"
	"encoding/pem"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const expectedIssuer = "tacholens.com"

var (
	parsedPublicKey ed25519.PublicKey
	parsedKeyErr    error
	parsedKeyDone   bool
)

func publicKey() (ed25519.PublicKey, error) {
	if parsedKeyDone {
		return parsedPublicKey, parsedKeyErr
	}
	parsedKeyDone = true
	block, _ := pem.Decode([]byte(LicenseSigningPublicKeyPEM))
	if block == nil {
		parsedKeyErr = errors.New("license: public key PEM is malformed (did you replace the placeholder?)")
		return nil, parsedKeyErr
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		parsedKeyErr = fmt.Errorf("license: parse public key: %w", err)
		return nil, parsedKeyErr
	}
	ed, ok := pub.(ed25519.PublicKey)
	if !ok {
		parsedKeyErr = errors.New("license: public key is not Ed25519")
		return nil, parsedKeyErr
	}
	parsedPublicKey = ed
	return parsedPublicKey, nil
}

// Claims is the validated payload of a license JWT.
type Claims struct {
	LicenseKey               string    `json:"license_key"`
	MachineID                string    `json:"machine_id"`
	Email                    string    `json:"email"`
	UpdateWindowExpiresAt    time.Time `json:"update_window_expires_at"`
	ExpiresAt                time.Time `json:"exp"`
	IssuedAt                 time.Time `json:"iat"`
}

type rawClaims struct {
	LicenseKey            string `json:"license_key"`
	MachineID             string `json:"machine_id"`
	UpdateWindowExpiresAt int64  `json:"update_window_expires_at"`
	jwt.RegisteredClaims
}

// Verify parses + validates a JWT against the embedded public key. Returns
// ErrTokenInvalid wrapped with the underlying error on any failure (bad
// signature, expired, wrong issuer, malformed claims).
func Verify(token string) (*Claims, error) {
	pub, err := publicKey()
	if err != nil {
		return nil, err
	}
	parsed, err := jwt.ParseWithClaims(token, &rawClaims{}, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != "EdDSA" {
			return nil, fmt.Errorf("unexpected alg %s", t.Method.Alg())
		}
		return pub, nil
	}, jwt.WithIssuer(expectedIssuer), jwt.WithExpirationRequired(), jwt.WithLeeway(60*time.Second))
	if err != nil {
		return nil, fmt.Errorf("license: verify jwt: %w", err)
	}
	raw, ok := parsed.Claims.(*rawClaims)
	if !ok || !parsed.Valid {
		return nil, errors.New("license: token claims invalid")
	}
	if raw.LicenseKey == "" || raw.MachineID == "" {
		return nil, errors.New("license: missing required claims")
	}
	if raw.ExpiresAt == nil || raw.IssuedAt == nil {
		return nil, errors.New("license: missing iat/exp")
	}
	return &Claims{
		LicenseKey:            raw.LicenseKey,
		MachineID:             raw.MachineID,
		Email:                 raw.Subject,
		UpdateWindowExpiresAt: time.Unix(raw.UpdateWindowExpiresAt, 0).UTC(),
		ExpiresAt:             raw.ExpiresAt.Time.UTC(),
		IssuedAt:              raw.IssuedAt.Time.UTC(),
	}, nil
}

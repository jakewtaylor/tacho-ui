package ddd

import (
	"crypto/ecdsa"
	"crypto/rsa"
	"crypto/sha256"
	_ "embed"
	"encoding/binary"
	"errors"
	"fmt"
	"hash"
	"math/big"

	"github.com/jakewtaylor/go-ddd/internal/crypto"
)

// Embedded ERCA root keys (see pki/README.md for the file format and
// how to populate them). Both files are zero-length on a fresh clone;
// the constructors below return ErrMissingERCAKey in that case.

//go:embed pki/erca_gen1.bin
var embeddedERCAGen1 []byte

//go:embed pki/erca_gen2.bin
var embeddedERCAGen2 []byte

// ErrMissingERCAKey is returned by the From-Embedded constructors when
// no ERCA root key is embedded under pki/. The error message includes
// instructions on running cmd/refresh-pks to populate it.
var ErrMissingERCAKey = errors.New(
	"ddd: no ERCA root key embedded — run `go run ./cmd/refresh-pks/` " +
		"to download from the JRC, or pass an explicit key to " +
		"NewGen1Verifier / NewGen2Verifier",
)

// NewGen1VerifierFromEmbedded constructs a Gen1RSAVerifier rooted at
// the ERCA Gen1 public key embedded under pki/erca_gen1.bin (raw
// 132-byte modulus(128) || exponent(4) form). Returns
// ErrMissingERCAKey when the file is empty.
func NewGen1VerifierFromEmbedded() (*Gen1RSAVerifier, error) {
	pub, err := parseGen1ERCAPublicKey(embeddedERCAGen1)
	if err != nil {
		return nil, err
	}
	return NewGen1Verifier(pub), nil
}

// NewGen2VerifierFromEmbedded constructs a Gen2ECDSAVerifier rooted at
// the ERCA Gen2 self-signed certificate embedded under
// pki/erca_gen2.bin (full Gen2 cert in DER-TLV form). The ERCA's hash
// function is derived from its curve (BrainpoolP256r1 → SHA-256,
// P384r1 → SHA-384, P512r1 → SHA-512). Returns ErrMissingERCAKey when
// the file is empty.
func NewGen2VerifierFromEmbedded() (*Gen2ECDSAVerifier, error) {
	pub, hashFn, err := parseGen2ERCASelfSignedCert(embeddedERCAGen2)
	if err != nil {
		return nil, err
	}
	return NewGen2Verifier(pub, hashFn), nil
}

// parseGen1ERCAPublicKey reads a raw Gen1 ERCA pubkey blob:
// modulus(128) || exponent(4). The exponent is read as a big-endian
// integer (in practice it's always F4 = 65537 or 3 = RSA "short").
func parseGen1ERCAPublicKey(blob []byte) (*rsa.PublicKey, error) {
	if len(blob) == 0 {
		return nil, ErrMissingERCAKey
	}
	if len(blob) != 132 {
		return nil, fmt.Errorf("ddd: ERCA Gen1 key blob must be 132 bytes, got %d", len(blob))
	}
	mod := new(big.Int).SetBytes(blob[:128])
	exp := binary.BigEndian.Uint32(blob[128:132])
	if exp == 0 {
		return nil, fmt.Errorf("ddd: ERCA Gen1 exponent is zero")
	}
	return &rsa.PublicKey{N: mod, E: int(exp)}, nil
}

// parseGen2ERCASelfSignedCert parses an ERCA Gen2 self-signed
// certificate (the format JRC publishes) and returns its public key
// + paired hash function. The cert verifies itself — App. 11 Part B
// §9.3.2 CSM_139 says "An ERCA root certificate shall be self-signed,
// i.e., the Certificate Authority Reference and the Certificate
// Holder Reference in the certificate shall be equal."
func parseGen2ERCASelfSignedCert(blob []byte) (*ecdsa.PublicKey, func() hash.Hash, error) {
	if len(blob) == 0 {
		return nil, nil, ErrMissingERCAKey
	}
	cert, err := crypto.ParseGen2Cert(blob)
	if err != nil {
		return nil, nil, fmt.Errorf("ddd: parse ERCA Gen2 cert: %w", err)
	}
	// Self-verify the cert (CAR == CHR per CSM_139).
	if cert.CAR != cert.CHR {
		return nil, nil, fmt.Errorf("ddd: ERCA cert is not self-signed (CAR != CHR)")
	}
	if err := cert.Verify(cert.PublicKey, cert.HashNew); err != nil {
		return nil, nil, fmt.Errorf("ddd: ERCA Gen2 cert self-verification failed: %w", err)
	}
	return cert.PublicKey, cert.HashNew, nil
}

// Compile-time assurance that we import sha256 even when the embedded
// ERCA key bytes are empty (Go vet otherwise flags the unused import
// after dead-code elimination for some build configurations).
var _ = sha256.New

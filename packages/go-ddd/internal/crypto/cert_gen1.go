package crypto

import (
	"crypto/rsa"
	"encoding/binary"
	"fmt"
	"math/big"
	"time"
)

// KeyIdentifier is the 8-byte CertificationAuthorityReference /
// CertificateHolderReference used throughout App. 11 Part A. Within a
// chain, a cert's CHR matches the CAR of any cert it signed.
//
// The 8 bytes break down as (App. 11 Part A §3.3.1):
//
//	nationNumeric (1) || nationAlpha (3) || keySerialNumber (1) ||
//	additionalInfo (2) || caIdentifier (1)
//
// We keep them as opaque 8-byte fixed-size arrays here — the public
// API exposes them as hex strings and the consumer doesn't currently
// need the internal structure to display anything useful.
type KeyIdentifier [8]byte

func (k KeyIdentifier) String() string {
	const hex = "0123456789ABCDEF"
	out := make([]byte, 16)
	for i, b := range k {
		out[i*2] = hex[b>>4]
		out[i*2+1] = hex[b&0x0F]
	}
	return string(out)
}

// Equal reports whether two KeyIdentifiers refer to the same key.
func (k KeyIdentifier) Equal(o KeyIdentifier) bool {
	return k == o
}

// Gen1Cert is the parsed view of a 194-byte first-generation
// tachograph certificate (Reg. 2016/799 App. 1 §2.41 + App. 11 Part A
// §3.3).
//
// On-wire layout (194 bytes):
//
//	signature (128)         — RSA-1024 ISO 9796-2 sig over CertificateContent
//	pkRemainder (58)        — the non-recoverable tail of CertificateContent
//	appendedCAR (8)         — duplicate of the CAR inside the content,
//	                          exposed in plaintext for lookup-before-verify
//
// After Verify against the signer's public key, the recovered
// CertificateContent (164 bytes) decodes as:
//
//	profileIdentifier (1)
//	CAR (8)                 — who signed THIS cert
//	CHA (7)                 — holder authorisation
//	endOfValidity (4)       — TimeReal
//	CHR (8)                 — who this cert identifies (== this cert's keyholder)
//	publicKey:
//	  modulus (128)         — RSA-1024 modulus
//	  exponent (8)          — RSA public exponent
type Gen1Cert struct {
	// Raw on-wire fields, parsed structurally without verifying yet.
	Signature      []byte // 128 bytes — caller must not mutate
	NonRecoverable []byte // 58 bytes — the "Public Key remainder"
	AppendedCAR    KeyIdentifier

	// Fields populated by Verify.
	verified          bool
	ProfileIdentifier int
	CAR               KeyIdentifier
	CHA               [7]byte
	EndOfValidity     time.Time
	CHR               KeyIdentifier
	PublicKey         *rsa.PublicKey
}

// Gen1CertLen is the on-wire length of every Gen1 cert (App. 1 §2.41).
const Gen1CertLen = 194

// ParseGen1Cert splits a 194-byte raw cert into its three on-wire
// fields. Verify must be called separately with the signer's public
// key before any of the structured fields (CAR, CHR, PublicKey, etc.)
// are populated.
func ParseGen1Cert(raw []byte) (*Gen1Cert, error) {
	if len(raw) != Gen1CertLen {
		return nil, fmt.Errorf("crypto: Gen1 cert must be %d bytes, got %d", Gen1CertLen, len(raw))
	}
	c := &Gen1Cert{
		Signature:      raw[0:128],
		NonRecoverable: raw[128:186],
	}
	copy(c.AppendedCAR[:], raw[186:194])
	return c, nil
}

// Verify checks the cert's ISO 9796-2 signature against the signer's
// public key. On success the recovered CertificateContent is decoded
// into the structural fields (CAR, CHR, PublicKey, etc.). Errors leave
// those fields zero-valued.
func (c *Gen1Cert) Verify(signerPub *rsa.PublicKey) error {
	content, err := VerifyISO9796_2Scheme1(signerPub, c.Signature, c.NonRecoverable)
	if err != nil {
		return fmt.Errorf("crypto: Gen1 cert: %w", err)
	}
	// CertificateContent is exactly 164 bytes per App. 1 §2.42.
	const wantLen = 1 + 8 + 7 + 4 + 8 + 128 + 8 // 164
	if len(content) != wantLen {
		return fmt.Errorf("crypto: Gen1 cert content length %d != %d", len(content), wantLen)
	}
	c.ProfileIdentifier = int(content[0])
	copy(c.CAR[:], content[1:9])
	copy(c.CHA[:], content[9:16])
	c.EndOfValidity = time.Unix(int64(binary.BigEndian.Uint32(content[16:20])), 0).UTC()
	copy(c.CHR[:], content[20:28])
	modulus := new(big.Int).SetBytes(content[28 : 28+128])
	exponent := new(big.Int).SetBytes(content[156:164])
	c.PublicKey = &rsa.PublicKey{
		N: modulus,
		E: int(exponent.Int64()),
	}
	c.verified = true
	return nil
}

// Verified reports whether Verify has been called and succeeded.
func (c *Gen1Cert) Verified() bool { return c.verified }

package crypto

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/binary"
	"fmt"
	"hash"
	"math/big"
	"time"
)

// Gen2 ECC certificate (Reg. 2016/799 Annex IC App. 11 Part B §9.3).
// The on-wire format is DER-TLV with the structure documented in
// §9.3.2 Table 4. The outer 7F21 wrapper is present in driver-card
// downloads (we observed it on the sample C101/C108), even though one
// spec passage suggests it may be stripped in some contexts; our
// parser tolerates both.

// Curve OIDs for the three Brainpool variants supported by the
// tachograph cipher suites (CS#1 / CS#2 / CS#3, App. 11 Part B §8.2.4
// Table 2). Encoded as DER OID octets (the value following the 06
// tag, not the tag itself).
var (
	oidBrainpoolP256r1 = []byte{0x2B, 0x24, 0x03, 0x03, 0x02, 0x08, 0x01, 0x01, 0x07} // 1.3.36.3.3.2.8.1.1.7
	oidBrainpoolP384r1 = []byte{0x2B, 0x24, 0x03, 0x03, 0x02, 0x08, 0x01, 0x01, 0x0B} // 1.3.36.3.3.2.8.1.1.11
	oidBrainpoolP512r1 = []byte{0x2B, 0x24, 0x03, 0x03, 0x02, 0x08, 0x01, 0x01, 0x0D} // 1.3.36.3.3.2.8.1.1.13
)

// curveByOID maps a domain-parameters OID to the corresponding
// elliptic curve and the hash function to use with it (App. 11 Part B
// §8.2.4 cipher-suite linkage: 256-bit key → SHA-256, 384 → SHA-384,
// 512 → SHA-512).
func curveByOID(oid []byte) (elliptic.Curve, func() hash.Hash, error) {
	switch {
	case bytesEqual(oid, oidBrainpoolP256r1):
		return BrainpoolP256r1(), sha256.New, nil
	case bytesEqual(oid, oidBrainpoolP384r1):
		return BrainpoolP384r1(), sha512.New384, nil
	case bytesEqual(oid, oidBrainpoolP512r1):
		return BrainpoolP512r1(), sha512.New, nil
	}
	return nil, nil, fmt.Errorf("crypto: unsupported curve OID %X", oid)
}

func bytesEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// Gen2Cert is the parsed form of a Gen2 ECC certificate.
type Gen2Cert struct {
	// Raw on-wire components retained for re-verification.
	Body        []byte // the encoded body, including its 7F4E tag + length (signature is over this)
	Signature   []byte // raw r||s concatenation per [TR-03111] plain format
	BodyContent []byte // the bytes inside the 7F4E wrapper (no tag/length)

	// Fields decoded from BodyContent.
	ProfileIdentifier int
	CAR               KeyIdentifier
	CHA               [7]byte
	CurveOID          []byte
	HashNew           func() hash.Hash
	PublicKey         *ecdsa.PublicKey
	CHR               KeyIdentifier
	EffectiveDate     time.Time
	ExpirationDate    time.Time

	verified bool
}

// ParseGen2Cert reads the structural fields out of a raw cert blob.
// The signature isn't verified yet — call Verify with the signer's
// public key for that.
//
// Input layout (per §9.3.2 Table 4):
//
//	[7F 21 <outerLen>]            optional outer wrapper
//	  7F 4E <bodyLen> <body>      certificate body (signed)
//	  5F 37 <sigLen>  <sig>       ECDSA signature, plain format
//
// The "body" itself is a sequence of:
//
//	5F 29 01 <cpi>                profile identifier
//	42   08 <car>                 certification authority reference
//	5F 4C 07 <cha>                certificate holder authorisation
//	7F 49 <pkLen> <06 <oid> 86 <point>>   public key (OID + uncompressed point)
//	5F 20 08 <chr>                certificate holder reference
//	5F 25 04 <eov>                effective date (TimeReal)
//	5F 24 04 <exp>                expiration date (TimeReal)
func ParseGen2Cert(raw []byte) (*Gen2Cert, error) {
	if len(raw) < 4 {
		return nil, fmt.Errorf("crypto: Gen2 cert too short (%d bytes)", len(raw))
	}
	// Strip the optional outer 7F21 wrapper.
	inner := raw
	if rec, err := readDERTLV(raw); err == nil && rec.Tag == tagECCCertificate {
		inner = rec.Value
	}

	bodyRec, err := readDERTLV(inner)
	if err != nil {
		return nil, fmt.Errorf("crypto: Gen2 cert body: %w", err)
	}
	if bodyRec.Tag != tagCertBody {
		return nil, fmt.Errorf("crypto: expected body tag 7F4E, got %04X", bodyRec.Tag)
	}
	// Everything after the body is the signature TLV.
	sigRec, err := readDERTLV(inner[bodyRec.TotalSize:])
	if err != nil {
		return nil, fmt.Errorf("crypto: Gen2 cert sig: %w", err)
	}
	if sigRec.Tag != tagSignature {
		return nil, fmt.Errorf("crypto: expected signature tag 5F37, got %04X", sigRec.Tag)
	}

	c := &Gen2Cert{
		Body:        inner[:bodyRec.TotalSize],
		BodyContent: bodyRec.Value,
		Signature:   sigRec.Value,
	}
	if err := c.decodeBodyFields(); err != nil {
		return nil, err
	}
	return c, nil
}

func (c *Gen2Cert) decodeBodyFields() error {
	seen := make(map[derTag]bool)
	err := walkDERTLV(c.BodyContent, func(rec derTLV) error {
		seen[rec.Tag] = true
		switch rec.Tag {
		case tagProfileIdentifier:
			if len(rec.Value) != 1 {
				return fmt.Errorf("profile id len %d != 1", len(rec.Value))
			}
			c.ProfileIdentifier = int(rec.Value[0])
		case tagCAR:
			if len(rec.Value) != 8 {
				return fmt.Errorf("CAR len %d != 8", len(rec.Value))
			}
			copy(c.CAR[:], rec.Value)
		case tagCHA:
			if len(rec.Value) != 7 {
				return fmt.Errorf("CHA len %d != 7", len(rec.Value))
			}
			copy(c.CHA[:], rec.Value)
		case tagPublicKey:
			if err := c.decodePublicKey(rec.Value); err != nil {
				return fmt.Errorf("public key: %w", err)
			}
		case tagCHR:
			if len(rec.Value) != 8 {
				return fmt.Errorf("CHR len %d != 8", len(rec.Value))
			}
			copy(c.CHR[:], rec.Value)
		case tagEffectiveDate:
			if len(rec.Value) != 4 {
				return fmt.Errorf("effective date len %d != 4", len(rec.Value))
			}
			c.EffectiveDate = time.Unix(int64(binary.BigEndian.Uint32(rec.Value)), 0).UTC()
		case tagExpirationDate:
			if len(rec.Value) != 4 {
				return fmt.Errorf("expiration date len %d != 4", len(rec.Value))
			}
			c.ExpirationDate = time.Unix(int64(binary.BigEndian.Uint32(rec.Value)), 0).UTC()
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("crypto: Gen2 cert body fields: %w", err)
	}
	for _, t := range []derTag{tagCAR, tagCHA, tagPublicKey, tagCHR, tagEffectiveDate, tagExpirationDate} {
		if !seen[t] {
			return fmt.Errorf("crypto: missing required body tag %04X", t)
		}
	}
	return nil
}

func (c *Gen2Cert) decodePublicKey(buf []byte) error {
	var oid, point []byte
	err := walkDERTLV(buf, func(rec derTLV) error {
		switch rec.Tag {
		case tagDomainParameters:
			oid = rec.Value
		case tagPublicPoint:
			point = rec.Value
		}
		return nil
	})
	if err != nil {
		return err
	}
	if oid == nil {
		return fmt.Errorf("missing domain parameters OID")
	}
	if point == nil {
		return fmt.Errorf("missing public point")
	}
	curve, hashFn, err := curveByOID(oid)
	if err != nil {
		return err
	}
	// Uncompressed point format per [TR-03111]: 04 || X || Y
	if len(point) == 0 || point[0] != 0x04 {
		return fmt.Errorf("public point not uncompressed (first byte 0x%02X)", point[0])
	}
	coordLen := (curve.Params().BitSize + 7) / 8
	if len(point) != 1+2*coordLen {
		return fmt.Errorf("public point length %d != %d", len(point), 1+2*coordLen)
	}
	x := new(big.Int).SetBytes(point[1 : 1+coordLen])
	y := new(big.Int).SetBytes(point[1+coordLen:])
	if !curve.IsOnCurve(x, y) {
		return fmt.Errorf("public point not on curve")
	}
	c.CurveOID = oid
	c.HashNew = hashFn
	c.PublicKey = &ecdsa.PublicKey{Curve: curve, X: x, Y: y}
	return nil
}

// Verify checks the ECDSA signature on the certificate body against
// the given signer public key.
//
// Per App. 11 Part B §9.3.4: "the signature on the certificate shall
// be created over the encoded certificate body, including the
// certificate body tag and length". So the input to the hash is
// c.Body (the 7F4E tag + length + content).
func (c *Gen2Cert) Verify(signerPub *ecdsa.PublicKey, signerHash func() hash.Hash) error {
	if signerPub == nil {
		return fmt.Errorf("crypto: no signer public key")
	}
	if signerHash == nil {
		return fmt.Errorf("crypto: no hash function for signer")
	}
	h := signerHash()
	h.Write(c.Body)
	digest := h.Sum(nil)
	// Plain signature format: r || s as fixed-width big-endian ints.
	coordLen := (signerPub.Curve.Params().BitSize + 7) / 8
	if len(c.Signature) != 2*coordLen {
		return fmt.Errorf("crypto: signature length %d != %d", len(c.Signature), 2*coordLen)
	}
	r := new(big.Int).SetBytes(c.Signature[:coordLen])
	s := new(big.Int).SetBytes(c.Signature[coordLen:])
	if !ecdsa.Verify(signerPub, digest, r, s) {
		return fmt.Errorf("crypto: Gen2 cert ECDSA verification failed")
	}
	c.verified = true
	return nil
}

// Verified reports whether Verify has been called and succeeded.
func (c *Gen2Cert) Verified() bool { return c.verified }

// VerifyData checks an ECDSA "plain format" signature over `data`
// against this cert's public key, using the hash function paired with
// this cert's curve. Used by the public Gen2 verifier for per-EF
// signature checks.
func (c *Gen2Cert) VerifyData(data, signature []byte) error {
	if c.PublicKey == nil || c.HashNew == nil {
		return fmt.Errorf("crypto: cert has no public key")
	}
	h := c.HashNew()
	h.Write(data)
	digest := h.Sum(nil)
	coordLen := (c.PublicKey.Curve.Params().BitSize + 7) / 8
	if len(signature) != 2*coordLen {
		return fmt.Errorf("crypto: signature length %d != %d", len(signature), 2*coordLen)
	}
	r := new(big.Int).SetBytes(signature[:coordLen])
	s := new(big.Int).SetBytes(signature[coordLen:])
	if !ecdsa.Verify(c.PublicKey, digest, r, s) {
		return fmt.Errorf("crypto: Gen2 EF ECDSA verification failed")
	}
	return nil
}

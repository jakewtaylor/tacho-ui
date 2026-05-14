package ddd

import (
	stdcrypto "crypto"
	"crypto/rsa"
	"crypto/sha1" //nolint:gosec // mandated by Reg. 2016/799 Annex IC App. 11 Part A §6
	"fmt"

	"github.com/jakewtaylor/go-ddd/internal/crypto"
)

// FID constants for the certificate EFs we need to absorb to build a
// Gen1 trust chain. Both are 194-byte raw certificate blobs (App. 11
// Part A §3.3).
const (
	gen1FIDCardCertificate = 0xC100 // EF_CardCertificate — card's equipment cert (signed by MSCA)
	gen1FIDCACertificate   = 0xC108 // EF_CA_Certificate  — MSCA cert (signed by ERCA)
)

// Gen1RSAVerifier verifies signatures on a first-generation driver
// card download:
//
//   - The ERCA→MSCA chain link is verified by reading EF_CA_Certificate
//     (FID 0xC108) and verifying its ISO 9796-2 signature against the
//     embedded ERCA public key.
//   - The MSCA→equipment chain link is verified by reading
//     EF_CardCertificate (FID 0xC100) and verifying its ISO 9796-2
//     signature against the MSCA key recovered from the C108 cert.
//   - Every per-EF signature record (TLV type 0x01) is verified by
//     PKCS#1 v1.5 with SHA-1 against the equipment public key
//     recovered from the C100 cert (Reg. 2016/799 Annex IC App. 11
//     Part A §6, CSM_034 / CSM_035).
//
// NewGen1Verifier returns a verifier that uses the supplied ERCA root
// public key. There can be multiple ERCA generations in real-world use
// (each ERCA key has a lifetime); production callers will supply a
// keyring rather than a single key, but the Phase B.2 single-root
// constructor is enough for synthetic test fixtures and the most
// common production case where the card's MSCA was signed by the
// currently-active ERCA.
type Gen1RSAVerifier struct {
	ercaPub *rsa.PublicKey
	pending []SignedEF
}

// NewGen1Verifier constructs a verifier rooted at the supplied ERCA
// public key. The key is typically loaded from the embedded
// pki/erca_gen1 bundle (B.4 will add a NewGen1VerifierFromEmbeddedERCA
// convenience helper).
func NewGen1Verifier(ercaPub *rsa.PublicKey) *Gen1RSAVerifier {
	return &Gen1RSAVerifier{ercaPub: ercaPub}
}

func (v *Gen1RSAVerifier) Add(ef SignedEF) {
	v.pending = append(v.pending, ef)
}

// Finalise builds the cert chain from any C100 + C108 EFs the parser
// collected, then verifies each per-EF signature against the resolved
// equipment public key. EFs not from Gen1 are passed through as
// unverifiable so a Gen1 verifier can co-exist with a future Gen2
// verifier on the same card.
func (v *Gen1RSAVerifier) Finalise() (bool, []EFSignature) {
	mscaCert, cardCert, chainErr := v.buildChain()
	chainValid := chainErr == nil
	_ = mscaCert // reserved — exposed via getter once a use case arrives

	out := make([]EFSignature, 0, len(v.pending))
	for _, ef := range v.pending {
		// Cert EFs don't have a separate signature record.
		if ef.Signature == nil {
			continue
		}
		// Foreign-generation EFs are deferred to whichever verifier
		// handles that generation.
		if ef.Generation != 1 {
			out = append(out, EFSignature{
				FID:        ef.FID,
				Generation: ef.Generation,
				Status:     VerifyUnverifiable.String(),
				Reason:     "Gen1 verifier not applicable",
			})
			continue
		}
		if !chainValid {
			out = append(out, EFSignature{
				FID:        ef.FID,
				Generation: ef.Generation,
				Status:     VerifyUnverifiable.String(),
				Reason:     "trust chain not established: " + chainErr.Error(),
			})
			continue
		}
		if err := verifyGen1EFSignature(cardCert.PublicKey, ef.Body, ef.Signature); err != nil {
			out = append(out, EFSignature{
				FID:        ef.FID,
				Generation: ef.Generation,
				Status:     VerifyFailed.String(),
				Reason:     err.Error(),
			})
			continue
		}
		out = append(out, EFSignature{
			FID:        ef.FID,
			Generation: ef.Generation,
			Status:     VerifyVerified.String(),
		})
	}
	return chainValid, out
}

// buildChain locates the EF_CA_Certificate and EF_CardCertificate
// records collected via Add, then walks ERCA→MSCA→equipment verifying
// each link. Returns the two parsed cert objects (with PublicKey
// populated) on success, or an error describing the first chain step
// that failed.
func (v *Gen1RSAVerifier) buildChain() (mscaCert, cardCert *crypto.Gen1Cert, err error) {
	var rawCA, rawCard []byte
	for _, ef := range v.pending {
		if ef.Generation != 1 {
			continue
		}
		switch ef.FID {
		case gen1FIDCACertificate:
			rawCA = ef.Body
		case gen1FIDCardCertificate:
			rawCard = ef.Body
		}
	}
	if rawCA == nil {
		return nil, nil, fmt.Errorf("EF_CA_Certificate (0xC108) not present")
	}
	if rawCard == nil {
		return nil, nil, fmt.Errorf("EF_CardCertificate (0xC100) not present")
	}
	caCert, err := crypto.ParseGen1Cert(rawCA)
	if err != nil {
		return nil, nil, fmt.Errorf("parse C108: %w", err)
	}
	if err := caCert.Verify(v.ercaPub); err != nil {
		return nil, nil, fmt.Errorf("ERCA → MSCA: %w", err)
	}
	cardCert, err = crypto.ParseGen1Cert(rawCard)
	if err != nil {
		return nil, nil, fmt.Errorf("parse C100: %w", err)
	}
	if err := cardCert.Verify(caCert.PublicKey); err != nil {
		return nil, nil, fmt.Errorf("MSCA → equipment: %w", err)
	}
	return caCert, cardCert, nil
}

// verifyGen1EFSignature checks a per-EF signature against the
// equipment public key recovered from the card cert. App. 11 Part A
// §6 CSM_034: signature scheme is PKCS#1 v1.5 with SHA-1.
func verifyGen1EFSignature(pub *rsa.PublicKey, body, sig []byte) error {
	if pub == nil {
		return fmt.Errorf("no equipment public key")
	}
	h := sha1.Sum(body) //nolint:gosec
	return rsa.VerifyPKCS1v15(pub, stdcrypto.SHA1, h[:], sig)
}

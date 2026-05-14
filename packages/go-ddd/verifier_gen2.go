package ddd

import (
	"crypto/ecdsa"
	"fmt"
	"hash"

	"github.com/jakewtaylor/go-ddd/internal/crypto"
)

// FID constants for the Gen2 certificate EFs. A second-generation
// driver card emits TWO equipment certs:
//
//   - 0xC100 CardMA_Certificate — used for mutual authentication
//     between the card and a VU; not the signing key for downloaded
//     data.
//   - 0xC101 CardSign_Certificate — the signing key for downloaded
//     data (App. 11 Part B §9.3).
//
// Both are signed by the MSCA cert at 0xC108 (Gen2 EF_CA_Certificate),
// which in turn is signed by the ERCA root. For verifying downloaded
// data (everything else on the card) we follow the chain through C101.
const (
	gen2FIDCardMACertificate   = 0xC100
	gen2FIDCardSignCertificate = 0xC101
	gen2FIDCACertificate       = 0xC108
	gen2FIDLinkCertificate     = 0xC109 // ERCA link cert (Gen2v2); optional in chain
)

// Gen2ECDSAVerifier verifies the per-EF signatures on a second-
// generation driver card download:
//
//   - The MSCA cert (EF_CA_Certificate at C108) is verified against
//     the embedded ERCA root public key, recovering the MSCA pubkey.
//   - The CardSign cert (C101) is verified against the MSCA pubkey,
//     recovering the equipment signing pubkey.
//   - Per-EF signatures (TLV type 0x03) are verified by ECDSA over
//     Brainpool with SHA-256/384/512 (cipher suite linked to the curve
//     bit length, App. 11 Part B §8.2.4 CSM_50) using the equipment
//     pubkey from C101.
//
// Other generations are passed through as unverifiable so a Gen2
// verifier composes cleanly alongside a Gen1 verifier on the same card.
type Gen2ECDSAVerifier struct {
	ercaPub  *ecdsa.PublicKey
	ercaHash func() hash.Hash
	pending  []SignedEF
}

// NewGen2Verifier constructs a verifier rooted at the supplied ERCA
// public key. The ERCA hash function is paired with the curve size:
// CS#1 (256-bit ERCA) → SHA-256, CS#2 (384) → SHA-384, CS#3 (512) →
// SHA-512 (App. 11 Part B §8.2.4 Table 2).
func NewGen2Verifier(ercaPub *ecdsa.PublicKey, ercaHash func() hash.Hash) *Gen2ECDSAVerifier {
	return &Gen2ECDSAVerifier{ercaPub: ercaPub, ercaHash: ercaHash}
}

func (v *Gen2ECDSAVerifier) Add(ef SignedEF) {
	v.pending = append(v.pending, ef)
}

func (v *Gen2ECDSAVerifier) Finalise() (bool, []EFSignature) {
	signCert, chainErr := v.buildChain()
	chainValid := chainErr == nil

	out := make([]EFSignature, 0, len(v.pending))
	for _, ef := range v.pending {
		if ef.Signature == nil {
			continue
		}
		if ef.Generation != 2 {
			out = append(out, EFSignature{
				FID:        ef.FID,
				Generation: ef.Generation,
				Status:     VerifyUnverifiable.String(),
				Reason:     "Gen2 verifier not applicable",
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
		if err := signCert.VerifyData(ef.Body, ef.Signature); err != nil {
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

func (v *Gen2ECDSAVerifier) buildChain() (signCert *crypto.Gen2Cert, err error) {
	var rawCA, rawSign []byte
	for _, ef := range v.pending {
		if ef.Generation != 2 {
			continue
		}
		switch ef.FID {
		case gen2FIDCACertificate:
			rawCA = ef.Body
		case gen2FIDCardSignCertificate:
			rawSign = ef.Body
		}
	}
	if rawCA == nil {
		return nil, fmt.Errorf("EF_CA_Certificate (0xC108) not present")
	}
	if rawSign == nil {
		return nil, fmt.Errorf("EF_CardSignCertificate (0xC101) not present")
	}
	caCert, err := crypto.ParseGen2Cert(rawCA)
	if err != nil {
		return nil, fmt.Errorf("parse C108: %w", err)
	}
	if err := caCert.Verify(v.ercaPub, v.ercaHash); err != nil {
		return nil, fmt.Errorf("ERCA → MSCA: %w", err)
	}
	signCert, err = crypto.ParseGen2Cert(rawSign)
	if err != nil {
		return nil, fmt.Errorf("parse C101: %w", err)
	}
	if err := signCert.Verify(caCert.PublicKey, caCert.HashNew); err != nil {
		return nil, fmt.Errorf("MSCA → equipment: %w", err)
	}
	return signCert, nil
}

// Package crypto holds the per-generation signature primitives used by
// the public verifiers in package ddd. None of this is part of the
// public Go API — consumers configure verification via the high-level
// `ddd.WithVerifier(...)` option.
package crypto

import (
	"bytes"
	"crypto/rsa"
	"crypto/sha1" //nolint:gosec // mandated by Reg. 2016/799 Annex IC App. 11 Part A §6
	"fmt"
	"math/big"
)

// VerifyISO9796_2Scheme1 verifies an ISO/IEC 9796-2 scheme-1 signature
// with *partial* message recovery, as used by Gen1 tachograph
// certificates (Reg. 2016/799 Annex IC App. 11 Part A §3, §6, and the
// CSM_017 / certificate-issuing requirements at lines 79555+).
//
// Format the signature decrypts to (k = modulus length in bytes, h =
// SHA-1 output length = 20):
//
//	encodedMessage = 6A || M_recoverable[k - 2 - h] || H(M) || BC
//
// where:
//   - 0x6A is the header byte
//   - 0xBC is the trailer byte (signalling SHA-1)
//   - M_recoverable is the chunk of the original message that fits
//     inside the signature; for RSA-1024 + SHA-1 this is 128 - 2 - 20
//     = 106 bytes
//   - H(M) is SHA-1 of the *full* message (M_recoverable || nonRecoverable)
//   - nonRecoverable is the rest of the message, appended outside the
//     signature on the wire (in a Gen1 cert that's the 58-byte
//     "Public Key remainder" field)
//
// The spec note "(except for its annex A4)" rules out the n/2 modular
// reduction that vanilla ISO 9796-2 would apply — we use the raw RSA
// public exponentiation result as-is.
//
// Returns the recovered message (M_recoverable || nonRecoverable, total
// length k - 2 - h + len(nonRecoverable)) on success, or an error
// describing how verification failed.
func VerifyISO9796_2Scheme1(pub *rsa.PublicKey, signature, nonRecoverable []byte) ([]byte, error) {
	k := pub.Size()
	if len(signature) != k {
		return nil, fmt.Errorf("iso9796_2: signature length %d != modulus length %d", len(signature), k)
	}

	// Public RSA op: F = signature^e mod n.
	sigInt := new(big.Int).SetBytes(signature)
	if sigInt.Cmp(pub.N) >= 0 {
		return nil, fmt.Errorf("iso9796_2: signature >= modulus")
	}
	fInt := new(big.Int).Exp(sigInt, big.NewInt(int64(pub.E)), pub.N)

	// Left-pad to k bytes — big.Int.Bytes() trims leading zeros.
	encoded := make([]byte, k)
	fBytes := fInt.Bytes()
	copy(encoded[k-len(fBytes):], fBytes)

	if encoded[0] != 0x6A {
		return nil, fmt.Errorf("iso9796_2: header byte 0x%02X != 0x6A", encoded[0])
	}
	if encoded[k-1] != 0xBC {
		return nil, fmt.Errorf("iso9796_2: trailer byte 0x%02X != 0xBC", encoded[k-1])
	}

	const hashLen = sha1.Size // 20
	if k < 2+hashLen {
		return nil, fmt.Errorf("iso9796_2: modulus too small (%d bytes) for SHA-1", k)
	}
	mrLen := k - 2 - hashLen
	mRecoverable := encoded[1 : 1+mrLen]
	hClaimed := encoded[1+mrLen : 1+mrLen+hashLen]

	h := sha1.New() //nolint:gosec
	h.Write(mRecoverable)
	h.Write(nonRecoverable)
	hComputed := h.Sum(nil)

	if !bytes.Equal(hClaimed, hComputed) {
		return nil, fmt.Errorf("iso9796_2: hash mismatch")
	}

	out := make([]byte, mrLen+len(nonRecoverable))
	copy(out, mRecoverable)
	copy(out[mrLen:], nonRecoverable)
	return out, nil
}

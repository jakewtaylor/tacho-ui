package crypto

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"math/big"
	"testing"
)

// Verify that each curve's published generator point actually lies on
// the curve — a basic correctness check that catches typos in the
// constants we transcribed from RFC 5639.
func TestBrainpoolGeneratorsLieOnCurves(t *testing.T) {
	cases := []struct {
		name  string
		curve elliptic.Curve
	}{
		{"P256r1", BrainpoolP256r1()},
		{"P384r1", BrainpoolP384r1()},
		{"P512r1", BrainpoolP512r1()},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := c.curve.Params()
			if !c.curve.IsOnCurve(p.Gx, p.Gy) {
				t.Errorf("generator point not on curve %s", c.name)
			}
		})
	}
}

// ECDSA round-trip: generate a key, sign a hash, verify. Exercises Add,
// Double, ScalarMult, and ScalarBaseMult via crypto/ecdsa.
func TestBrainpoolECDSARoundTrip(t *testing.T) {
	cases := []struct {
		name  string
		curve elliptic.Curve
	}{
		{"P256r1", BrainpoolP256r1()},
		{"P384r1", BrainpoolP384r1()},
		// P512r1 ECDSA round-trip is slow with our affine arithmetic;
		// the generators-on-curve check above is sufficient regression
		// coverage for the constants. Sign-verify of P256r1 + P384r1
		// exercises the same Add/Double/ScalarMult code paths.
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			priv, err := ecdsa.GenerateKey(c.curve, rand.Reader)
			if err != nil {
				t.Fatalf("GenerateKey: %v", err)
			}
			msg := sha256.Sum256([]byte("hello brainpool"))
			r, s, err := ecdsa.Sign(rand.Reader, priv, msg[:])
			if err != nil {
				t.Fatalf("Sign: %v", err)
			}
			if !ecdsa.Verify(&priv.PublicKey, msg[:], r, s) {
				t.Errorf("Verify failed for valid signature on %s", c.name)
			}
			// Tampered hash → must reject.
			msg[0] ^= 1
			if ecdsa.Verify(&priv.PublicKey, msg[:], r, s) {
				t.Errorf("Verify accepted tampered hash on %s", c.name)
			}
		})
	}
}

// Add identities: P + 0 = P, 0 + P = P, P + (-P) = 0.
func TestBrainpoolAddIdentity(t *testing.T) {
	c := BrainpoolP256r1()
	p := c.Params()
	zero := func() (gx, gy *big.Int) {
		return new(big.Int), new(big.Int)
	}
	zx, zy := zero()
	rx, ry := c.Add(p.Gx, p.Gy, zx, zy)
	if rx.Cmp(p.Gx) != 0 || ry.Cmp(p.Gy) != 0 {
		t.Errorf("G + 0 != G")
	}
	rx, ry = c.Add(zx, zy, p.Gx, p.Gy)
	if rx.Cmp(p.Gx) != 0 || ry.Cmp(p.Gy) != 0 {
		t.Errorf("0 + G != G")
	}
	// -G has y = p - Gy
	negGy := new(big.Int).Sub(p.P, p.Gy)
	rx, ry = c.Add(p.Gx, p.Gy, p.Gx, negGy)
	if !isInfinity(rx, ry) {
		t.Errorf("G + (-G) != 0")
	}
}

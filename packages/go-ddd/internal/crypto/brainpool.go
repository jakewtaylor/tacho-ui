package crypto

import (
	"crypto/elliptic"
	"math/big"
	"sync"
)

// Brainpool curves per RFC 5639 §3.4 (P-256r1), §3.6 (P-384r1), §3.7
// (P-512r1). These are short-Weierstrass curves y² = x³ + ax + b over
// a prime field GF(p), with a ≠ -3 — which is why we can't reuse Go's
// stdlib `elliptic.CurveParams` (whose hard-coded math assumes a = -3).
//
// The implementation here is intended for *signature verification only*,
// which is the only operation the tachograph spec demands from a
// downstream consumer (Reg. 2016/799 Annex IC App. 11 Part B §6
// CSM_034 / §9.3.4). Verification doesn't involve secrets on our side,
// so constant-time scalar multiplication isn't required and we use the
// straightforward double-and-add algorithm in affine coordinates.
//
// DO NOT use these implementations for key generation or signing —
// the scalar multiplication is timing-variable and not safe against
// side-channel attacks.

// brainpoolCurve is the shared `elliptic.Curve` implementation
// parameterised by (p, a, b, Gx, Gy, n). Only the parts needed by
// `crypto/ecdsa.Verify` (Params, IsOnCurve, Add, Double, ScalarMult,
// ScalarBaseMult) are wired up.
type brainpoolCurve struct {
	params *elliptic.CurveParams
	a      *big.Int
}

func (c *brainpoolCurve) Params() *elliptic.CurveParams { return c.params }

// IsOnCurve reports whether the given affine point (x, y) satisfies
// y² ≡ x³ + ax + b (mod p).
func (c *brainpoolCurve) IsOnCurve(x, y *big.Int) bool {
	p := c.params.P
	if x.Sign() < 0 || x.Cmp(p) >= 0 {
		return false
	}
	if y.Sign() < 0 || y.Cmp(p) >= 0 {
		return false
	}
	y2 := new(big.Int).Mul(y, y)
	y2.Mod(y2, p)

	rhs := new(big.Int).Mul(x, x)
	rhs.Mul(rhs, x)            // x³
	ax := new(big.Int).Mul(c.a, x) // ax
	rhs.Add(rhs, ax)
	rhs.Add(rhs, c.params.B)
	rhs.Mod(rhs, p)
	return y2.Cmp(rhs) == 0
}

// isInfinity reports the convention used here for the point at
// infinity: (0, 0). No curve point we care about can have both
// coordinates zero simultaneously (b ≠ 0 in all Brainpool curves), so
// this is a safe sentinel.
func isInfinity(x, y *big.Int) bool {
	return x.Sign() == 0 && y.Sign() == 0
}

// Add returns the sum of two affine points using the standard
// short-Weierstrass addition formulas.
func (c *brainpoolCurve) Add(x1, y1, x2, y2 *big.Int) (*big.Int, *big.Int) {
	if isInfinity(x1, y1) {
		return new(big.Int).Set(x2), new(big.Int).Set(y2)
	}
	if isInfinity(x2, y2) {
		return new(big.Int).Set(x1), new(big.Int).Set(y1)
	}
	p := c.params.P
	// If x1 == x2, either we're doubling (y1 == y2 ≠ 0) or the result
	// is the point at infinity (y1 == -y2 mod p).
	if x1.Cmp(x2) == 0 {
		ySum := new(big.Int).Add(y1, y2)
		ySum.Mod(ySum, p)
		if ySum.Sign() == 0 {
			return new(big.Int), new(big.Int)
		}
		return c.Double(x1, y1)
	}
	// λ = (y2 - y1) / (x2 - x1) mod p
	dy := new(big.Int).Sub(y2, y1)
	dy.Mod(dy, p)
	dx := new(big.Int).Sub(x2, x1)
	dx.Mod(dx, p)
	dxInv := new(big.Int).ModInverse(dx, p)
	if dxInv == nil {
		return new(big.Int), new(big.Int)
	}
	lam := new(big.Int).Mul(dy, dxInv)
	lam.Mod(lam, p)
	// x3 = λ² - x1 - x2
	x3 := new(big.Int).Mul(lam, lam)
	x3.Sub(x3, x1)
	x3.Sub(x3, x2)
	x3.Mod(x3, p)
	// y3 = λ(x1 - x3) - y1
	y3 := new(big.Int).Sub(x1, x3)
	y3.Mul(y3, lam)
	y3.Sub(y3, y1)
	y3.Mod(y3, p)
	return x3, y3
}

// Double returns 2·(x1, y1).
func (c *brainpoolCurve) Double(x1, y1 *big.Int) (*big.Int, *big.Int) {
	if isInfinity(x1, y1) {
		return new(big.Int), new(big.Int)
	}
	p := c.params.P
	if y1.Sign() == 0 {
		// Tangent vertical → result is point at infinity.
		return new(big.Int), new(big.Int)
	}
	// λ = (3·x1² + a) / (2·y1)  mod p
	three := big.NewInt(3)
	two := big.NewInt(2)
	num := new(big.Int).Mul(x1, x1)
	num.Mul(num, three)
	num.Add(num, c.a)
	num.Mod(num, p)
	denom := new(big.Int).Mul(y1, two)
	denom.Mod(denom, p)
	denomInv := new(big.Int).ModInverse(denom, p)
	if denomInv == nil {
		return new(big.Int), new(big.Int)
	}
	lam := new(big.Int).Mul(num, denomInv)
	lam.Mod(lam, p)
	// x3 = λ² - 2x1
	x3 := new(big.Int).Mul(lam, lam)
	x3.Sub(x3, x1)
	x3.Sub(x3, x1)
	x3.Mod(x3, p)
	// y3 = λ(x1 - x3) - y1
	y3 := new(big.Int).Sub(x1, x3)
	y3.Mul(y3, lam)
	y3.Sub(y3, y1)
	y3.Mod(y3, p)
	return x3, y3
}

// ScalarMult returns k·(x1, y1) using double-and-add.
func (c *brainpoolCurve) ScalarMult(x1, y1 *big.Int, k []byte) (*big.Int, *big.Int) {
	rx, ry := new(big.Int), new(big.Int) // identity (point at infinity)
	ax, ay := new(big.Int).Set(x1), new(big.Int).Set(y1)
	for i := len(k) - 1; i >= 0; i-- {
		b := k[i]
		for j := 0; j < 8; j++ {
			if b&1 == 1 {
				rx, ry = c.Add(rx, ry, ax, ay)
			}
			ax, ay = c.Double(ax, ay)
			b >>= 1
		}
	}
	return rx, ry
}

// ScalarBaseMult returns k·G where G is the generator.
func (c *brainpoolCurve) ScalarBaseMult(k []byte) (*big.Int, *big.Int) {
	return c.ScalarMult(c.params.Gx, c.params.Gy, k)
}

// --- Brainpool curve singletons --------------------------------------

var (
	bp256Once  sync.Once
	bp256Curve elliptic.Curve

	bp384Once  sync.Once
	bp384Curve elliptic.Curve

	bp512Once  sync.Once
	bp512Curve elliptic.Curve
)

// BrainpoolP256r1 returns the BrainpoolP256r1 curve (RFC 5639 §3.4).
// Used by tachograph cipher suite CS#1 (Reg. 2016/799 Annex IC App. 11
// Part B §8.2.4 Table 2).
func BrainpoolP256r1() elliptic.Curve {
	bp256Once.Do(func() {
		bp256Curve = &brainpoolCurve{
			a: hexInt("7D5A0975FC2C3057EEF67530417AFFE7FB8055C126DC5C6CE94A4B44F330B5D9"),
			params: &elliptic.CurveParams{
				Name:    "brainpoolP256r1",
				BitSize: 256,
				P:       hexInt("A9FB57DBA1EEA9BC3E660A909D838D726E3BF623D52620282013481D1F6E5377"),
				N:       hexInt("A9FB57DBA1EEA9BC3E660A909D838D718C397AA3B561A6F7901E0E82974856A7"),
				B:       hexInt("26DC5C6CE94A4B44F330B5D9BBD77CBF958416295CF7E1CE6BCCDC18FF8C07B6"),
				Gx:      hexInt("8BD2AEB9CB7E57CB2C4B482FFC81B7AFB9DE27E1E3BD23C23A4453BD9ACE3262"),
				Gy:      hexInt("547EF835C3DAC4FD97F8461A14611DC9C27745132DED8E545C1D54C72F046997"),
			},
		}
	})
	return bp256Curve
}

// BrainpoolP384r1 returns the BrainpoolP384r1 curve (RFC 5639 §3.6).
// Used by tachograph cipher suite CS#2.
func BrainpoolP384r1() elliptic.Curve {
	bp384Once.Do(func() {
		bp384Curve = &brainpoolCurve{
			a: hexInt("7BC382C63D8C150C3C72080ACE05AFA0C2BEA28E4FB22787139165EFBA91F90F8AA5814A503AD4EB04A8C7DD22CE2826"),
			params: &elliptic.CurveParams{
				Name:    "brainpoolP384r1",
				BitSize: 384,
				P:       hexInt("8CB91E82A3386D280F5D6F7E50E641DF152F7109ED5456B412B1DA197FB71123ACD3A729901D1A71874700133107EC53"),
				N:       hexInt("8CB91E82A3386D280F5D6F7E50E641DF152F7109ED5456B31F166E6CAC0425A7CF3AB6AF6B7FC3103B883202E9046565"),
				B:       hexInt("04A8C7DD22CE28268B39B55416F0447C2FB77DE107DCD2A62E880EA53EEB62D57CB4390295DBC9943AB78696FA504C11"),
				Gx:      hexInt("1D1C64F068CF45FFA2A63A81B7C13F6B8847A3E77EF14FE3DB7FCAFE0CBD10E8E826E03436D646AAEF87B2E247D4AF1E"),
				Gy:      hexInt("8ABE1D7520F9C2A45CB1EB8E95CFD55262B70B29FEEC5864E19C054FF99129280E4646217791811142820341263C5315"),
			},
		}
	})
	return bp384Curve
}

// BrainpoolP512r1 returns the BrainpoolP512r1 curve (RFC 5639 §3.7).
// Used by tachograph cipher suite CS#3.
func BrainpoolP512r1() elliptic.Curve {
	bp512Once.Do(func() {
		bp512Curve = &brainpoolCurve{
			a: hexInt("7830A3318B603B89E2327145AC234CC594CBDD8D3DF91610A83441CAEA9863BC2DED5D5AA8253AA10A2EF1C98B9AC8B57F1117A72BF2C7B9E7C1AC4D77FC94CA"),
			params: &elliptic.CurveParams{
				Name:    "brainpoolP512r1",
				BitSize: 512,
				P:       hexInt("AADD9DB8DBE9C48B3FD4E6AE33C9FC07CB308DB3B3C9D20ED6639CCA703308717D4D9B009BC66842AECDA12AE6A380E62881FF2F2D82C68528AA6056583A48F3"),
				N:       hexInt("AADD9DB8DBE9C48B3FD4E6AE33C9FC07CB308DB3B3C9D20ED6639CCA70330870553E5C414CA92619418661197FAC10471DB1D381085DDADDB58796829CA90069"),
				B:       hexInt("3DF91610A83441CAEA9863BC2DED5D5AA8253AA10A2EF1C98B9AC8B57F1117A72BF2C7B9E7C1AC4D77FC94CADC083E67984050B75EBAE5DD2809BD638016F723"),
				Gx:      hexInt("81AEE4BDD82ED9645A21322E9C4C6A9385ED9F70B5D916C1B43B62EEF4D0098EFF3B1F78E2D0D48D50D1687B93B97D5F7C6D5047406A5E688B352209BCB9F822"),
				Gy:      hexInt("7DDE385D566332ECC0EABFA9CF7822FDF209F70024A57B1AA000C55B881F8111B2DCDE494A5F485E5BCA4BD88A2763AED1CA2B2FA8F0540678CD1E0F3AD80892"),
			},
		}
	})
	return bp512Curve
}

func hexInt(s string) *big.Int {
	n, ok := new(big.Int).SetString(s, 16)
	if !ok {
		panic("crypto: invalid Brainpool constant: " + s)
	}
	return n
}

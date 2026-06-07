package ddd

// CompositeVerifier runs multiple sub-verifiers in parallel and merges
// their per-EF results — typically used to combine a Gen1 RSA
// verifier with a Gen2 ECDSA verifier so a single ParseCard call
// produces meaningful signature status for *every* EF on a card that
// carries both generations (a Gen2v2 driver card includes a complete
// Gen1 fallback section alongside the Gen2 / Gen2v2 EFs).
//
// Merging rule: each sub-verifier emits one EFSignature per EF it
// received via Add. For a given (FID, Generation) pair the merged
// result is the *best* status across sub-verifiers, ordered
//
//	"verified" > "failed" > "unverifiable"
//
// So a Gen2 verifier reporting "Gen2 verifier not applicable" on a
// Gen1 EF doesn't shadow the Gen1 verifier's actual "verified"
// result.
//
// ChainValid is true if any sub-verifier reports its chain valid.
type CompositeVerifier struct {
	subs []Verifier
}

// NewCompositeVerifier returns a Verifier that delegates to each
// sub-verifier in turn.
func NewCompositeVerifier(verifiers ...Verifier) *CompositeVerifier {
	return &CompositeVerifier{subs: verifiers}
}

func (c *CompositeVerifier) Add(ef SignedEF) {
	for _, v := range c.subs {
		v.Add(ef)
	}
}

func (c *CompositeVerifier) Finalise() (bool, []EFSignature) {
	chainValid := false

	type key struct {
		fid uint16
		gen int
	}
	type slot struct {
		order int // first-seen position so output stays stable
		ef    EFSignature
	}
	merged := map[key]slot{}
	nextOrder := 0

	for _, v := range c.subs {
		cv, results := v.Finalise()
		if cv {
			chainValid = true
		}
		for _, r := range results {
			k := key{r.FID, r.Generation}
			existing, ok := merged[k]
			if !ok {
				nextOrder++
				merged[k] = slot{order: nextOrder, ef: r}
				continue
			}
			if statusRank(r.Status) > statusRank(existing.ef.Status) {
				existing.ef = r
				merged[k] = existing
			}
		}
	}

	out := make([]EFSignature, len(merged))
	for _, s := range merged {
		out[s.order-1] = s.ef
	}
	return chainValid, out
}

// statusRank orders "verified" > "failed" > "unverifiable" so that
// merging picks the most informative answer when sub-verifiers
// disagree.
func statusRank(status string) int {
	switch status {
	case "verified":
		return 3
	case "failed":
		return 2
	default:
		return 1
	}
}

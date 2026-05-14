package ddd

// Verifier validates a single per-EF signature record against the
// appropriate signing key, returning the verification status. Phase B
// will land two concrete implementations:
//
//   - Gen1: RSA-1024 with ISO/IEC 9796-2 message recovery + SHA-1
//     (Reg. 2016/799 Annex IC App. 11 Part A §3, §6).
//   - Gen2: ECDSA over Brainpool P-256/384/512 + SHA-256/384/512
//     (Annex IC App. 11 Part B §6, §9).
//
// In Phase B.1 (this commit) only the null verifier is wired up, so
// every EF reports `unverifiable`. Callers pass a real verifier via
// the `WithVerifier` parse option once it exists.
type Verifier interface {
	// Verify checks the signature in ef.Signature against ef.Body
	// using key material derived from the embedded ERCA root and any
	// MSCA / equipment certificates encountered on the card.
	Verify(ef SignedEF) VerifyResult
}

// SignedEF is the input to a Verifier — the raw EF body plus the
// signature record that immediately followed it on the wire.
//
// Body and Signature are sub-slices of the input data buffer passed to
// ParseCard; verifiers must not mutate them.
type SignedEF struct {
	FID        uint16
	Generation int // 1 (Gen1), 2 (Gen2 / Gen2v2)
	Body       []byte
	Signature  []byte
}

// VerifyResult is what a Verifier returns for one EF.
type VerifyResult struct {
	Status VerifyStatus
	// Reason is a short human-readable description when Status is
	// anything other than `Verified` (e.g. "no MSCA certificate
	// available", "signature mismatch", "chain not yet rooted").
	Reason string
}

// VerifyStatus captures the three terminal outcomes for any EF.
type VerifyStatus int

const (
	// VerifyUnverifiable — the verifier couldn't form an opinion
	// (missing key material, EF type the spec doesn't require to sign,
	// no verifier configured at parse time). Not a failure.
	VerifyUnverifiable VerifyStatus = iota
	// VerifyVerified — signature checked out against a valid chain
	// terminating at an embedded ERCA root.
	VerifyVerified
	// VerifyFailed — signature was present and did not match.
	VerifyFailed
)

// String reports a stable token for JSON output / SQL storage.
func (s VerifyStatus) String() string {
	switch s {
	case VerifyVerified:
		return "verified"
	case VerifyFailed:
		return "failed"
	default:
		return "unverifiable"
	}
}

// nullVerifier is the default — every signature is reported as
// unverifiable. Used when no real verifier was wired up via
// WithVerifier, so the Verified field is honestly false rather than
// silently true.
type nullVerifier struct{}

func (nullVerifier) Verify(SignedEF) VerifyResult {
	return VerifyResult{
		Status: VerifyUnverifiable,
		Reason: "no verifier configured",
	}
}

// parseOpts is the internal options bag mutated by ParseOption values.
type parseOpts struct {
	verifier Verifier
}

// ParseOption is a functional option for ParseCard / ParseVU.
type ParseOption func(*parseOpts)

// WithVerifier installs the signature verifier used for every EF
// encountered during parsing. Pass a real verifier from Phase B
// (Gen1 RSA / Gen2 ECDSA) once available. The default — used when
// this option is omitted — marks every EF as unverifiable.
func WithVerifier(v Verifier) ParseOption {
	return func(o *parseOpts) {
		if v != nil {
			o.verifier = v
		}
	}
}

func resolveOpts(opts []ParseOption) *parseOpts {
	out := &parseOpts{verifier: nullVerifier{}}
	for _, opt := range opts {
		opt(out)
	}
	return out
}

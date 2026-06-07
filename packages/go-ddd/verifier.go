package ddd

// Verifier validates the per-EF signature records produced during a
// card download. The interface intentionally separates collection
// (Add) from verification (Finalise) because the spec emits a card's
// data EFs *before* its certificate EFs (the card certificate at C100
// and the CA certificate at C108 are emitted after EF_Application_
// Identification's signature on Gen1 cards) — so individual signatures
// can't be verified until every EF has been seen and the certificate
// chain has been built.
//
// Phase B will land two concrete implementations:
//
//   - Gen1: RSA-1024 + ISO/IEC 9796-2 message recovery for cert chain,
//     PKCS#1 v1.5 + SHA-1 for per-EF data signatures
//     (Reg. 2016/799 Annex IC App. 11 Part A §3, §6).
//   - Gen2: ECDSA over Brainpool P-256/384/512 + SHA-256/384/512
//     (Annex IC App. 11 Part B §6, §9).
//
// In Phase B.1 only the null verifier is wired up, so every EF
// reports `unverifiable`. Callers pass a real verifier via the
// WithVerifier parse option once they exist.
type Verifier interface {
	// Add registers one (EF body, signature) pair as it's encountered
	// during the TLV walk. Implementations should buffer these — the
	// signed data and certificate EFs may arrive in any order.
	Add(ef SignedEF)

	// Finalise builds the certificate chain from any cert EFs collected
	// via Add and verifies every per-EF signature against the resolved
	// equipment public key. Called exactly once by ParseCard after the
	// TLV walk completes.
	//
	// Returns chainValid (true iff the ERCA → MSCA → equipment chain
	// validates) plus the canonical per-EF results in the order Add
	// was called.
	Finalise() (chainValid bool, results []EFSignature)
}

// SignedEF is the input to a Verifier — the raw EF body plus the
// signature record that immediately followed it on the wire.
//
// Signature may be nil for EFs that don't carry a separate signature
// record. Notably the certificate EFs (C100 = CardMA_Certificate,
// C101 = CardSign_Certificate, C108 = CA_Certificate, C109 =
// Link_Certificate) are themselves signed structures, so the parser
// passes them through with a nil Signature — verifiers absorb them as
// trust-chain inputs rather than items to verify.
//
// Body and Signature are sub-slices of the input data buffer passed to
// ParseCard; verifiers must not mutate them.
type SignedEF struct {
	FID        uint16
	Generation int // 1 (Gen1), 2 (Gen2 / Gen2v2)
	Body       []byte
	Signature  []byte
}

// VerifyResult is the per-EF outcome a Verifier publishes via Finalise.
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
type nullVerifier struct {
	pending []SignedEF
}

func (n *nullVerifier) Add(ef SignedEF) {
	n.pending = append(n.pending, ef)
}

func (n *nullVerifier) Finalise() (bool, []EFSignature) {
	out := make([]EFSignature, 0, len(n.pending))
	for _, ef := range n.pending {
		// Skip cert EFs (no separate signature record).
		if ef.Signature == nil {
			continue
		}
		out = append(out, EFSignature{
			FID:        ef.FID,
			Generation: ef.Generation,
			Status:     VerifyUnverifiable.String(),
			Reason:     "no verifier configured",
		})
	}
	return false, out
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
	out := &parseOpts{verifier: &nullVerifier{}}
	for _, opt := range opts {
		opt(out)
	}
	return out
}

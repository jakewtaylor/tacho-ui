package card

import (
	"fmt"
	"time"

	"github.com/jakewtaylor/go-ddd/internal/primitives"
)

// IdentificationBody is the decoded shape of EF_Identification (FID 0x0520),
// which is the concatenation of CardIdentification (Appendix 1 §2.13)
// followed by DriverCardHolderIdentification (Appendix 1 §2.61).
//
// The first-generation body is exactly 143 bytes: 65 + 78. Second-
// generation cards reuse the same field set in the same order, with
// additional fields appended; we decode the leading 143 bytes uniformly
// and treat any trailing data as Gen2 extensions for callers to handle.
type IdentificationBody struct {
	// CardIdentification fields.
	CardIssuingMemberState int
	CardNumber             string
	CardIssuingAuthority   string
	CardIssueDate          time.Time
	CardValidityBegin      time.Time
	CardExpiryDate         time.Time

	// DriverCardHolderIdentification fields.
	HolderSurname    string
	HolderFirstNames string
	HolderBirthDate  primitives.Date
	PreferredLang    string
}

// Field offsets within the 143-byte EF_Identification body. Derived
// from Appendix 1 §2.13 (CardIdentification) and §2.61
// (DriverCardHolderIdentification).
const (
	offCardIssuingMemberState = 0  // NationNumeric, 1 byte
	offCardNumber             = 1  // CardNumber, 16 bytes IA5
	offCardIssuingAuthority   = 17 // Name, 36 bytes (1 cp + 35)
	offCardIssueDate          = 53 // TimeReal, 4 bytes
	offCardValidityBegin      = 57 // TimeReal, 4 bytes
	offCardExpiryDate         = 61 // TimeReal, 4 bytes
	offHolderName             = 65 // HolderName, 72 bytes (2 × Name)
	offHolderBirthDate        = 137 // Datef, 4 bytes
	offHolderPreferredLang    = 141 // IA5String SIZE(2), 2 bytes

	identificationBodyLen = 143
)

// DecodeIdentification parses an EF_Identification body. The body must
// be at least 143 bytes; trailing bytes are tolerated to accommodate
// Gen2 extensions.
func DecodeIdentification(body []byte) (*IdentificationBody, error) {
	if len(body) < identificationBodyLen {
		return nil, fmt.Errorf("card: EF_Identification body too short: %d bytes (need %d)",
			len(body), identificationBodyLen)
	}

	issueDate, err := primitives.TimeReal(body[offCardIssueDate : offCardIssueDate+4])
	if err != nil {
		return nil, fmt.Errorf("card: EF_Identification issue date: %w", err)
	}
	validityBegin, err := primitives.TimeReal(body[offCardValidityBegin : offCardValidityBegin+4])
	if err != nil {
		return nil, fmt.Errorf("card: EF_Identification validity begin: %w", err)
	}
	expiryDate, err := primitives.TimeReal(body[offCardExpiryDate : offCardExpiryDate+4])
	if err != nil {
		return nil, fmt.Errorf("card: EF_Identification expiry date: %w", err)
	}
	holder, err := primitives.HolderName(body[offHolderName : offHolderName+primitives.NameLen*2])
	if err != nil {
		return nil, fmt.Errorf("card: EF_Identification holder name: %w", err)
	}
	birth, err := primitives.Datef(body[offHolderBirthDate : offHolderBirthDate+4])
	if err != nil {
		return nil, fmt.Errorf("card: EF_Identification holder birth date: %w", err)
	}

	return &IdentificationBody{
		CardIssuingMemberState: int(body[offCardIssuingMemberState]),
		CardNumber:             primitives.IA5String(body[offCardNumber : offCardNumber+16]),
		CardIssuingAuthority:   decodeName(body[offCardIssuingAuthority : offCardIssuingAuthority+primitives.NameLen]),
		CardIssueDate:          issueDate,
		CardValidityBegin:      validityBegin,
		CardExpiryDate:         expiryDate,
		HolderSurname:          holder.Surname,
		HolderFirstNames:       holder.FirstNames,
		HolderBirthDate:        birth,
		PreferredLang:          primitives.IA5String(body[offHolderPreferredLang : offHolderPreferredLang+2]),
	}, nil
}

// decodeName decodes a Name and falls back to an empty string on error;
// authority names are nice-to-have, not validation-critical.
func decodeName(body []byte) string {
	n, err := primitives.Name(body)
	if err != nil {
		return ""
	}
	return n
}

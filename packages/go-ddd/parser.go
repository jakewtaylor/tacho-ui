package ddd

import (
	"fmt"

	"github.com/jakewtaylor/go-ddd/internal/card"
	"github.com/jakewtaylor/go-ddd/internal/tlv"
)

// ParseCard parses the contents of a driver-card .ddd download into a
// typed Card. The TLV framing is verified, every recognised elementary
// file is decoded, and unrecognised EFs are silently skipped so the
// parser can tolerate new card revisions without breaking. Signature
// verification is not performed in Phase A — Card.Verified will read
// false.
//
// The returned Card may contain only a subset of the fields populated
// — fields whose underlying EF decoder is not yet implemented are left
// nil. Callers should expect to handle nil pointers across the struct.
func ParseCard(data []byte) (*Card, error) {
	if len(data) == 0 {
		return nil, ErrEmpty
	}

	c := &Card{}
	err := tlv.Walk(data, func(rec tlv.Record) error {
		if rec.Type.IsSignature() {
			// Phase B: feed the signature bytes into the verifier
			// alongside the immediately preceding data record. For now,
			// ignore signatures entirely.
			return nil
		}
		if !rec.Type.IsData() {
			return nil
		}
		return dispatchCardEF(c, rec)
	})
	if err != nil {
		return nil, fmt.Errorf("ddd: parse card: %w", err)
	}
	return c, nil
}

// dispatchCardEF routes a single data record to the EF-specific decoder
// and merges its output into the accumulating Card. The TLV record type
// discriminates first- vs second-generation; first-generation populates
// the *_1 fields, Gen2 / Gen2v2 the *_2 fields.
func dispatchCardEF(c *Card, rec tlv.Record) error {
	switch card.FID(rec.FID) {
	case card.FIDIdentification:
		body, err := card.DecodeIdentification(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Identification (gen %d): %w", rec.Type.Generation(), err)
		}
		ident := identificationToCardIdent(body)
		if rec.Type.Generation() == 1 {
			c.Identification1 = ident
		} else {
			c.Identification2 = ident
		}

	default:
		// Decoder not yet implemented — skip silently. Future EF
		// decoders dispatch here. This keeps unknown EFs from breaking
		// the parse, matching upstream tachoparser's tolerance.
	}
	return nil
}

// identificationToCardIdent lifts a decoded card.IdentificationBody into
// the public CardIdent shape. Kept separate so the internal decoder can
// evolve without leaking through the public API.
func identificationToCardIdent(b *card.IdentificationBody) *CardIdent {
	out := &CardIdent{
		CardIdentification: &CardIdentification{
			CardIssuingMemberState: b.CardIssuingMemberState,
			CardNumber:             b.CardNumber,
			CardIssuingAuthority:   b.CardIssuingAuthority,
			CardIssueDate:          b.CardIssueDate,
			CardValidityBegin:      b.CardValidityBegin,
			CardExpiryDate:         b.CardExpiryDate,
		},
		DriverCardHolderIdentification: &DriverCardHolderIdentification{
			CardHolderName: &CardHolderName{
				HolderSurname:    b.HolderSurname,
				HolderFirstNames: b.HolderFirstNames,
			},
			CardHolderPreferredLanguage: b.PreferredLang,
		},
	}
	if !b.HolderBirthDate.Zero() {
		out.DriverCardHolderIdentification.CardHolderBirthDate = &BirthDate{
			Year:  b.HolderBirthDate.Year,
			Month: b.HolderBirthDate.Month,
			Day:   b.HolderBirthDate.Day,
		}
	}
	return out
}

// ParseVU is the entry point for vehicle-unit .ddd files. Not implemented
// in Phase A.
func ParseVU(data []byte) (*VU, error) {
	return nil, fmt.Errorf("ddd: ParseVU not implemented yet (Phase C)")
}

// VU is the placeholder type for the future vehicle-unit decoder.
type VU struct{}

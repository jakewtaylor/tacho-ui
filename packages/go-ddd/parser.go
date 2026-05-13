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
	gen := rec.Type.Generation()

	switch card.FID(rec.FID) {
	case card.FIDIdentification:
		body, err := card.DecodeIdentification(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Identification (gen %d): %w", gen, err)
		}
		setIdent(c, gen, identificationToCardIdent(body))

	case card.FIDVehiclesUsed:
		records, err := card.DecodeVehiclesUsed(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Vehicles_Used (gen %d): %w", gen, err)
		}
		setVehicles(c, gen, vehiclesToCardData(records))

	case card.FIDPlaces:
		records, err := card.DecodePlaces(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Places (gen %d): %w", gen, err)
		}
		setPlaces(c, gen, placesToCardData(records))

	case card.FIDEventsData:
		records, err := card.DecodeEventOrFaultBlock(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Events_Data (gen %d): %w", gen, err)
		}
		setEvents(c, gen, eventsToCardData(records, true))

	case card.FIDFaultsData:
		records, err := card.DecodeEventOrFaultBlock(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Faults_Data (gen %d): %w", gen, err)
		}
		setFaults(c, gen, eventsToCardData(records, false))

	case card.FIDDriverActivityData:
		records, err := card.DecodeDriverActivity(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Driver_Activity_Data (gen %d): %w", gen, err)
		}
		setDriverActivity(c, gen, driverActivityToCardData(records))

	case card.FIDGNSSPlaces, card.FIDGNSSPlacesAuth:
		// GNSS decoders land alongside signature verification in a
		// follow-up — the GeoCoordinate scaling needs validation
		// against a real Gen2 card before we commit.

	default:
		// Decoder not yet implemented or EF not part of the driver-card
		// application — skip silently. Matches upstream tolerance.
	}
	return nil
}

// --- per-EF setters/adapters ---------------------------------------------

func setIdent(c *Card, gen int, v *CardIdent) {
	if gen == 1 {
		c.Identification1 = v
	} else {
		c.Identification2 = v
	}
}

func setVehicles(c *Card, gen int, v *VehiclesData) {
	if gen == 1 {
		c.VehiclesUsed1 = v
	} else {
		c.VehiclesUsed2 = v
	}
}

func setPlaces(c *Card, gen int, v *PlaceData) {
	if gen == 1 {
		c.PlaceDailyWorkPeriod1 = v
	} else {
		c.PlaceDailyWorkPeriod2 = v
	}
}

func setDriverActivity(c *Card, gen int, v *DriverActivity) {
	if gen == 1 {
		c.DriverActivity1 = v
	} else {
		c.DriverActivity2 = v
	}
}

func driverActivityToCardData(records []card.DailyRecord) *DriverActivity {
	out := &DriverActivity{DecodedActivityDailyRecords: make([]DecodedDailyRecord, 0, len(records))}
	for _, r := range records {
		changes := make([]ActivityChange, 0, len(r.Changes))
		for _, c := range r.Changes {
			changes = append(changes, ActivityChange{
				Driver:      c.Driver,
				Team:        c.Team,
				CardPresent: c.CardPresent,
				WorkType:    c.WorkType,
				Minutes:     c.Minutes,
			})
		}
		out.DecodedActivityDailyRecords = append(out.DecodedActivityDailyRecords, DecodedDailyRecord{
			ActivityRecordDate:  r.Date,
			ActivityDayDistance: r.Distance,
			ActivityChangeInfo:  changes,
		})
	}
	return out
}

func setEvents(c *Card, gen int, v *EventOrFaultData) {
	if gen == 1 {
		c.EventData1 = v
	} else {
		c.EventData2 = v
	}
}

func setFaults(c *Card, gen int, v *EventOrFaultData) {
	if gen == 1 {
		c.FaultData1 = v
	} else {
		c.FaultData2 = v
	}
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

func vehiclesToCardData(records []card.VehicleRecord) *VehiclesData {
	out := &VehiclesData{CardVehicleRecords: make([]VehicleRecord, 0, len(records))}
	for _, r := range records {
		out.CardVehicleRecords = append(out.CardVehicleRecords, VehicleRecord{
			VehicleOdometerBegin: r.OdometerBegin,
			VehicleOdometerEnd:   r.OdometerEnd,
			VehicleFirstUse:      r.FirstUse,
			VehicleLastUse:       r.LastUse,
			VehicleRegistration: &VehicleRegistration{
				VehicleRegistrationNation: r.RegistrationNation,
				VehicleRegistrationNumber: r.RegistrationNumber,
			},
		})
	}
	return out
}

func placesToCardData(records []card.PlaceRecord) *PlaceData {
	out := &PlaceData{PlaceRecords: make([]PlaceRecord, 0, len(records))}
	for _, r := range records {
		out.PlaceRecords = append(out.PlaceRecords, PlaceRecord{
			EntryTime:                r.EntryTime,
			EntryTypeDailyWorkPeriod: r.EntryTypeDailyWorkPeriod,
			DailyWorkPeriodCountry:   r.DailyWorkPeriodCountry,
			DailyWorkPeriodRegion:    r.DailyWorkPeriodRegion,
			VehicleOdometerValue:     r.VehicleOdometerValue,
		})
	}
	return out
}

// eventsToCardData wraps a flat list of decoded events or faults in the
// nested bucket shape that downstream consumers expect (one bucket
// containing every record). The isEvent flag toggles whether records
// populate the event_* fields vs the fault_* fields of the shared
// EventOrFaultRecord JSON shape.
func eventsToCardData(records []card.EventOrFaultRecord, isEvent bool) *EventOrFaultData {
	out := &EventOrFaultData{}
	bucket := EventOrFaultBucket{}
	for _, r := range records {
		rec := EventOrFaultRecord{}
		reg := &VehicleRegistration{
			VehicleRegistrationNation: r.RegistrationNation,
			VehicleRegistrationNumber: r.RegistrationNumber,
		}
		if isEvent {
			rec.EventType = r.TypeCode
			rec.EventBeginTime = r.BeginTime
			rec.EventEndTime = r.EndTime
			rec.EventVehicleRegistration = reg
			bucket.CardEventRecords = append(bucket.CardEventRecords, rec)
		} else {
			rec.FaultType = r.TypeCode
			rec.FaultBeginTime = r.BeginTime
			rec.FaultEndTime = r.EndTime
			rec.FaultVehicleRegistration = reg
			bucket.CardFaultRecords = append(bucket.CardFaultRecords, rec)
		}
	}
	if isEvent {
		out.CardEventRecordsArray = []EventOrFaultBucket{bucket}
	} else {
		out.CardFaultRecordsArray = []EventOrFaultBucket{bucket}
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

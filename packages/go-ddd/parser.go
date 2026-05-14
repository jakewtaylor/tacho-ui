package ddd

import (
	"fmt"
	"math"

	"github.com/jakewtaylor/go-ddd/internal/card"
	"github.com/jakewtaylor/go-ddd/internal/tlv"
)

// ParseCard parses the contents of a driver-card .ddd download into a
// typed Card. The TLV framing is verified, every recognised elementary
// file is decoded, and unrecognised EFs are silently skipped so the
// parser can tolerate new card revisions without breaking.
//
// Signature handling: each signature TLV record is paired with the
// immediately preceding data record (same FID, same generation) and
// fed to the Verifier configured via WithVerifier. The default
// verifier reports every EF as unverifiable — see verifier.go. The
// per-EF results land on Card.Signature.EFs.
//
// Per-EF decoder failures are non-fatal: they are appended to
// Card.DecodeErrors and parsing continues with the next record. This
// matches upstream behaviour and ensures a single malformed/unknown EF
// can't black-hole the whole card. Framing errors (truncated TLV) still
// terminate the parse.
func ParseCard(data []byte, opts ...ParseOption) (*Card, error) {
	if len(data) == 0 {
		return nil, ErrEmpty
	}
	cfg := resolveOpts(opts)

	c := &Card{}
	// pending tracks the last data record seen, so when a sig record
	// arrives we know what body it signed. App. 7 §3.2 guarantees the
	// pairing — every signature record immediately follows its data
	// record in the stream.
	var pending *tlv.Record
	err := tlv.Walk(data, func(rec tlv.Record) error {
		if rec.Type.IsSignature() {
			if pending != nil && pending.FID == rec.FID &&
				pending.Type.Generation() == rec.Type.Generation() {
				recordEFSignature(c, cfg.verifier, *pending, rec)
			}
			// A signature without a matching preceding data record is
			// invalid framing per the spec, but we shrug and continue
			// — Card.DecodeErrors will surface anything that mattered.
			pending = nil
			return nil
		}
		if !rec.Type.IsData() {
			return nil
		}
		// Decode the EF body. The pending pointer is set regardless of
		// decode success — the signature is over the raw bytes, not
		// our parsed view, so it can still be verified.
		if err := dispatchCardEF(c, rec); err != nil {
			c.DecodeErrors = append(c.DecodeErrors, err.Error())
		}
		// Stash a copy by value — the record is a sub-slice of `data`
		// so this is cheap and safe.
		r := rec
		pending = &r
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("ddd: parse card: %w", err)
	}
	finaliseSignatureSummary(c)
	return c, nil
}

// recordEFSignature runs the configured Verifier against one (data,
// sig) pair and stores the result on the Card.
func recordEFSignature(c *Card, v Verifier, data tlv.Record, sig tlv.Record) {
	res := v.Verify(SignedEF{
		FID:        data.FID,
		Generation: data.Type.Generation(),
		Body:       data.Value,
		Signature:  sig.Value,
	})
	c.Signature.EFs = append(c.Signature.EFs, EFSignature{
		FID:        data.FID,
		Generation: data.Type.Generation(),
		Status:     res.Status.String(),
		Reason:     res.Reason,
	})
}

// finaliseSignatureSummary fills in the count fields and the top-level
// Card.Verified bool from the per-EF list. Card.Verified reads true
// only when the chain validates *and* at least one EF was actually
// verified *and* no EF failed — a strict definition that future
// callers can relax if needed.
func finaliseSignatureSummary(c *Card) {
	for _, ef := range c.Signature.EFs {
		switch ef.Status {
		case "verified":
			c.Signature.VerifiedCount++
		case "failed":
			c.Signature.FailedCount++
		default:
			c.Signature.UnverifiableCount++
		}
	}
	c.Verified = c.Signature.ChainValid &&
		c.Signature.VerifiedCount > 0 &&
		c.Signature.FailedCount == 0
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

	case card.FIDGNSSPlaces:
		records, err := card.DecodeGnss(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_GNSS_Places (gen %d): %w", gen, err)
		}
		c.GnssAccumulated = gnssToCardData(records, false)

	case card.FIDBorderCrossings:
		records, err := card.DecodeBorderCrossings(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Border_Crossings (gen %d): %w", gen, err)
		}
		c.BorderCrossings = borderCrossingsToCardData(records)

	case card.FIDLoadUnloadOperations:
		records, err := card.DecodeLoadUnload(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Load_Unload_Operations (gen %d): %w", gen, err)
		}
		c.LoadUnloadOps = loadUnloadToCardData(records)

	case card.FIDLoadTypeEntries:
		records, err := card.DecodeLoadType(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Load_Type_Entries (gen %d): %w", gen, err)
		}
		c.LoadTypeEntries = loadTypeToCardData(records)

	case card.FIDPlacesAuthentication:
		records, err := card.DecodeAuthStatus(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_Places_Authentication (gen %d): %w", gen, err)
		}
		c.PlacesAuthStatus = authStatusToCardData(records)

	case card.FIDGNSSPlacesAuthentication:
		records, err := card.DecodeAuthStatus(rec.Value)
		if err != nil {
			return fmt.Errorf("EF_GNSS_Places_Authentication (gen %d): %w", gen, err)
		}
		c.GnssPlacesAuthStatus = authStatusToCardData(records)

	case card.FIDApplicationIdentificationV2,
		card.FIDVUConfiguration:
		// Recognised but deliberately skipped. Application_Identification_V2
		// is just buffer-size counters that the parser doesn't expose;
		// VU_Configuration is a placeholder file (2021/1228 §TCS_152
		// note: "the vehicle unit shall ignore the elementary file
		// EF VU_Configuration in all cards insofar as no specific rules
		// have been provided").

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

// validCoords returns a *GeoCoordinates only when both lat and lng are
// finite (not NaN). Out-of-range raw values decode to NaN in the card
// layer (see card.geoCoordinateToDegrees); nil-ing the pointer here
// propagates "no fix" all the way to SQL (NULL columns) and the UI
// (which renders "—") instead of leaking 8389° garbage.
func validCoords(lat, lng float64) *GeoCoordinates {
	if math.IsNaN(lat) || math.IsNaN(lng) {
		return nil
	}
	return &GeoCoordinates{Latitude: lat, Longitude: lng}
}

// gnssToCardData lifts decoded GNSS samples into the JSON-shaped
// GnssData. The isAuth flag selects which slice (auth vs accumulated)
// the records populate — both are exposed for upstream compatibility.
func gnssToCardData(records []card.GnssRecord, isAuth bool) *GnssData {
	out := &GnssData{}
	dst := make([]GnssRecord, 0, len(records))
	for _, r := range records {
		coords := validCoords(r.Latitude, r.Longitude)
		if coords == nil {
			// No valid fix on this slot; drop it rather than emit a
			// "no info" point. The outer-timestamp filter already
			// drops empty slots, so anything we omit here is an
			// explicit no-fix record.
			continue
		}
		dst = append(dst, GnssRecord{
			TimeStamp:            r.TimeStamp,
			VehicleOdometerValue: r.Odometer,
			GnssPlaceRecord:      &GnssPlaceRecord{GeoCoordinates: coords},
		})
	}
	if isAuth {
		out.GnssAuthAccumulatedDrivingRecords = dst
	} else {
		out.GnssAccumulatedDrivingRecords = dst
	}
	return out
}

// --- Gen2v2 adapters ----------------------------------------------------

func borderCrossingsToCardData(records []card.BorderCrossingRecord) *BorderCrossingsData {
	out := &BorderCrossingsData{
		CardBorderCrossingRecords: make([]BorderCrossingRecord, 0, len(records)),
	}
	for _, r := range records {
		out.CardBorderCrossingRecords = append(out.CardBorderCrossingRecords, BorderCrossingRecord{
			CountryLeft:          r.CountryLeft,
			CountryEntered:       r.CountryEntered,
			TimeStamp:            r.GnssPlaceAuth.TimeStamp,
			GeoCoordinates:       validCoords(r.GnssPlaceAuth.Latitude, r.GnssPlaceAuth.Longitude),
			AuthenticationStatus: r.GnssPlaceAuth.AuthStatus.String(),
			VehicleOdometerValue: r.Odometer,
		})
	}
	return out
}

func loadUnloadToCardData(records []card.LoadUnloadRecord) *LoadUnloadData {
	out := &LoadUnloadData{
		CardLoadUnloadRecords: make([]LoadUnloadRecord, 0, len(records)),
	}
	for _, r := range records {
		out.CardLoadUnloadRecords = append(out.CardLoadUnloadRecords, LoadUnloadRecord{
			TimeStamp:            r.TimeStamp,
			OperationType:        r.OperationType.String(),
			GeoCoordinates:       validCoords(r.GnssPlaceAuth.Latitude, r.GnssPlaceAuth.Longitude),
			AuthenticationStatus: r.GnssPlaceAuth.AuthStatus.String(),
			VehicleOdometerValue: r.Odometer,
		})
	}
	return out
}

func loadTypeToCardData(records []card.LoadTypeEntry) *LoadTypeData {
	out := &LoadTypeData{
		CardLoadTypeEntryRecords: make([]LoadTypeEntry, 0, len(records)),
	}
	for _, r := range records {
		out.CardLoadTypeEntryRecords = append(out.CardLoadTypeEntryRecords, LoadTypeEntry{
			TimeStamp: r.TimeStamp,
			LoadType:  r.LoadType.String(),
		})
	}
	return out
}

func authStatusToCardData(records []card.AuthStatusEntry) []AuthStatusEntry {
	out := make([]AuthStatusEntry, 0, len(records))
	for _, r := range records {
		out = append(out, AuthStatusEntry{
			TimeStamp:            r.TimeStamp,
			AuthenticationStatus: r.AuthStatus.String(),
		})
	}
	return out
}

// ParseVU is the entry point for vehicle-unit .ddd files. Not implemented
// in Phase A.
func ParseVU(data []byte, opts ...ParseOption) (*VU, error) {
	_ = resolveOpts(opts) // accepted but ignored until Phase C
	return nil, fmt.Errorf("ddd: ParseVU not implemented yet (Phase C)")
}

// VU is the placeholder type for the future vehicle-unit decoder.
type VU struct{}

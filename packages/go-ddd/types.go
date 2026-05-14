package ddd

import "time"

// Card is the parsed contents of a driver-card .ddd file. The JSON tags
// match the field shape produced by upstream tachoparser so that callers
// who serialise the struct (for archival, diffing, or downstream
// consumers) get a compatible representation.
//
// The pointer types on the top-level sections mirror the upstream
// behaviour: a missing elementary file is null in the JSON output, not
// an empty object.
type Card struct {
	Identification1 *CardIdent `json:"card_identification_and_driver_card_holder_identification_1,omitempty"`
	Identification2 *CardIdent `json:"card_identification_and_driver_card_holder_identification_2,omitempty"`

	DriverActivity1 *DriverActivity `json:"card_driver_activity_1,omitempty"`
	DriverActivity2 *DriverActivity `json:"card_driver_activity_2,omitempty"`

	PlaceDailyWorkPeriod1 *PlaceData `json:"card_place_daily_work_period_1,omitempty"`
	PlaceDailyWorkPeriod2 *PlaceData `json:"card_place_daily_work_period_2,omitempty"`

	VehiclesUsed1 *VehiclesData `json:"card_vehicles_used_1,omitempty"`
	VehiclesUsed2 *VehiclesData `json:"card_vehicles_used_2,omitempty"`

	EventData1 *EventOrFaultData `json:"card_event_data_1,omitempty"`
	EventData2 *EventOrFaultData `json:"card_event_data_2,omitempty"`
	FaultData1 *EventOrFaultData `json:"card_fault_data_1,omitempty"`
	FaultData2 *EventOrFaultData `json:"card_fault_data_2,omitempty"`

	GnssAccumulated     *GnssData `json:"gnss_accumulated_driving,omitempty"`
	GnssAuthAccumulated *GnssData `json:"gnss_auth_accumulated_driving,omitempty"`

	// Gen2v2-only sections. Populated when the driver card was issued
	// against cardStructureVersion {01 01} (Reg. 2021/1228) and the
	// corresponding EF is non-empty.
	BorderCrossings    *BorderCrossingsData `json:"card_border_crossings,omitempty"`
	LoadUnloadOps      *LoadUnloadData      `json:"card_load_unload_operations,omitempty"`
	LoadTypeEntries    *LoadTypeData        `json:"card_load_type_entries,omitempty"`
	PlacesAuthStatus   []AuthStatusEntry    `json:"places_authentication,omitempty"`
	GnssPlacesAuthStatus []AuthStatusEntry  `json:"gnss_places_authentication,omitempty"`

	// Signature verification status — populated by Phase B. Until then
	// these always read false.
	Verified  bool              `json:"verified"`
	Signature SignatureSummary  `json:"signature_summary"`

	// DecodeErrors accumulates any per-EF decode failures encountered
	// during parse. A non-empty slice doesn't mean the parse failed —
	// the recognised EFs are still populated.
	DecodeErrors []string `json:"decode_errors,omitempty"`
}

// SignatureSummary records the outcome of signature verification across
// every EF on the card. Phase A always returns an empty summary with
// ChainValid=false.
type SignatureSummary struct {
	ChainValid     bool     `json:"chain_valid"`
	VerifiedEFs    []uint16 `json:"verified_efs,omitempty"`
	FailedEFs      []uint16 `json:"failed_efs,omitempty"`
	UnverifiableEF []uint16 `json:"unverifiable_efs,omitempty"`
}

// CardIdent — EF_Identification (App. 2 §4.2.1). Contains the card's
// own identifiers plus the cardholder's identity.
type CardIdent struct {
	CardIdentification             *CardIdentification             `json:"card_identification,omitempty"`
	DriverCardHolderIdentification *DriverCardHolderIdentification `json:"driver_card_holder_identification,omitempty"`
}

// CardIdentification — Appendix 1 §2.13. CardNumber is an IA5 string;
// the dates use the TimeReal encoding.
type CardIdentification struct {
	CardIssuingMemberState int       `json:"card_issuing_member_state"`
	CardNumber             string    `json:"card_number"`
	CardIssuingAuthority   string    `json:"card_issuing_authority_name,omitempty"`
	CardIssueDate          time.Time `json:"card_issue_date"`
	CardValidityBegin      time.Time `json:"card_validity_begin,omitempty"`
	CardExpiryDate         time.Time `json:"card_expiry_date"`
}

// DriverCardHolderIdentification — Appendix 1 §2.61.
type DriverCardHolderIdentification struct {
	CardHolderName             *CardHolderName `json:"card_holder_name,omitempty"`
	CardHolderBirthDate        *BirthDate      `json:"card_holder_birth_date,omitempty"`
	CardHolderPreferredLanguage string         `json:"card_holder_preferred_language,omitempty"`
}

// CardHolderName — Appendix 1 §2.83 (HolderName).
type CardHolderName struct {
	HolderSurname    string `json:"holder_surname"`
	HolderFirstNames string `json:"holder_first_names"`
}

// BirthDate — Appendix 1 §2.41 (Datef SIZE(4)).
type BirthDate struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

// DriverActivity wraps the decoded per-day activity records for a
// generation. The cyclic-buffer layout in the EF itself is unwound by
// the decoder into a flat slice of records.
type DriverActivity struct {
	DecodedActivityDailyRecords []DecodedDailyRecord `json:"decoded_activity_daily_records"`
}

// DecodedDailyRecord — one logical day's activity. ActivityChangeInfo is
// a chronological list of activity-change events keyed by minute-of-day.
type DecodedDailyRecord struct {
	ActivityRecordDate  time.Time          `json:"activity_record_date"`
	ActivityDayDistance int                `json:"activity_day_distance"`
	ActivityChangeInfo  []ActivityChange   `json:"activity_change_info"`
}

// ActivityChange — Appendix 1 §2.1 (ActivityChangeInfo). The bit-layout
// of the 16-bit record is unpacked into named fields:
//   - Driver (bit 15): slot of the driver vs co-driver
//   - Team (bit 14): single vs crew operation
//   - CardPresent (bit 13): card inserted
//   - WorkType (bits 12..11): 0=rest, 1=availability, 2=work, 3=drive
//   - Minutes (bits 10..0): minute of day, 0..1439
type ActivityChange struct {
	Driver      bool `json:"driver"`
	Team        bool `json:"team"`
	CardPresent bool `json:"card_present"`
	WorkType    int  `json:"work_type"`
	Minutes     int  `json:"minutes"`
}

// PlaceData — EF_Places (App. 2 §4.2.4).
type PlaceData struct {
	PlaceRecords []PlaceRecord `json:"place_records"`
}

// PlaceRecord — Appendix 1 §2.117.
type PlaceRecord struct {
	EntryTime                time.Time `json:"entry_time"`
	EntryTypeDailyWorkPeriod int       `json:"entry_type_daily_work_period"`
	DailyWorkPeriodCountry   int       `json:"daily_work_period_country"`
	DailyWorkPeriodRegion    int       `json:"daily_work_period_region"`
	VehicleOdometerValue     int       `json:"vehicle_odometer_value"`
}

// VehiclesData — EF_Vehicles_Used (App. 2 §4.2.2).
type VehiclesData struct {
	CardVehicleRecords []VehicleRecord `json:"card_vehicle_records"`
}

// VehicleRecord — Appendix 1 §2.32. One usage window of one vehicle by
// this driver.
type VehicleRecord struct {
	VehicleOdometerBegin int                  `json:"vehicle_odometer_begin"`
	VehicleOdometerEnd   int                  `json:"vehicle_odometer_end"`
	VehicleFirstUse      time.Time            `json:"vehicle_first_use"`
	VehicleLastUse       time.Time            `json:"vehicle_last_use"`
	VehicleRegistration  *VehicleRegistration `json:"vehicle_registration,omitempty"`
}

// VehicleRegistration — Appendix 1 §2.166.
type VehicleRegistration struct {
	VehicleRegistrationNation int    `json:"vehicle_registration_nation"`
	VehicleRegistrationNumber string `json:"vehicle_registration_number"`
}

// EventOrFaultData — EF_Events_Data / EF_Faults_Data (App. 2 §4.2.5/§4.2.6).
// The data dictionary nests records under per-event-type arrays
// ("card_event_records_array"), each holding the recent N records of
// that type. Faults follow the same nesting under the fault-typed
// equivalent.
type EventOrFaultData struct {
	CardEventRecordsArray []EventOrFaultBucket `json:"card_event_records_array,omitempty"`
	CardFaultRecordsArray []EventOrFaultBucket `json:"card_fault_records_array,omitempty"`
}

// EventOrFaultBucket is the inner array — for events it carries
// CardEventRecords; for faults it carries CardFaultRecords. Both fields
// are present (one empty) so the JSON shape is stable.
type EventOrFaultBucket struct {
	CardEventRecords []EventOrFaultRecord `json:"card_event_records,omitempty"`
	CardFaultRecords []EventOrFaultRecord `json:"card_fault_records,omitempty"`
}

// EventOrFaultRecord — Appendix 1 §2.27 (CardEventRecord) / §2.74
// (CardFaultRecord). Faults reuse the EventFaultType code space.
type EventOrFaultRecord struct {
	EventType                int                  `json:"event_type,omitempty"`
	FaultType                int                  `json:"fault_type,omitempty"`
	EventBeginTime           time.Time            `json:"event_begin_time,omitempty"`
	EventEndTime             time.Time            `json:"event_end_time,omitempty"`
	FaultBeginTime           time.Time            `json:"fault_begin_time,omitempty"`
	FaultEndTime             time.Time            `json:"fault_end_time,omitempty"`
	EventVehicleRegistration *VehicleRegistration `json:"event_vehicle_registration,omitempty"`
	FaultVehicleRegistration *VehicleRegistration `json:"fault_vehicle_registration,omitempty"`
}

// GnssData — EF_GNSS_Places (App. 2 §4.5, Gen2 only) and EF_GNSS_PlacesAuth
// (Gen2v2 only). Both elementary files carry GNSS samples accumulated
// during driving.
type GnssData struct {
	GnssAccumulatedDrivingRecords     []GnssRecord `json:"gnss_accumulated_driving_records,omitempty"`
	GnssAuthAccumulatedDrivingRecords []GnssRecord `json:"gnss_auth_accumulated_driving_records,omitempty"`
}

// GnssRecord — Appendix 1 §2.79.
type GnssRecord struct {
	TimeStamp            time.Time        `json:"time_stamp"`
	GnssPlaceRecord      *GnssPlaceRecord `json:"gnss_place_record,omitempty"`
	VehicleOdometerValue int              `json:"vehicle_odometer_value"`
}

// GnssPlaceRecord — Appendix 1 §2.80.
type GnssPlaceRecord struct {
	GeoCoordinates *GeoCoordinates `json:"geo_coordinates,omitempty"`
}

// GeoCoordinates — Appendix 1 §2.76. Latitude/longitude as decimal
// degrees, decoded from the on-wire 3-byte signed DDMM.M ×10 form.
type GeoCoordinates struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// --- Gen2v2 EFs (Reg. 2021/1228) ---

// BorderCrossingsData — EF_Border_Crossings (2021/1228 §2.11a).
type BorderCrossingsData struct {
	CardBorderCrossingRecords []BorderCrossingRecord `json:"card_border_crossing_records,omitempty"`
}

// BorderCrossingRecord — 2021/1228 §2.11b CardBorderCrossingRecord.
// Logs a vehicle-detected change of country with the GNSS position at
// detection time and the odometer value.
type BorderCrossingRecord struct {
	CountryLeft          int           `json:"country_left"`    // NationNumeric; 0xFF = "Rest of the World"
	CountryEntered       int           `json:"country_entered"`
	TimeStamp            time.Time     `json:"time_stamp"`
	GeoCoordinates       *GeoCoordinates `json:"geo_coordinates,omitempty"`
	AuthenticationStatus string        `json:"authentication_status"`
	VehicleOdometerValue int           `json:"vehicle_odometer_value"`
}

// LoadUnloadData — EF_Load_Unload_Operations (2021/1228 §2.24c).
type LoadUnloadData struct {
	CardLoadUnloadRecords []LoadUnloadRecord `json:"card_load_unload_records,omitempty"`
}

// LoadUnloadRecord — 2021/1228 §2.24d CardLoadUnloadRecord.
// Logs a cargo load or unload event with location and odometer.
type LoadUnloadRecord struct {
	TimeStamp            time.Time       `json:"time_stamp"`
	OperationType        string          `json:"operation_type"` // load / unload / simultaneous / unknown
	GeoCoordinates       *GeoCoordinates `json:"geo_coordinates,omitempty"`
	AuthenticationStatus string          `json:"authentication_status"`
	VehicleOdometerValue int             `json:"vehicle_odometer_value"`
}

// LoadTypeData — EF_Load_Type_Entries (2021/1228 §2.24a).
type LoadTypeData struct {
	CardLoadTypeEntryRecords []LoadTypeEntry `json:"card_load_type_entry_records,omitempty"`
}

// LoadTypeEntry — 2021/1228 §2.24b CardLoadTypeEntryRecord.
type LoadTypeEntry struct {
	TimeStamp time.Time `json:"time_stamp"`
	LoadType  string    `json:"load_type"` // undefined / goods / passengers / unknown
}

// AuthStatusEntry — joined-by-timestamp side record from
// EF_Places_Authentication (2021/1228 §2.116b) or
// EF_GNSS_Places_Authentication (§2.79b). Match against a PlaceRecord's
// EntryTime or a GnssRecord's TimeStamp respectively.
type AuthStatusEntry struct {
	TimeStamp            time.Time `json:"time_stamp"`
	AuthenticationStatus string    `json:"authentication_status"`
}

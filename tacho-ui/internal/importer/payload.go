// Package importer parses a .ddd file via tachoparser and writes its contents
// into the SQLite store. Same file (same SHA256) imported twice is a no-op;
// the import returns AlreadyImported=true with the prior import's ID.
//
// Strategy:
//   1. Hash bytes → check imports.file_sha256 → short-circuit if exists.
//   2. Parse with tachoparser, marshal to JSON for storage in imports.raw_json
//      (gzipped) and as the source for our own parsing structs.
//   3. Open a transaction. Upsert driver + vehicles, insert/replace records
//      with INSERT OR REPLACE so re-importing a newer file from the same
//      driver wins for overlapping (driver, date) keys without dropping
//      historical rows from previous imports.
//   4. Commit.
package importer

// payload* structs mirror only the JSON fields we care about for ingestion.
// We deliberately don't depend on the tachoparser internal struct types,
// which are large and unstable across decoder versions — JSON is the contract.

type cardPayload struct {
	Identification1 *cardIdent `json:"card_identification_and_driver_card_holder_identification_1"`
	Identification2 *cardIdent `json:"card_identification_and_driver_card_holder_identification_2"`

	DriverActivity1 *driverActivity `json:"card_driver_activity_1"`
	DriverActivity2 *driverActivity `json:"card_driver_activity_2"`

	PlaceDailyWorkPeriod1 *placeData `json:"card_place_daily_work_period_1"`
	PlaceDailyWorkPeriod2 *placeData `json:"card_place_daily_work_period_2"`

	VehiclesUsed1 *vehiclesData `json:"card_vehicles_used_1"`
	VehiclesUsed2 *vehiclesData `json:"card_vehicles_used_2"`

	EventData1 *eventOrFaultData `json:"card_event_data_1"`
	EventData2 *eventOrFaultData `json:"card_event_data_2"`
	FaultData1 *eventOrFaultData `json:"card_fault_data_1"`
	FaultData2 *eventOrFaultData `json:"card_fault_data_2"`

	GnssAccumulated     *gnssData `json:"gnss_accumulated_driving"`
	GnssAuthAccumulated *gnssData `json:"gnss_auth_accumulated_driving"`
}

type cardIdent struct {
	CardIdentification             *cardIdentInner   `json:"card_identification"`
	DriverCardHolderIdentification *driverCardHolder `json:"driver_card_holder_identification"`
}

type cardIdentInner struct {
	CardIssuingMemberState int    `json:"card_issuing_member_state"`
	CardNumber             string `json:"card_number"`
	CardIssueDate          string `json:"card_issue_date"`
	CardExpiryDate         string `json:"card_expiry_date"`
}

type driverCardHolder struct {
	CardHolderName      *cardHolderName `json:"card_holder_name"`
	CardHolderBirthDate *birthDate      `json:"card_holder_birth_date"`
}

type cardHolderName struct {
	HolderSurname    string `json:"holder_surname"`
	HolderFirstNames string `json:"holder_first_names"`
}

type birthDate struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

type driverActivity struct {
	DecodedActivityDailyRecords []decodedDailyRecord `json:"decoded_activity_daily_records"`
}

type decodedDailyRecord struct {
	ActivityRecordDate  string                     `json:"activity_record_date"`
	ActivityDayDistance int                        `json:"activity_day_distance"`
	ActivityChangeInfo  []activityChangePersisted  `json:"activity_change_info"`
}

type activityChangePersisted struct {
	Driver      bool `json:"driver"`
	Team        bool `json:"team"`
	CardPresent bool `json:"card_present"`
	WorkType    int  `json:"work_type"`
	Minutes     int  `json:"minutes"`
}

type placeData struct {
	PlaceRecords []placeRecord `json:"place_records"`
}

type placeRecord struct {
	EntryTime                string `json:"entry_time"`
	EntryTypeDailyWorkPeriod int    `json:"entry_type_daily_work_period"`
	DailyWorkPeriodCountry   int    `json:"daily_work_period_country"`
	DailyWorkPeriodRegion    int    `json:"daily_work_period_region"`
	VehicleOdometerValue     int    `json:"vehicle_odometer_value"`
}

type vehiclesData struct {
	CardVehicleRecords []vehicleRecord `json:"card_vehicle_records"`
}

type vehicleRecord struct {
	VehicleOdometerBegin int                  `json:"vehicle_odometer_begin"`
	VehicleOdometerEnd   int                  `json:"vehicle_odometer_end"`
	VehicleFirstUse      string               `json:"vehicle_first_use"`
	VehicleLastUse       string               `json:"vehicle_last_use"`
	VehicleRegistration  *vehicleRegistration `json:"vehicle_registration"`
}

type vehicleRegistration struct {
	VehicleRegistrationNation int    `json:"vehicle_registration_nation"`
	VehicleRegistrationNumber string `json:"vehicle_registration_number"`
}

type eventOrFaultData struct {
	CardEventRecordsArray []eventOrFaultBucket `json:"card_event_records_array"`
	CardFaultRecordsArray []eventOrFaultBucket `json:"card_fault_records_array"`
}

type eventOrFaultBucket struct {
	CardEventRecords []eventOrFaultRecord `json:"card_event_records"`
	CardFaultRecords []eventOrFaultRecord `json:"card_fault_records"`
}

type eventOrFaultRecord struct {
	EventType                int                  `json:"event_type"`
	FaultType                int                  `json:"fault_type"`
	EventBeginTime           string               `json:"event_begin_time"`
	EventEndTime             string               `json:"event_end_time"`
	FaultBeginTime           string               `json:"fault_begin_time"`
	FaultEndTime             string               `json:"fault_end_time"`
	EventVehicleRegistration *vehicleRegistration `json:"event_vehicle_registration"`
	FaultVehicleRegistration *vehicleRegistration `json:"fault_vehicle_registration"`
}

type gnssData struct {
	GnssAccumulatedDrivingRecords     []gnssRecord `json:"gnss_accumulated_driving_records"`
	GnssAuthAccumulatedDrivingRecords []gnssRecord `json:"gnss_auth_accumulated_driving_records"`
}

type gnssRecord struct {
	TimeStamp            string          `json:"time_stamp"`
	GnssPlaceRecord      *gnssPlace      `json:"gnss_place_record"`
	VehicleOdometerValue int             `json:"vehicle_odometer_value"`
}

type gnssPlace struct {
	GeoCoordinates *geoCoordinates `json:"geo_coordinates"`
}

type geoCoordinates struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

package db

// JSON tags on these structs match the *consumed* shapes in the frontend
// (activity.ts, shifts.ts, events.ts, gnss.ts, vehicles.ts). The previous
// frontend `extract*` helpers ran a JSON-tree walk to produce these shapes;
// now the DB returns them directly and those helpers go away.
//
// Where the TS type used snake_case (DailyRecord, ActivityChange, PlaceRecord)
// because it was raw JSON output, the Go struct keeps snake_case so the TS
// types don't need touching. Where TS used camelCase (VehicleUsage, CardEvent,
// GnssPoint) because they were post-extract, the Go struct uses camelCase.

// DriverSummary is one row of the driver-list landing page.
type DriverSummary struct {
	CardNumber       string `json:"cardNumber"`
	Surname          string `json:"surname,omitempty"`
	FirstNames       string `json:"firstNames,omitempty"`
	IssuingState     int    `json:"issuingState"`
	FirstSeenAt      string `json:"firstSeenAt"`
	LastSeenAt       string `json:"lastSeenAt"`
	ImportCount      int    `json:"importCount"`
	DailyRecordCount int    `json:"dailyRecordCount"`
	FirstDate        string `json:"firstDate,omitempty"`
	LastDate         string `json:"lastDate,omitempty"`
}

// DriverProfile is the full identity record plus aggregates.
type DriverProfile struct {
	DriverSummary
	BirthDate      string `json:"birthDate,omitempty"`
	CardIssueDate  string `json:"cardIssueDate,omitempty"`
	CardExpiryDate string `json:"cardExpiryDate,omitempty"`
}

// ImportInfo describes one ingested file.
type ImportInfo struct {
	ID         int64  `json:"id"`
	Filename   string `json:"filename"`
	FileType   string `json:"fileType"`
	FileSHA256 string `json:"fileSha256"`
	ImportedAt string `json:"importedAt"`
	SizeBytes  int64  `json:"sizeBytes"`
}

// SignatureSummary mirrors ddd.SignatureSummary (plus the top-level
// Verified bool) for one imported card. Read via GetLatestSignatureSummary.
type SignatureSummary struct {
	Verified          bool             `json:"verified"`
	ChainValid        bool             `json:"chainValid"`
	VerifiedCount     int              `json:"verifiedCount"`
	FailedCount       int              `json:"failedCount"`
	UnverifiableCount int              `json:"unverifiableCount"`
	EFs               []EFSignatureRow `json:"efs"`
}

// EFSignatureRow is one per-EF result. Matches ddd.EFSignature on the
// wire, kept here so the frontend doesn't need a separate type binding.
type EFSignatureRow struct {
	FID        uint16 `json:"fid"`
	Generation int    `json:"generation"`
	Status     string `json:"status"`
	Reason     string `json:"reason,omitempty"`
}

// ActivityChange — snake_case retained (matches activity.ts ActivityChange).
type ActivityChange struct {
	Driver      bool `json:"driver"`
	Team        bool `json:"team"`
	CardPresent bool `json:"card_present"`
	WorkType    int  `json:"work_type"`
	Minutes     int  `json:"minutes"`
}

// DailyRecord — snake_case retained (matches activity.ts DailyRecord).
type DailyRecord struct {
	ActivityRecordDate  string           `json:"activity_record_date"`
	ActivityDayDistance int              `json:"activity_day_distance"`
	ActivityChangeInfo  []ActivityChange `json:"activity_change_info"`
}

// PlaceRecord — snake_case retained (matches shifts.ts PlaceRecord).
// `authentication_status` is "" on Gen1/Gen2v1 cards and populated on
// Gen2v2 cards from EF_Places_Authentication.
type PlaceRecord struct {
	EntryTime                string `json:"entry_time"`
	EntryTypeDailyWorkPeriod int    `json:"entry_type_daily_work_period"`
	DailyWorkPeriodCountry   int    `json:"daily_work_period_country"`
	DailyWorkPeriodRegion    int    `json:"daily_work_period_region"`
	VehicleOdometerValue     int    `json:"vehicle_odometer_value"`
	AuthenticationStatus     string `json:"authentication_status,omitempty"`
}

// GnssPoint — camelCase (matches gnss.ts GnssPoint).
// `authenticationStatus` is "" on Gen1/Gen2v1 cards and populated on
// Gen2v2 cards from EF_GNSS_Places_Authentication.
type GnssPoint struct {
	Timestamp            string  `json:"timestamp"`
	Latitude             float64 `json:"latitude"`
	Longitude            float64 `json:"longitude"`
	Odometer             int     `json:"odometer"`
	AuthenticationStatus string  `json:"authenticationStatus,omitempty"`
}

// BorderCrossing — one row of border_crossings, per 2021/1228 §2.11b.
// `countryLeft` / `countryEntered` are NationNumeric codes; `0xFF` (255)
// means "Rest of the World" (vehicle outside any country in the VU's
// stored digital maps).
type BorderCrossing struct {
	CrossedAt            string  `json:"crossedAt"`
	CountryLeft          int     `json:"countryLeft"`
	CountryEntered       int     `json:"countryEntered"`
	Latitude             float64 `json:"latitude"`
	Longitude            float64 `json:"longitude"`
	AuthenticationStatus string  `json:"authenticationStatus,omitempty"`
	Odometer             int     `json:"odometer"`
}

// LoadUnloadOp — one row of load_unload_ops, per 2021/1228 §2.24d.
type LoadUnloadOp struct {
	OperationAt          string  `json:"operationAt"`
	OperationType        string  `json:"operationType"` // load / unload / simultaneous / unknown
	Latitude             float64 `json:"latitude"`
	Longitude            float64 `json:"longitude"`
	AuthenticationStatus string  `json:"authenticationStatus,omitempty"`
	Odometer             int     `json:"odometer"`
}

// LoadTypeEntry — one row of load_type_entries, per 2021/1228 §2.24b.
type LoadTypeEntry struct {
	EnteredAt string `json:"enteredAt"`
	LoadType  string `json:"loadType"` // undefined / goods / passengers / unknown
}

// CardEvent — camelCase (matches events.ts CardEvent).
type CardEvent struct {
	Kind                string `json:"kind"` // "event" or "fault"
	Type                int    `json:"type"`
	Begin               string `json:"begin"`
	End                 string `json:"end"`
	VehicleRegistration string `json:"vehicleRegistration"`
	VehicleNation       int    `json:"vehicleNation"`
}

// DriverVehicle — camelCase (matches vehicles.ts VehicleUsage).
type DriverVehicle struct {
	FirstUse     string `json:"firstUse"`
	LastUse      string `json:"lastUse"`
	Registration string `json:"registration"`
	Nation       int    `json:"nation"`
	OdoBegin     int    `json:"odoBegin"`
	OdoEnd       int    `json:"odoEnd"`
}

// ImportResult is returned from the ImportDDD* bound methods.
type ImportResult struct {
	ImportID         int64          `json:"importId"`
	FileType         string         `json:"fileType"`
	DriverCardNumber string         `json:"driverCardNumber,omitempty"`
	AlreadyImported  bool           `json:"alreadyImported"`
	Filename         string         `json:"filename"`
	Counts           map[string]int `json:"counts"`
}

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
type PlaceRecord struct {
	EntryTime                string `json:"entry_time"`
	EntryTypeDailyWorkPeriod int    `json:"entry_type_daily_work_period"`
	DailyWorkPeriodCountry   int    `json:"daily_work_period_country"`
	DailyWorkPeriodRegion    int    `json:"daily_work_period_region"`
	VehicleOdometerValue     int    `json:"vehicle_odometer_value"`
}

// GnssPoint — camelCase (matches gnss.ts GnssPoint).
type GnssPoint struct {
	Timestamp string  `json:"timestamp"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Odometer  int     `json:"odometer"`
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

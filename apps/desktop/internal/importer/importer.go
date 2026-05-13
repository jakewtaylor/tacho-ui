package importer

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/traconiq/tachoparser/pkg/decoder"

	"tacho-ui/internal/db"
)

// FileType discriminates between driver-card and vehicle-unit data.
type FileType string

const (
	FileCard FileType = "card"
	FileVU   FileType = "vu"
)

// ImportCard parses a driver-card .ddd and persists its contents. Returns
// AlreadyImported=true (with the prior import's ID + driver) when the same
// SHA256 has been seen before.
func ImportCard(ctx context.Context, store *db.DB, filename string, data []byte) (*db.ImportResult, error) {
	hashHex := hashBytes(data)

	// Short-circuit on duplicate.
	if existing, driver, found, err := findImportByHash(ctx, store, hashHex); err != nil {
		return nil, err
	} else if found {
		return &db.ImportResult{
			ImportID:         existing,
			FileType:         string(FileCard),
			DriverCardNumber: driver,
			AlreadyImported:  true,
			Filename:         filename,
			Counts:           map[string]int{},
		}, nil
	}

	// Parse via tachoparser.
	var c decoder.Card
	if _, err := decoder.UnmarshalTLV(data, &c); err != nil {
		return nil, fmt.Errorf("decode card TLV: %w", err)
	}

	// Re-marshal to JSON so we can both store a blob and re-parse into our
	// internal shape (which is a subset of the decoder's enormous struct).
	rawJSON, err := json.Marshal(c)
	if err != nil {
		return nil, fmt.Errorf("marshal decoded card to json: %w", err)
	}
	var p cardPayload
	if err := json.Unmarshal(rawJSON, &p); err != nil {
		return nil, fmt.Errorf("unmarshal card payload: %w", err)
	}

	ident := p.Identification1
	if ident == nil || ident.CardIdentification == nil || ident.CardIdentification.CardNumber == "" {
		ident = p.Identification2
	}
	if ident == nil || ident.CardIdentification == nil || ident.CardIdentification.CardNumber == "" {
		return nil, fmt.Errorf("card has no identification record")
	}
	cardNumber := ident.CardIdentification.CardNumber

	tx, err := store.Conn().BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC().Format(time.RFC3339)

	if err := upsertDriver(ctx, tx, ident, now); err != nil {
		return nil, err
	}

	res, err := tx.ExecContext(ctx, `
        INSERT INTO imports (filename, file_type, file_sha256, driver_card_number, imported_at, size_bytes)
        VALUES (?, 'card', ?, ?, ?, ?)`,
		filename, hashHex, cardNumber, now, int64(len(data)),
	)
	if err != nil {
		return nil, fmt.Errorf("insert import: %w", err)
	}
	importID, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("last insert id: %w", err)
	}

	counts := map[string]int{}

	if n, err := insertDailyRecords(ctx, tx, cardNumber, importID, &p); err != nil {
		return nil, err
	} else {
		counts["daily_records"] = n
	}
	if n, err := insertPlaceRecords(ctx, tx, cardNumber, importID, &p); err != nil {
		return nil, err
	} else {
		counts["place_records"] = n
	}
	if n, err := insertVehicles(ctx, tx, cardNumber, importID, &p, now); err != nil {
		return nil, err
	} else {
		counts["driver_vehicles"] = n
	}
	if n, err := insertGnssPoints(ctx, tx, cardNumber, importID, &p); err != nil {
		return nil, err
	} else {
		counts["gnss_points"] = n
	}
	if n, err := insertEventsFaults(ctx, tx, cardNumber, importID, &p); err != nil {
		return nil, err
	} else {
		counts["events_faults"] = n
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}

	return &db.ImportResult{
		ImportID:         importID,
		FileType:         string(FileCard),
		DriverCardNumber: cardNumber,
		AlreadyImported:  false,
		Filename:         filename,
		Counts:           counts,
	}, nil
}

// LooksLikeCard heuristically detects a card file from its filename. Cards
// are written by readers with a "C_" prefix; VU dumps use "M_" / others.
func LooksLikeCard(filename string) bool {
	upper := strings.ToUpper(filename)
	return strings.HasPrefix(upper, "C_")
}

func hashBytes(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func findImportByHash(ctx context.Context, store *db.DB, hashHex string) (int64, string, bool, error) {
	var id int64
	var driver sql.NullString
	err := store.Conn().QueryRowContext(ctx,
		`SELECT id, driver_card_number FROM imports WHERE file_sha256 = ?`, hashHex,
	).Scan(&id, &driver)
	if err == sql.ErrNoRows {
		return 0, "", false, nil
	}
	if err != nil {
		return 0, "", false, fmt.Errorf("check import by hash: %w", err)
	}
	return id, driver.String, true, nil
}

func upsertDriver(ctx context.Context, tx *sql.Tx, ident *cardIdent, now string) error {
	ci := ident.CardIdentification
	name := ident.DriverCardHolderIdentification
	var surname, firstNames, birth string
	if name != nil {
		if name.CardHolderName != nil {
			surname = name.CardHolderName.HolderSurname
			firstNames = name.CardHolderName.HolderFirstNames
		}
		if name.CardHolderBirthDate != nil && name.CardHolderBirthDate.Year > 0 {
			birth = fmt.Sprintf("%04d-%02d-%02d",
				name.CardHolderBirthDate.Year,
				name.CardHolderBirthDate.Month,
				name.CardHolderBirthDate.Day)
		}
	}

	// INSERT OR IGNORE then UPDATE: keep first_seen_at stable but refresh
	// the rest of the identity columns and bump last_seen_at on every import.
	_, err := tx.ExecContext(ctx, `
        INSERT INTO drivers (card_number, surname, first_names, birth_date,
                             issuing_state, card_issue_date, card_expiry_date,
                             first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(card_number) DO UPDATE SET
            surname = COALESCE(NULLIF(excluded.surname, ''), drivers.surname),
            first_names = COALESCE(NULLIF(excluded.first_names, ''), drivers.first_names),
            birth_date = COALESCE(NULLIF(excluded.birth_date, ''), drivers.birth_date),
            issuing_state = COALESCE(NULLIF(excluded.issuing_state, 0), drivers.issuing_state),
            card_issue_date = COALESCE(NULLIF(excluded.card_issue_date, ''), drivers.card_issue_date),
            card_expiry_date = COALESCE(NULLIF(excluded.card_expiry_date, ''), drivers.card_expiry_date),
            last_seen_at = excluded.last_seen_at`,
		ci.CardNumber, surname, firstNames, birth,
		ci.CardIssuingMemberState, ci.CardIssueDate, ci.CardExpiryDate,
		now, now,
	)
	if err != nil {
		return fmt.Errorf("upsert driver: %w", err)
	}
	return nil
}

func insertDailyRecords(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, p *cardPayload) (int, error) {
	records := preferredDailyRecords(p)
	if len(records) == 0 {
		return 0, nil
	}
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO daily_records
            (driver_card_number, date, distance_km, activity_change_info_json, source_import_id)
        VALUES (?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare daily_records insert: %w", err)
	}
	defer stmt.Close()
	n := 0
	for _, r := range records {
		if r.ActivityRecordDate == "" || strings.HasPrefix(r.ActivityRecordDate, "0001") {
			continue
		}
		date := r.ActivityRecordDate[:10]
		body, err := json.Marshal(r.ActivityChangeInfo)
		if err != nil {
			return n, fmt.Errorf("marshal activity_change_info for %s: %w", date, err)
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, date, r.ActivityDayDistance, string(body), importID); err != nil {
			return n, fmt.Errorf("insert daily_records for %s: %w", date, err)
		}
		n++
	}
	return n, nil
}

// preferredDailyRecords mirrors the frontend's "prefer Gen1, fall back to Gen2"
// rule so the DB doesn't accidentally store the shorter buffer for a card that
// has both.
func preferredDailyRecords(p *cardPayload) []decodedDailyRecord {
	if p.DriverActivity1 != nil && len(p.DriverActivity1.DecodedActivityDailyRecords) > 0 {
		return p.DriverActivity1.DecodedActivityDailyRecords
	}
	if p.DriverActivity2 != nil {
		return p.DriverActivity2.DecodedActivityDailyRecords
	}
	return nil
}

func insertPlaceRecords(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, p *cardPayload) (int, error) {
	var records []placeRecord
	if p.PlaceDailyWorkPeriod1 != nil {
		records = append(records, p.PlaceDailyWorkPeriod1.PlaceRecords...)
	}
	if p.PlaceDailyWorkPeriod2 != nil {
		records = append(records, p.PlaceDailyWorkPeriod2.PlaceRecords...)
	}
	if len(records) == 0 {
		return 0, nil
	}
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO place_records
            (driver_card_number, entry_time, entry_type, country, region, odometer, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare place_records insert: %w", err)
	}
	defer stmt.Close()
	n := 0
	for _, r := range records {
		if r.EntryTime == "" || strings.HasPrefix(r.EntryTime, "0001") {
			continue
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.EntryTime, r.EntryTypeDailyWorkPeriod,
			r.DailyWorkPeriodCountry, r.DailyWorkPeriodRegion, r.VehicleOdometerValue, importID); err != nil {
			return n, fmt.Errorf("insert place_record %s/%d: %w", r.EntryTime, r.EntryTypeDailyWorkPeriod, err)
		}
		n++
	}
	return n, nil
}

func insertVehicles(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, p *cardPayload, now string) (int, error) {
	var records []vehicleRecord
	if p.VehiclesUsed1 != nil && len(p.VehiclesUsed1.CardVehicleRecords) > 0 {
		records = p.VehiclesUsed1.CardVehicleRecords
	} else if p.VehiclesUsed2 != nil {
		records = p.VehiclesUsed2.CardVehicleRecords
	}
	if len(records) == 0 {
		return 0, nil
	}

	vehicleStmt, err := tx.PrepareContext(ctx, `
        INSERT INTO vehicles (registration, registration_nation, first_seen_at, last_seen_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(registration, registration_nation) DO UPDATE SET
            last_seen_at = excluded.last_seen_at`)
	if err != nil {
		return 0, fmt.Errorf("prepare vehicles upsert: %w", err)
	}
	defer vehicleStmt.Close()

	usageStmt, err := tx.PrepareContext(ctx, `
        INSERT INTO driver_vehicles
            (driver_card_number, registration, registration_nation,
             first_use_at, last_use_at, first_use_odometer, last_use_odometer, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare driver_vehicles insert: %w", err)
	}
	defer usageStmt.Close()

	n := 0
	for _, r := range records {
		if r.VehicleRegistration == nil || r.VehicleRegistration.VehicleRegistrationNumber == "" {
			continue
		}
		if r.VehicleFirstUse == "" || strings.HasPrefix(r.VehicleFirstUse, "0001") {
			continue
		}
		reg := r.VehicleRegistration.VehicleRegistrationNumber
		nation := r.VehicleRegistration.VehicleRegistrationNation
		lastUse := r.VehicleLastUse
		if lastUse == "" {
			lastUse = r.VehicleFirstUse
		}
		if _, err := vehicleStmt.ExecContext(ctx, reg, nation, now, now); err != nil {
			return n, fmt.Errorf("upsert vehicle %s: %w", reg, err)
		}
		if _, err := usageStmt.ExecContext(ctx, cardNumber, reg, nation,
			r.VehicleFirstUse, lastUse, r.VehicleOdometerBegin, r.VehicleOdometerEnd, importID); err != nil {
			return n, fmt.Errorf("insert driver_vehicles row for %s: %w", reg, err)
		}
		n++
	}
	return n, nil
}

func insertGnssPoints(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, p *cardPayload) (int, error) {
	var records []gnssRecord
	if p.GnssAccumulated != nil {
		records = append(records, p.GnssAccumulated.GnssAccumulatedDrivingRecords...)
	}
	if p.GnssAuthAccumulated != nil {
		records = append(records, p.GnssAuthAccumulated.GnssAuthAccumulatedDrivingRecords...)
	}
	if len(records) == 0 {
		return 0, nil
	}

	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO gnss_points
            (driver_card_number, timestamp, latitude, longitude, odometer, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare gnss_points insert: %w", err)
	}
	defer stmt.Close()

	n := 0
	for _, r := range records {
		if r.TimeStamp == "" || strings.HasPrefix(r.TimeStamp, "0001") {
			continue
		}
		if r.GnssPlaceRecord == nil || r.GnssPlaceRecord.GeoCoordinates == nil {
			continue
		}
		c := r.GnssPlaceRecord.GeoCoordinates
		// Skip placeholder "no-fix" points.
		if c.Latitude == 0 && c.Longitude == 0 {
			continue
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.TimeStamp, c.Latitude, c.Longitude, r.VehicleOdometerValue, importID); err != nil {
			return n, fmt.Errorf("insert gnss_point %s: %w", r.TimeStamp, err)
		}
		n++
	}
	return n, nil
}

func insertEventsFaults(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, p *cardPayload) (int, error) {
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO events_faults
            (driver_card_number, kind, event_type, begin_time, end_time, vehicle_registration, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare events_faults insert: %w", err)
	}
	defer stmt.Close()

	n := 0
	// Events: card_event_data_{1,2}.card_event_records_array[*].card_event_records[*]
	for _, src := range []*eventOrFaultData{p.EventData1, p.EventData2} {
		if src == nil {
			continue
		}
		for _, bucket := range src.CardEventRecordsArray {
			for _, e := range bucket.CardEventRecords {
				if e.EventBeginTime == "" || strings.HasPrefix(e.EventBeginTime, "0001") {
					continue
				}
				reg := ""
				if e.EventVehicleRegistration != nil {
					reg = e.EventVehicleRegistration.VehicleRegistrationNumber
				}
				if _, err := stmt.ExecContext(ctx, cardNumber, "event", e.EventType,
					e.EventBeginTime, nullable(e.EventEndTime), nullable(reg), importID); err != nil {
					return n, fmt.Errorf("insert event %d@%s: %w", e.EventType, e.EventBeginTime, err)
				}
				n++
			}
		}
	}
	// Faults: card_fault_data_{1,2}.card_fault_records_array[*].card_fault_records[*]
	for _, src := range []*eventOrFaultData{p.FaultData1, p.FaultData2} {
		if src == nil {
			continue
		}
		for _, bucket := range src.CardFaultRecordsArray {
			for _, f := range bucket.CardFaultRecords {
				if f.FaultBeginTime == "" || strings.HasPrefix(f.FaultBeginTime, "0001") {
					continue
				}
				reg := ""
				if f.FaultVehicleRegistration != nil {
					reg = f.FaultVehicleRegistration.VehicleRegistrationNumber
				}
				if _, err := stmt.ExecContext(ctx, cardNumber, "fault", f.FaultType,
					f.FaultBeginTime, nullable(f.FaultEndTime), nullable(reg), importID); err != nil {
					return n, fmt.Errorf("insert fault %d@%s: %w", f.FaultType, f.FaultBeginTime, err)
				}
				n++
			}
		}
	}
	return n, nil
}

func nullable(s string) any {
	if s == "" || strings.HasPrefix(s, "0001") {
		return nil
	}
	return s
}

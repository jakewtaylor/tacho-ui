// Package importer parses a .ddd file via the in-house go-ddd parser
// and writes its contents into the SQLite store. Same file (same SHA256)
// imported twice is a no-op; the import returns AlreadyImported=true
// with the prior import's ID.
//
// Strategy:
//   1. Hash bytes → check imports.file_sha256 → short-circuit if exists.
//   2. Parse with ddd.ParseCard. The result is a typed ddd.Card that
//      matches the shape of the dropped local "payload" types, so the
//      ingestion code below consumes it directly without a JSON
//      round-trip.
//   3. Open a transaction. Upsert driver + vehicles, insert/replace
//      records with INSERT OR REPLACE so re-importing a newer file from
//      the same driver wins for overlapping (driver, date) keys without
//      dropping historical rows from previous imports.
//   4. Commit.
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

	ddd "github.com/jakewtaylor/go-ddd"

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

	card, err := ddd.ParseCard(data)
	if err != nil {
		return nil, fmt.Errorf("decode card: %w", err)
	}

	ident := card.Identification1
	if !hasUsableIdent(ident) {
		ident = card.Identification2
	}
	if !hasUsableIdent(ident) {
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

	if n, err := insertDailyRecords(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["daily_records"] = n
	}
	if n, err := insertPlaceRecords(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["place_records"] = n
	}
	if n, err := insertVehicles(ctx, tx, cardNumber, importID, card, now); err != nil {
		return nil, err
	} else {
		counts["driver_vehicles"] = n
	}
	if n, err := insertGnssPoints(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["gnss_points"] = n
	}
	if n, err := insertEventsFaults(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["events_faults"] = n
	}
	if n, err := insertBorderCrossings(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["border_crossings"] = n
	}
	if n, err := insertLoadUnload(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["load_unload_ops"] = n
	}
	if n, err := insertLoadTypes(ctx, tx, cardNumber, importID, card); err != nil {
		return nil, err
	} else {
		counts["load_type_entries"] = n
	}
	if err := backfillAuthStatus(ctx, tx, cardNumber, card); err != nil {
		return nil, err
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

// hasUsableIdent guards the nested CardIdent pointer chain we'd
// otherwise have to inline at every call site.
func hasUsableIdent(ident *ddd.CardIdent) bool {
	return ident != nil &&
		ident.CardIdentification != nil &&
		ident.CardIdentification.CardNumber != ""
}

func upsertDriver(ctx context.Context, tx *sql.Tx, ident *ddd.CardIdent, now string) error {
	ci := ident.CardIdentification
	holder := ident.DriverCardHolderIdentification
	var surname, firstNames, birth string
	if holder != nil {
		if holder.CardHolderName != nil {
			surname = holder.CardHolderName.HolderSurname
			firstNames = holder.CardHolderName.HolderFirstNames
		}
		if holder.CardHolderBirthDate != nil && holder.CardHolderBirthDate.Year > 0 {
			birth = fmt.Sprintf("%04d-%02d-%02d",
				holder.CardHolderBirthDate.Year,
				holder.CardHolderBirthDate.Month,
				holder.CardHolderBirthDate.Day)
		}
	}

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
		ci.CardIssuingMemberState, formatTime(ci.CardIssueDate), formatTime(ci.CardExpiryDate),
		now, now,
	)
	if err != nil {
		return fmt.Errorf("upsert driver: %w", err)
	}
	return nil
}

func insertDailyRecords(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	records := preferredDailyRecords(c)
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
		if r.ActivityRecordDate.IsZero() {
			continue
		}
		date := r.ActivityRecordDate.Format("2006-01-02")
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

// preferredDailyRecords mirrors the frontend's "prefer Gen1, fall back to
// Gen2" rule so the DB doesn't accidentally store the shorter buffer for
// a card that has both.
func preferredDailyRecords(c *ddd.Card) []ddd.DecodedDailyRecord {
	if c.DriverActivity1 != nil && len(c.DriverActivity1.DecodedActivityDailyRecords) > 0 {
		return c.DriverActivity1.DecodedActivityDailyRecords
	}
	if c.DriverActivity2 != nil {
		return c.DriverActivity2.DecodedActivityDailyRecords
	}
	return nil
}

func insertPlaceRecords(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	var records []ddd.PlaceRecord
	if c.PlaceDailyWorkPeriod1 != nil {
		records = append(records, c.PlaceDailyWorkPeriod1.PlaceRecords...)
	}
	if c.PlaceDailyWorkPeriod2 != nil {
		records = append(records, c.PlaceDailyWorkPeriod2.PlaceRecords...)
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
		if r.EntryTime.IsZero() {
			continue
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.EntryTime.Format(time.RFC3339), r.EntryTypeDailyWorkPeriod,
			r.DailyWorkPeriodCountry, r.DailyWorkPeriodRegion, r.VehicleOdometerValue, importID); err != nil {
			return n, fmt.Errorf("insert place_record %s/%d: %w", r.EntryTime, r.EntryTypeDailyWorkPeriod, err)
		}
		n++
	}
	return n, nil
}

func insertVehicles(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card, now string) (int, error) {
	var records []ddd.VehicleRecord
	if c.VehiclesUsed1 != nil && len(c.VehiclesUsed1.CardVehicleRecords) > 0 {
		records = c.VehiclesUsed1.CardVehicleRecords
	} else if c.VehiclesUsed2 != nil {
		records = c.VehiclesUsed2.CardVehicleRecords
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
		if r.VehicleFirstUse.IsZero() {
			continue
		}
		reg := r.VehicleRegistration.VehicleRegistrationNumber
		nation := r.VehicleRegistration.VehicleRegistrationNation
		lastUse := r.VehicleLastUse
		if lastUse.IsZero() {
			lastUse = r.VehicleFirstUse
		}
		if _, err := vehicleStmt.ExecContext(ctx, reg, nation, now, now); err != nil {
			return n, fmt.Errorf("upsert vehicle %s: %w", reg, err)
		}
		if _, err := usageStmt.ExecContext(ctx, cardNumber, reg, nation,
			r.VehicleFirstUse.Format(time.RFC3339), lastUse.Format(time.RFC3339),
			r.VehicleOdometerBegin, r.VehicleOdometerEnd, importID); err != nil {
			return n, fmt.Errorf("insert driver_vehicles row for %s: %w", reg, err)
		}
		n++
	}
	return n, nil
}

func insertGnssPoints(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	var records []ddd.GnssRecord
	if c.GnssAccumulated != nil {
		records = append(records, c.GnssAccumulated.GnssAccumulatedDrivingRecords...)
	}
	if c.GnssAuthAccumulated != nil {
		records = append(records, c.GnssAuthAccumulated.GnssAuthAccumulatedDrivingRecords...)
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
		if r.TimeStamp.IsZero() {
			continue
		}
		if r.GnssPlaceRecord == nil || r.GnssPlaceRecord.GeoCoordinates == nil {
			continue
		}
		coords := r.GnssPlaceRecord.GeoCoordinates
		if coords.Latitude == 0 && coords.Longitude == 0 {
			continue
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.TimeStamp.Format(time.RFC3339),
			coords.Latitude, coords.Longitude, r.VehicleOdometerValue, importID); err != nil {
			return n, fmt.Errorf("insert gnss_point %s: %w", r.TimeStamp, err)
		}
		n++
	}
	return n, nil
}

func insertEventsFaults(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO events_faults
            (driver_card_number, kind, event_type, begin_time, end_time, vehicle_registration, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare events_faults insert: %w", err)
	}
	defer stmt.Close()

	n := 0
	for _, src := range []*ddd.EventOrFaultData{c.EventData1, c.EventData2} {
		if src == nil {
			continue
		}
		for _, bucket := range src.CardEventRecordsArray {
			for _, e := range bucket.CardEventRecords {
				if e.EventBeginTime.IsZero() {
					continue
				}
				reg := ""
				if e.EventVehicleRegistration != nil {
					reg = e.EventVehicleRegistration.VehicleRegistrationNumber
				}
				if _, err := stmt.ExecContext(ctx, cardNumber, "event", e.EventType,
					e.EventBeginTime.Format(time.RFC3339), nullableTime(e.EventEndTime), nullableString(reg), importID); err != nil {
					return n, fmt.Errorf("insert event %d@%s: %w", e.EventType, e.EventBeginTime, err)
				}
				n++
			}
		}
	}
	for _, src := range []*ddd.EventOrFaultData{c.FaultData1, c.FaultData2} {
		if src == nil {
			continue
		}
		for _, bucket := range src.CardFaultRecordsArray {
			for _, f := range bucket.CardFaultRecords {
				if f.FaultBeginTime.IsZero() {
					continue
				}
				reg := ""
				if f.FaultVehicleRegistration != nil {
					reg = f.FaultVehicleRegistration.VehicleRegistrationNumber
				}
				if _, err := stmt.ExecContext(ctx, cardNumber, "fault", f.FaultType,
					f.FaultBeginTime.Format(time.RFC3339), nullableTime(f.FaultEndTime), nullableString(reg), importID); err != nil {
					return n, fmt.Errorf("insert fault %d@%s: %w", f.FaultType, f.FaultBeginTime, err)
				}
				n++
			}
		}
	}
	return n, nil
}

func insertBorderCrossings(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	if c.BorderCrossings == nil || len(c.BorderCrossings.CardBorderCrossingRecords) == 0 {
		return 0, nil
	}
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO border_crossings
            (driver_card_number, crossed_at, country_left, country_entered,
             latitude, longitude, authentication_status, odometer, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare border_crossings insert: %w", err)
	}
	defer stmt.Close()
	n := 0
	for _, r := range c.BorderCrossings.CardBorderCrossingRecords {
		if r.TimeStamp.IsZero() {
			continue
		}
		var lat, lng any
		if r.GeoCoordinates != nil {
			lat = r.GeoCoordinates.Latitude
			lng = r.GeoCoordinates.Longitude
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.TimeStamp.Format(time.RFC3339),
			r.CountryLeft, r.CountryEntered, lat, lng, r.AuthenticationStatus, r.VehicleOdometerValue, importID); err != nil {
			return n, fmt.Errorf("insert border_crossing %s: %w", r.TimeStamp, err)
		}
		n++
	}
	return n, nil
}

func insertLoadUnload(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	if c.LoadUnloadOps == nil || len(c.LoadUnloadOps.CardLoadUnloadRecords) == 0 {
		return 0, nil
	}
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO load_unload_ops
            (driver_card_number, operation_at, operation_type,
             latitude, longitude, authentication_status, odometer, source_import_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare load_unload_ops insert: %w", err)
	}
	defer stmt.Close()
	n := 0
	for _, r := range c.LoadUnloadOps.CardLoadUnloadRecords {
		if r.TimeStamp.IsZero() {
			continue
		}
		var lat, lng any
		if r.GeoCoordinates != nil {
			lat = r.GeoCoordinates.Latitude
			lng = r.GeoCoordinates.Longitude
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.TimeStamp.Format(time.RFC3339),
			r.OperationType, lat, lng, r.AuthenticationStatus, r.VehicleOdometerValue, importID); err != nil {
			return n, fmt.Errorf("insert load_unload_op %s: %w", r.TimeStamp, err)
		}
		n++
	}
	return n, nil
}

func insertLoadTypes(ctx context.Context, tx *sql.Tx, cardNumber string, importID int64, c *ddd.Card) (int, error) {
	if c.LoadTypeEntries == nil || len(c.LoadTypeEntries.CardLoadTypeEntryRecords) == 0 {
		return 0, nil
	}
	stmt, err := tx.PrepareContext(ctx, `
        INSERT OR REPLACE INTO load_type_entries
            (driver_card_number, entered_at, load_type, source_import_id)
        VALUES (?, ?, ?, ?)`)
	if err != nil {
		return 0, fmt.Errorf("prepare load_type_entries insert: %w", err)
	}
	defer stmt.Close()
	n := 0
	for _, r := range c.LoadTypeEntries.CardLoadTypeEntryRecords {
		if r.TimeStamp.IsZero() {
			continue
		}
		if _, err := stmt.ExecContext(ctx, cardNumber, r.TimeStamp.Format(time.RFC3339),
			r.LoadType, importID); err != nil {
			return n, fmt.Errorf("insert load_type_entry %s: %w", r.TimeStamp, err)
		}
		n++
	}
	return n, nil
}

// backfillAuthStatus joins EF_Places_Authentication and
// EF_GNSS_Places_Authentication side-records back onto the matching rows
// in place_records and gnss_points. Per 2021/1228 §664, an auth entry
// with no matching timestamp on the data side is ignored.
func backfillAuthStatus(ctx context.Context, tx *sql.Tx, cardNumber string, c *ddd.Card) error {
	if len(c.PlacesAuthStatus) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
            UPDATE place_records SET authentication_status = ?
            WHERE driver_card_number = ? AND entry_time = ?`)
		if err != nil {
			return fmt.Errorf("prepare place_records auth update: %w", err)
		}
		for _, a := range c.PlacesAuthStatus {
			if a.TimeStamp.IsZero() {
				continue
			}
			if _, err := stmt.ExecContext(ctx, a.AuthenticationStatus, cardNumber,
				a.TimeStamp.Format(time.RFC3339)); err != nil {
				stmt.Close()
				return fmt.Errorf("update place auth %s: %w", a.TimeStamp, err)
			}
		}
		stmt.Close()
	}
	if len(c.GnssPlacesAuthStatus) > 0 {
		stmt, err := tx.PrepareContext(ctx, `
            UPDATE gnss_points SET authentication_status = ?
            WHERE driver_card_number = ? AND timestamp = ?`)
		if err != nil {
			return fmt.Errorf("prepare gnss_points auth update: %w", err)
		}
		for _, a := range c.GnssPlacesAuthStatus {
			if a.TimeStamp.IsZero() {
				continue
			}
			if _, err := stmt.ExecContext(ctx, a.AuthenticationStatus, cardNumber,
				a.TimeStamp.Format(time.RFC3339)); err != nil {
				stmt.Close()
				return fmt.Errorf("update gnss auth %s: %w", a.TimeStamp, err)
			}
		}
		stmt.Close()
	}
	return nil
}

func formatTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format(time.RFC3339)
}

func nullableTime(t time.Time) any {
	if t.IsZero() {
		return nil
	}
	return t.Format(time.RFC3339)
}

func nullableString(s string) any {
	if s == "" {
		return nil
	}
	return s
}

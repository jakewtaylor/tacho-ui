package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// ListDrivers returns one row per known driver with aggregate counts.
// Sorted by most recently seen first.
func (d *DB) ListDrivers(ctx context.Context) ([]DriverSummary, error) {
	const q = `
        SELECT
            d.card_number, d.surname, d.first_names, d.issuing_state,
            d.first_seen_at, d.last_seen_at,
            (SELECT COUNT(*) FROM imports i WHERE i.driver_card_number = d.card_number) AS import_count,
            COALESCE(s.day_count, 0)  AS daily_record_count,
            COALESCE(s.first_date, '') AS first_date,
            COALESCE(s.last_date, '')  AS last_date
        FROM drivers d
        LEFT JOIN (
            SELECT driver_card_number,
                   COUNT(*) AS day_count,
                   MIN(date) AS first_date,
                   MAX(date) AS last_date
            FROM daily_records
            GROUP BY driver_card_number
        ) s ON s.driver_card_number = d.card_number
        ORDER BY d.last_seen_at DESC`
	rows, err := d.conn.QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("list drivers: %w", err)
	}
	defer rows.Close()

	var out []DriverSummary
	for rows.Next() {
		var s DriverSummary
		var surname, firstNames sql.NullString
		var issuingState sql.NullInt64
		if err := rows.Scan(
			&s.CardNumber, &surname, &firstNames, &issuingState,
			&s.FirstSeenAt, &s.LastSeenAt,
			&s.ImportCount, &s.DailyRecordCount, &s.FirstDate, &s.LastDate,
		); err != nil {
			return nil, fmt.Errorf("scan driver row: %w", err)
		}
		s.Surname = surname.String
		s.FirstNames = firstNames.String
		s.IssuingState = int(issuingState.Int64)
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetDriverProfile returns the full identity record plus aggregates for one driver.
func (d *DB) GetDriverProfile(ctx context.Context, cardNumber string) (*DriverProfile, error) {
	const q = `
        SELECT
            d.card_number, d.surname, d.first_names, d.birth_date,
            d.issuing_state, d.card_issue_date, d.card_expiry_date,
            d.first_seen_at, d.last_seen_at,
            (SELECT COUNT(*) FROM imports i WHERE i.driver_card_number = d.card_number) AS import_count,
            COALESCE(s.day_count, 0), COALESCE(s.first_date, ''), COALESCE(s.last_date, '')
        FROM drivers d
        LEFT JOIN (
            SELECT driver_card_number, COUNT(*) AS day_count,
                   MIN(date) AS first_date, MAX(date) AS last_date
            FROM daily_records GROUP BY driver_card_number
        ) s ON s.driver_card_number = d.card_number
        WHERE d.card_number = ?`
	var p DriverProfile
	var surname, firstNames, birthDate, issueDate, expiryDate sql.NullString
	var issuingState sql.NullInt64
	err := d.conn.QueryRowContext(ctx, q, cardNumber).Scan(
		&p.CardNumber, &surname, &firstNames, &birthDate,
		&issuingState, &issueDate, &expiryDate,
		&p.FirstSeenAt, &p.LastSeenAt,
		&p.ImportCount, &p.DailyRecordCount, &p.FirstDate, &p.LastDate,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get driver profile: %w", err)
	}
	p.Surname = surname.String
	p.FirstNames = firstNames.String
	p.BirthDate = birthDate.String
	p.IssuingState = int(issuingState.Int64)
	p.CardIssueDate = issueDate.String
	p.CardExpiryDate = expiryDate.String
	return &p, nil
}

// ListImports returns imports for one driver, newest first.
func (d *DB) ListImports(ctx context.Context, cardNumber string) ([]ImportInfo, error) {
	const q = `
        SELECT id, filename, file_type, file_sha256, imported_at, size_bytes
        FROM imports
        WHERE driver_card_number = ?
        ORDER BY imported_at DESC`
	rows, err := d.conn.QueryContext(ctx, q, cardNumber)
	if err != nil {
		return nil, fmt.Errorf("list imports: %w", err)
	}
	defer rows.Close()
	var out []ImportInfo
	for rows.Next() {
		var i ImportInfo
		if err := rows.Scan(&i.ID, &i.Filename, &i.FileType, &i.FileSHA256, &i.ImportedAt, &i.SizeBytes); err != nil {
			return nil, fmt.Errorf("scan import row: %w", err)
		}
		out = append(out, i)
	}
	return out, rows.Err()
}

// DeleteImport removes an import and (via FK cascade) all rows sourced from it.
// Returns true when a row was actually deleted.
func (d *DB) DeleteImport(ctx context.Context, importID int64) (bool, error) {
	res, err := d.conn.ExecContext(ctx, `DELETE FROM imports WHERE id = ?`, importID)
	if err != nil {
		return false, fmt.Errorf("delete import: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// GetDailyRecords returns activity records for one driver in chronological-
// descending order (newest first — matches the existing frontend assumption).
func (d *DB) GetDailyRecords(ctx context.Context, cardNumber string) ([]DailyRecord, error) {
	const q = `
        SELECT date, distance_km, activity_change_info_json
        FROM daily_records
        WHERE driver_card_number = ?
        ORDER BY date DESC`
	rows, err := d.conn.QueryContext(ctx, q, cardNumber)
	if err != nil {
		return nil, fmt.Errorf("get daily records: %w", err)
	}
	defer rows.Close()
	var out []DailyRecord
	for rows.Next() {
		var r DailyRecord
		var aci string
		if err := rows.Scan(&r.ActivityRecordDate, &r.ActivityDayDistance, &aci); err != nil {
			return nil, fmt.Errorf("scan daily record: %w", err)
		}
		if err := json.Unmarshal([]byte(aci), &r.ActivityChangeInfo); err != nil {
			return nil, fmt.Errorf("unmarshal activity_change_info for %s: %w", r.ActivityRecordDate, err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetPlaceRecords returns place records (shift markers) for one driver,
// chronological ascending (deriveShifts on the frontend sorts again anyway,
// but ascending is the natural order for derivation).
func (d *DB) GetPlaceRecords(ctx context.Context, cardNumber string) ([]PlaceRecord, error) {
	const q = `
        SELECT entry_time, entry_type, country, region, odometer
        FROM place_records
        WHERE driver_card_number = ?
        ORDER BY entry_time ASC`
	rows, err := d.conn.QueryContext(ctx, q, cardNumber)
	if err != nil {
		return nil, fmt.Errorf("get place records: %w", err)
	}
	defer rows.Close()
	var out []PlaceRecord
	for rows.Next() {
		var p PlaceRecord
		if err := rows.Scan(&p.EntryTime, &p.EntryTypeDailyWorkPeriod, &p.DailyWorkPeriodCountry, &p.DailyWorkPeriodRegion, &p.VehicleOdometerValue); err != nil {
			return nil, fmt.Errorf("scan place record: %w", err)
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetGnssPoints returns GNSS samples for one driver, chronological ascending.
func (d *DB) GetGnssPoints(ctx context.Context, cardNumber string) ([]GnssPoint, error) {
	const q = `
        SELECT timestamp, latitude, longitude, odometer
        FROM gnss_points
        WHERE driver_card_number = ?
        ORDER BY timestamp ASC`
	rows, err := d.conn.QueryContext(ctx, q, cardNumber)
	if err != nil {
		return nil, fmt.Errorf("get gnss points: %w", err)
	}
	defer rows.Close()
	var out []GnssPoint
	for rows.Next() {
		var g GnssPoint
		if err := rows.Scan(&g.Timestamp, &g.Latitude, &g.Longitude, &g.Odometer); err != nil {
			return nil, fmt.Errorf("scan gnss point: %w", err)
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// GetEventsAndFaults returns events and faults for one driver, newest first.
func (d *DB) GetEventsAndFaults(ctx context.Context, cardNumber string) ([]CardEvent, error) {
	const q = `
        SELECT ef.kind, ef.event_type, ef.begin_time, ef.end_time,
               COALESCE(ef.vehicle_registration, ''),
               COALESCE(v.nation, 0)
        FROM events_faults ef
        LEFT JOIN (
            SELECT registration, MAX(registration_nation) AS nation
            FROM vehicles GROUP BY registration
        ) v ON v.registration = ef.vehicle_registration
        WHERE ef.driver_card_number = ?
        ORDER BY ef.begin_time DESC`
	rows, err := d.conn.QueryContext(ctx, q, cardNumber)
	if err != nil {
		return nil, fmt.Errorf("get events and faults: %w", err)
	}
	defer rows.Close()
	var out []CardEvent
	for rows.Next() {
		var e CardEvent
		var end sql.NullString
		if err := rows.Scan(&e.Kind, &e.Type, &e.Begin, &end, &e.VehicleRegistration, &e.VehicleNation); err != nil {
			return nil, fmt.Errorf("scan event/fault: %w", err)
		}
		e.End = end.String
		out = append(out, e)
	}
	return out, rows.Err()
}

// GetDriverVehicles returns vehicle usage windows for one driver, oldest first.
// Shape matches vehicles.ts VehicleUsage so the frontend can use rows directly.
func (d *DB) GetDriverVehicles(ctx context.Context, cardNumber string) ([]DriverVehicle, error) {
	const q = `
        SELECT registration, registration_nation,
               first_use_at, last_use_at,
               first_use_odometer, last_use_odometer
        FROM driver_vehicles
        WHERE driver_card_number = ?
        ORDER BY first_use_at ASC`
	rows, err := d.conn.QueryContext(ctx, q, cardNumber)
	if err != nil {
		return nil, fmt.Errorf("get driver vehicles: %w", err)
	}
	defer rows.Close()
	var out []DriverVehicle
	for rows.Next() {
		var v DriverVehicle
		if err := rows.Scan(&v.Registration, &v.Nation, &v.FirstUse, &v.LastUse, &v.OdoBegin, &v.OdoEnd); err != nil {
			return nil, fmt.Errorf("scan driver vehicle: %w", err)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

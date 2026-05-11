package db

import (
	"context"
	"fmt"
)

// WipeStats reports how many rows of each kind were deleted by Wipe.
type WipeStats struct {
	Drivers       int64 `json:"drivers"`
	Vehicles      int64 `json:"vehicles"`
	Imports       int64 `json:"imports"`
	DailyRecords  int64 `json:"dailyRecords"`
	PlaceRecords  int64 `json:"placeRecords"`
	GnssPoints    int64 `json:"gnssPoints"`
	EventsFaults  int64 `json:"eventsFaults"`
	DriverVehicles int64 `json:"driverVehicles"`
}

// Wipe deletes every row from every data table (in FK-dependency order, inside
// a transaction) and then VACUUMs to reclaim disk space. The schema itself is
// untouched — schema_migrations stays intact so re-running migrations on next
// open is a no-op.
func (d *DB) Wipe(ctx context.Context) (*WipeStats, error) {
	tx, err := d.conn.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin wipe tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	stats := &WipeStats{}
	// Order matters: child tables first, then parents.
	tables := []struct {
		name string
		dest *int64
	}{
		{"events_faults", &stats.EventsFaults},
		{"gnss_points", &stats.GnssPoints},
		{"place_records", &stats.PlaceRecords},
		{"daily_records", &stats.DailyRecords},
		{"driver_vehicles", &stats.DriverVehicles},
		{"imports", &stats.Imports},
		{"vehicles", &stats.Vehicles},
		{"drivers", &stats.Drivers},
	}
	for _, t := range tables {
		res, err := tx.ExecContext(ctx, "DELETE FROM "+t.name)
		if err != nil {
			return nil, fmt.Errorf("wipe %s: %w", t.name, err)
		}
		n, err := res.RowsAffected()
		if err != nil {
			return nil, fmt.Errorf("rows affected for %s: %w", t.name, err)
		}
		*t.dest = n
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit wipe: %w", err)
	}
	// VACUUM has to run outside a transaction.
	if _, err := d.conn.ExecContext(ctx, "VACUUM"); err != nil {
		// Non-fatal — wipe already succeeded.
		return stats, fmt.Errorf("vacuum (non-fatal): %w", err)
	}
	return stats, nil
}

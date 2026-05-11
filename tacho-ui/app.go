package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"tacho-ui/internal/db"
	"tacho-ui/internal/importer"
)

// App is the Wails-bound surface. It owns the SQLite store for the lifetime of
// the process. All bound methods that read or write tachograph data go through
// the DB; the in-memory "parse JSON each open" path from the POC is gone.
type App struct {
	ctx context.Context
	db  *db.DB
}

func NewApp() *App {
	return &App{}
}

// startup is called by Wails after the window is ready. We open the DB here
// and stash the cancellation context for runtime calls (file dialogs, print).
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := db.Open(ctx)
	if err != nil {
		// Surface to the log; the UI will see empty driver lists and at least
		// the next import attempt will produce a clearer error.
		log.Printf("db.Open failed: %v", err)
		return
	}
	a.db = store
	log.Printf("DB ready at %s", store.Path())
}

// shutdown is called by Wails when the window closes. Close the DB cleanly.
func (a *App) shutdown(_ context.Context) {
	if a.db != nil {
		_ = a.db.Close()
	}
}

// ===== Imports =====

// ImportDDDDialog shows a native file picker, then imports the chosen file.
// Returns nil result with nil error when the user cancels.
func (a *App) ImportDDDDialog() (*db.ImportResult, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select a tachograph file",
		Filters: []runtime.FileFilter{{
			DisplayName: "Tachograph files (*.ddd)",
			Pattern:     "*.ddd;*.DDD",
		}},
	})
	if err != nil {
		return nil, fmt.Errorf("open dialog: %w", err)
	}
	if path == "" {
		return nil, nil
	}
	return a.importPath(path)
}

// ImportDDDFromPath imports a file by absolute path. Used by the native drop handler.
func (a *App) ImportDDDFromPath(path string) (*db.ImportResult, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.importPath(path)
}

func (a *App) importPath(path string) (*db.ImportResult, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	name := filepath.Base(path)
	if !importer.LooksLikeCard(name) {
		// VU imports aren't wired up yet — keep the error explicit rather than
		// silently doing nothing. This is the obvious next slice of work.
		return nil, fmt.Errorf("only driver-card (C_*) files are supported in this build; got %s", name)
	}
	return importer.ImportCard(a.ctx, a.db, name, data)
}

// ListImports returns the imports for one driver, newest first.
func (a *App) ListImports(cardNumber string) ([]db.ImportInfo, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.ListImports(a.ctx, cardNumber)
}

// DeleteImport removes an import and (via FK cascade) every row sourced from
// it. Returns true when something was actually deleted.
func (a *App) DeleteImport(importID int64) (bool, error) {
	if a.db == nil {
		return false, errors.New("database not initialised")
	}
	return a.db.DeleteImport(a.ctx, importID)
}

// ===== Drivers =====

// ListDrivers returns the driver landing-page list.
func (a *App) ListDrivers() ([]db.DriverSummary, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.ListDrivers(a.ctx)
}

// GetDriverProfile returns full identity + aggregates for one driver. Returns
// nil result with nil error when the driver isn't found.
func (a *App) GetDriverProfile(cardNumber string) (*db.DriverProfile, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.GetDriverProfile(a.ctx, cardNumber)
}

// ===== Per-driver data fetches (shapes match the frontend's existing
// post-extract TypeScript types so we can plug them straight in.) =====

func (a *App) GetDailyRecords(cardNumber string) ([]db.DailyRecord, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.GetDailyRecords(a.ctx, cardNumber)
}

func (a *App) GetPlaceRecords(cardNumber string) ([]db.PlaceRecord, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.GetPlaceRecords(a.ctx, cardNumber)
}

func (a *App) GetGnssPoints(cardNumber string) ([]db.GnssPoint, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.GetGnssPoints(a.ctx, cardNumber)
}

func (a *App) GetEventsAndFaults(cardNumber string) ([]db.CardEvent, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.GetEventsAndFaults(a.ctx, cardNumber)
}

func (a *App) GetDriverVehicles(cardNumber string) ([]db.DriverVehicle, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.GetDriverVehicles(a.ctx, cardNumber)
}

// ===== Misc =====

// WipeDatabase deletes every imported row and VACUUMs. Intended for testing —
// the frontend confirms with the user before calling this. Returns per-table
// delete counts so the UI can surface what was actually removed.
func (a *App) WipeDatabase() (*db.WipeStats, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db.Wipe(a.ctx)
}

// PrintWindow triggers the native OS print dialog for the Wails window.
// Wails v2's bundled JS runtime doesn't expose runtime.WindowPrint, so this
// thin binding lets the frontend call it via the generated Go bindings.
// See https://github.com/wailsapp/wails/pull/2822.
func (a *App) PrintWindow() {
	runtime.WindowPrint(a.ctx)
}

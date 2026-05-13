package main

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"tacho-ui/internal/db"
	"tacho-ui/internal/importer"
	"tacho-ui/internal/updater"
)

// fileOpenedEvent is the runtime-event name the frontend listens on when the
// OS hands us a file to import (file-association double-click, `open foo.ddd`,
// a second instance launched with a path on Windows).
const fileOpenedEvent = "file-opened"

// App is the Wails-bound surface. It owns the SQLite store for the lifetime of
// the process. All bound methods that read or write tachograph data go through
// the DB; the in-memory "parse JSON each open" path from the POC is gone.
type App struct {
	ctx context.Context
	db  *db.DB

	// pendingFiles buffers any file paths the OS hands us before the frontend
	// is mounted and ready to receive events. OnFileOpen on macOS reliably
	// fires before startup completes when the app is cold-launched via
	// double-click. The frontend drains this via PendingFileOpens() on mount.
	pendingMu    sync.Mutex
	pendingFiles []string
}

func NewApp() *App {
	return &App{}
}

// handleOpenedFiles is invoked from Mac.OnFileOpen (cold-launch and warm) and
// from SingleInstanceLock.OnSecondInstanceLaunch (Windows). It queues the
// paths and, if the frontend is already running, emits a runtime event so the
// dialog can pop immediately.
func (a *App) handleOpenedFiles(paths []string) {
	if len(paths) == 0 {
		return
	}
	a.pendingMu.Lock()
	a.pendingFiles = append(a.pendingFiles, paths...)
	ctx := a.ctx
	a.pendingMu.Unlock()
	if ctx != nil {
		runtime.EventsEmit(ctx, fileOpenedEvent, paths)
	}
}

// PendingFileOpens drains and returns any file paths the OS handed us before
// the frontend was ready. The frontend calls this on mount and also subscribes
// to the `file-opened` runtime event for the warm-launch case.
func (a *App) PendingFileOpens() []string {
	a.pendingMu.Lock()
	defer a.pendingMu.Unlock()
	out := a.pendingFiles
	a.pendingFiles = nil
	return out
}

// startup is called by Wails after the window is ready. If the DB can't be
// opened we surface a native dialog and quit — every binding below assumes a
// live a.db, and silently degrading to empty driver lists is worse UX than
// telling the user up front.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	store, err := db.Open(ctx)
	if err != nil {
		log.Printf("db.Open failed: %v", err)
		_, _ = runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Tachograph Viewer — startup failed",
			Message: fmt.Sprintf("Could not open the local database:\n\n%v\n\nThe app will now exit.", err),
		})
		runtime.Quit(ctx)
		return
	}
	a.db = store
	log.Printf("DB ready at %s", store.Path())

	// Initialise Sparkle. In release builds (`-tags sparkle`) this kicks off
	// the scheduled background check per Info.plist's SUScheduledCheckInterval.
	// In dev builds the call is a no-op (stub implementation).
	updater.Start()
}

// shutdown is called by Wails when the window closes. Close the DB cleanly.
func (a *App) shutdown(_ context.Context) {
	if a.db != nil {
		_ = a.db.Close()
	}
}

// store returns the live store, or an error if startup never completed
// successfully. In practice startup quits the process on DB-open failure, so
// this only fires during the brief interval between dialog dismissal and the
// window actually closing.
func (a *App) store() (*db.DB, error) {
	if a.db == nil {
		return nil, errors.New("database not initialised")
	}
	return a.db, nil
}

// ===== Imports =====

// ImportDDDFromBytes imports a tachograph file uploaded from the frontend.
// The file is delivered as base64-encoded bytes — JSON can't carry raw binary
// efficiently, and base64 sidesteps a Wails []byte → number[] explosion for
// MB-scale files. Filename is used only for the .ddd extension check and as
// the human-facing label in the imports table.
func (a *App) ImportDDDFromBytes(filename string, dataBase64 string) (*db.ImportResult, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	data, err := base64.StdEncoding.DecodeString(dataBase64)
	if err != nil {
		return nil, fmt.Errorf("decode base64: %w", err)
	}
	if !importer.LooksLikeCard(filename) {
		// VU imports aren't wired up yet — keep the error explicit rather than
		// silently doing nothing. This is the obvious next slice of work.
		return nil, fmt.Errorf("only driver-card (C_*) files are supported in this build; got %s", filename)
	}
	return importer.ImportCard(a.ctx, store, filename, data)
}

// ImportDDDFromPath reads and imports a file by absolute path. Used by the
// file-association flow on macOS (double-click a .ddd → OnFileOpen → frontend
// dialog confirms → this binding) and by the Windows command-line argv path.
// Skips the base64 round-trip the bytes-based binding needs.
func (a *App) ImportDDDFromPath(path string) (*db.ImportResult, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	filename := filepath.Base(path)
	if !importer.LooksLikeCard(filename) {
		return nil, fmt.Errorf("only driver-card (C_*) files are supported in this build; got %s", filename)
	}
	return importer.ImportCard(a.ctx, store, filename, data)
}

// ListImports returns the imports for one driver, newest first.
func (a *App) ListImports(cardNumber string) ([]db.ImportInfo, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.ListImports(a.ctx, cardNumber)
}

// DeleteImport removes an import and (via FK cascade) every row sourced from
// it. Returns true when something was actually deleted.
func (a *App) DeleteImport(importID int64) (bool, error) {
	store, err := a.store()
	if err != nil {
		return false, err
	}
	return store.DeleteImport(a.ctx, importID)
}

// ===== Drivers =====

// ListDrivers returns the driver landing-page list.
func (a *App) ListDrivers() ([]db.DriverSummary, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.ListDrivers(a.ctx)
}

// GetDriverProfile returns full identity + aggregates for one driver. Returns
// nil result with nil error when the driver isn't found.
func (a *App) GetDriverProfile(cardNumber string) (*db.DriverProfile, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.GetDriverProfile(a.ctx, cardNumber)
}

// ===== Per-driver data fetches (shapes match the frontend's existing
// post-extract TypeScript types so we can plug them straight in.) =====

func (a *App) GetDailyRecords(cardNumber string) ([]db.DailyRecord, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.GetDailyRecords(a.ctx, cardNumber)
}

func (a *App) GetPlaceRecords(cardNumber string) ([]db.PlaceRecord, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.GetPlaceRecords(a.ctx, cardNumber)
}

func (a *App) GetGnssPoints(cardNumber string) ([]db.GnssPoint, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.GetGnssPoints(a.ctx, cardNumber)
}

func (a *App) GetEventsAndFaults(cardNumber string) ([]db.CardEvent, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.GetEventsAndFaults(a.ctx, cardNumber)
}

func (a *App) GetDriverVehicles(cardNumber string) ([]db.DriverVehicle, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.GetDriverVehicles(a.ctx, cardNumber)
}

// ===== Misc =====

// WipeDatabase deletes every imported row and VACUUMs. Intended for testing —
// the frontend confirms with the user before calling this. Returns per-table
// delete counts so the UI can surface what was actually removed.
func (a *App) WipeDatabase() (*db.WipeStats, error) {
	store, err := a.store()
	if err != nil {
		return nil, err
	}
	return store.Wipe(a.ctx)
}

// PrintWindow triggers the native OS print dialog for the Wails window.
// Wails v2's bundled JS runtime doesn't expose runtime.WindowPrint, so this
// thin binding lets the frontend call it via the generated Go bindings.
// See https://github.com/wailsapp/wails/pull/2822.
func (a *App) PrintWindow() {
	runtime.WindowPrint(a.ctx)
}

// AppVersion returns the build-time version string (e.g. "v0.1.0"). Defaults
// to "dev" for un-tagged local builds. Bound for display in the UI / About.
func (a *App) AppVersion() string {
	return Version
}

// CheckForUpdates triggers a Sparkle user-initiated check. Shows native UI
// either way ("update available" or "you're up to date"). In dev builds
// (without the `sparkle` build tag) this is a no-op.
func (a *App) CheckForUpdates() {
	updater.CheckForUpdates()
}

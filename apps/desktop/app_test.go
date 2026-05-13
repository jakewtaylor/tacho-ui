package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"tacho-ui/internal/db"
	"tacho-ui/internal/importer"
)

// Sample lives at the monorepo root (gitignored as PII) — two levels up
// from this Go test under apps/desktop/.
const samplePath = "../../C_20260509_1146_M_TAYLOR_DB141641620128.ddd"

// TestImportSampleCard imports the sample driver-card into a temp DB and
// asserts that the resulting rows match what the dddparser CLI produced.
func TestImportSampleCard(t *testing.T) {
	if _, err := os.Stat(samplePath); err != nil {
		t.Skipf("sample .ddd not present: %v", err)
	}
	data, err := os.ReadFile(samplePath)
	if err != nil {
		t.Fatalf("read sample: %v", err)
	}

	ctx := context.Background()
	tmp := filepath.Join(t.TempDir(), "tacho-test.db")
	store, err := db.OpenAt(ctx, tmp)
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	defer store.Close()

	result, err := importer.ImportCard(ctx, store, filepath.Base(samplePath), data)
	if err != nil {
		t.Fatalf("ImportCard: %v", err)
	}
	if result.AlreadyImported {
		t.Fatalf("first import unexpectedly flagged AlreadyImported")
	}
	if !strings.HasPrefix(result.DriverCardNumber, "DB14164162012802") {
		t.Fatalf("DriverCardNumber = %q, want prefix DB14164162012802", result.DriverCardNumber)
	}
	if result.Counts["daily_records"] < 100 {
		t.Fatalf("daily_records too low: %d", result.Counts["daily_records"])
	}
	if result.Counts["place_records"] == 0 {
		t.Fatalf("place_records was zero — shift derivation will break")
	}

	// Driver profile.
	profile, err := store.GetDriverProfile(ctx, result.DriverCardNumber)
	if err != nil {
		t.Fatalf("GetDriverProfile: %v", err)
	}
	if profile == nil {
		t.Fatalf("driver profile missing for %s", result.DriverCardNumber)
	}
	if !strings.Contains(profile.Surname, "TAYLOR") || !strings.Contains(profile.FirstNames, "MARK") {
		t.Fatalf("unexpected holder name: %q / %q", profile.FirstNames, profile.Surname)
	}
	if profile.DailyRecordCount < 100 {
		t.Fatalf("DailyRecordCount = %d, want >= 100", profile.DailyRecordCount)
	}

	// Daily records — guard the activity_change_info round-trip through JSON.
	days, err := store.GetDailyRecords(ctx, result.DriverCardNumber)
	if err != nil {
		t.Fatalf("GetDailyRecords: %v", err)
	}
	if len(days) == 0 {
		t.Fatalf("GetDailyRecords returned no rows")
	}
	first := days[0]
	if len(first.ActivityChangeInfo) == 0 {
		t.Fatalf("first day has no activity_change_info events")
	}

	// Re-import the same bytes → AlreadyImported with the prior import ID.
	again, err := importer.ImportCard(ctx, store, filepath.Base(samplePath), data)
	if err != nil {
		t.Fatalf("re-import: %v", err)
	}
	if !again.AlreadyImported {
		t.Fatalf("re-import should be flagged AlreadyImported")
	}
	if again.ImportID != result.ImportID {
		t.Fatalf("re-import ID changed: %d → %d", result.ImportID, again.ImportID)
	}

	// Driver list aggregate counts should match the single driver.
	drivers, err := store.ListDrivers(ctx)
	if err != nil {
		t.Fatalf("ListDrivers: %v", err)
	}
	if len(drivers) != 1 {
		t.Fatalf("ListDrivers = %d drivers, want 1", len(drivers))
	}
	if drivers[0].ImportCount != 1 {
		t.Fatalf("ImportCount = %d, want 1", drivers[0].ImportCount)
	}
}

func TestLooksLikeCard(t *testing.T) {
	cases := map[string]bool{
		"C_foo.ddd":      true,
		"c_foo.ddd":      true,
		"M_foo.ddd":      false,
		"V_foo.ddd":      false,
		"random.ddd":     false,
		"C_TAYLOR_X.ddd": true,
	}
	for name, want := range cases {
		if got := importer.LooksLikeCard(name); got != want {
			t.Errorf("importer.LooksLikeCard(%q) = %v, want %v", name, got, want)
		}
	}
}

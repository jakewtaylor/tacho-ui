package main

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// TestParseSampleCard verifies the in-process parser produces the same key
// driver-identification fields as the dddparser CLI does. Run from tacho-ui/.
func TestParseSampleCard(t *testing.T) {
	const sample = "../C_20260509_1146_M_TAYLOR_DB141641620128.ddd"
	if _, err := os.Stat(sample); err != nil {
		t.Skipf("sample .ddd not present: %v", err)
	}

	data, err := os.ReadFile(sample)
	if err != nil {
		t.Fatalf("read sample: %v", err)
	}

	got, err := parseBytes("C_sample.ddd", data, true)
	if err != nil {
		t.Fatalf("parseBytes: %v", err)
	}
	if got.FileType != "card" {
		t.Fatalf("FileType = %q, want %q", got.FileType, "card")
	}
	if len(got.JSON) < 1_000_000 {
		t.Fatalf("JSON too short (%d bytes); parse likely incomplete", len(got.JSON))
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(got.JSON), &parsed); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}

	ident, ok := parsed["card_identification_and_driver_card_holder_identification_1"].(map[string]any)
	if !ok {
		t.Fatalf("missing card_identification_and_driver_card_holder_identification_1")
	}
	holder := ident["driver_card_holder_identification"].(map[string]any)
	name := holder["card_holder_name"].(map[string]any)

	surname, _ := name["holder_surname"].(string)
	first, _ := name["holder_first_names"].(string)
	if !strings.Contains(surname, "TAYLOR") || !strings.Contains(first, "MARK") {
		t.Fatalf("unexpected holder name: %q / %q", first, surname)
	}

	card := ident["card_identification"].(map[string]any)
	cardNum, _ := card["card_number"].(string)
	if !strings.HasPrefix(cardNum, "DB14164162012802") {
		t.Fatalf("unexpected card_number: %q", cardNum)
	}

	// Activity records are what the UI overview is built on — guard the shape.
	activity, ok := parsed["card_driver_activity_1"].(map[string]any)
	if !ok {
		t.Fatalf("missing card_driver_activity_1")
	}
	records, ok := activity["decoded_activity_daily_records"].([]any)
	if !ok || len(records) == 0 {
		t.Fatalf("decoded_activity_daily_records missing or empty")
	}
	firstDay := records[0].(map[string]any)
	if _, ok := firstDay["activity_record_date"].(string); !ok {
		t.Fatalf("daily record missing activity_record_date")
	}
	events, ok := firstDay["activity_change_info"].([]any)
	if !ok || len(events) == 0 {
		t.Fatalf("daily record missing activity_change_info events")
	}
	ev := events[0].(map[string]any)
	for _, key := range []string{"work_type", "minutes", "card_present"} {
		if _, present := ev[key]; !present {
			t.Fatalf("activity_change_info[0] missing %q", key)
		}
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
		if got := looksLikeCard(name); got != want {
			t.Errorf("looksLikeCard(%q) = %v, want %v", name, got, want)
		}
	}
}

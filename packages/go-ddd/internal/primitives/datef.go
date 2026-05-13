package primitives

import "fmt"

// Date holds a calendar date split into year/month/day, matching the
// shape the EU data dictionary uses for human-readable card-holder
// dates (date of birth, card issue date, card expiry date).
type Date struct {
	Year  int `json:"year"`
	Month int `json:"month"`
	Day   int `json:"day"`
}

// Zero reports whether the date carries no useful value (all-zero BCD,
// or the EU-defined "not present" 1-Jan-0001 placeholder).
func (d Date) Zero() bool {
	return d.Year == 0 && d.Month == 0 && d.Day == 0
}

// ISO returns the date as YYYY-MM-DD, or an empty string when zero.
func (d Date) ISO() string {
	if d.Zero() {
		return ""
	}
	return fmt.Sprintf("%04d-%02d-%02d", d.Year, d.Month, d.Day)
}

// Datef — Appendix 1 §2.57. 4 bytes BCD, packed as YYYYMMDD: the first
// two bytes are the year, the third is the month, the fourth is the day.
// All zero (0x00000000) is the "no value" sentinel.
func Datef(data []byte) (Date, error) {
	if len(data) < 4 {
		return Date{}, fmt.Errorf("primitives: Datef needs 4 bytes, got %d", len(data))
	}
	year, err := UnsignedBCD(data[0:2])
	if err != nil {
		return Date{}, fmt.Errorf("primitives: Datef year: %w", err)
	}
	month, err := UnsignedBCD(data[2:3])
	if err != nil {
		return Date{}, fmt.Errorf("primitives: Datef month: %w", err)
	}
	day, err := UnsignedBCD(data[3:4])
	if err != nil {
		return Date{}, fmt.Errorf("primitives: Datef day: %w", err)
	}
	return Date{Year: int(year), Month: int(month), Day: int(day)}, nil
}

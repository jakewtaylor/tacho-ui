package ddd

import "errors"

// ErrEmpty is returned when ParseCard / ParseVU is called on no data.
var ErrEmpty = errors.New("ddd: empty input")

// ErrTruncatedFrame is returned when the TLV stream ends mid-record.
var ErrTruncatedFrame = errors.New("ddd: truncated TLV frame")

// ErrUnknownEF is returned when an EF body declares a length that is
// inconsistent with the published format. Callers can choose to ignore
// it and continue parsing the rest of the file.
var ErrUnknownEF = errors.New("ddd: unrecognised elementary file")

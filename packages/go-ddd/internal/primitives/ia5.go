package primitives

import "strings"

// IA5String — Appendix 1 §2.85 / ISO/IEC 8824-1 IA5String. 7-bit ASCII,
// space-padded to the fixed length. The dictionary uses IA5String for
// human-readable identifiers (card numbers, registration numbers,
// authority names) where character-set portability matters.
//
// Trailing spaces and trailing NULs are stripped — both are
// equivalent "no character" padding in practice across the EU
// regulation's fixed-length string fields. Leading whitespace is
// preserved (some authorities pad on the left).
func IA5String(data []byte) string {
	// 0x00 and 0x20 are both padding in different reader implementations;
	// trim both from the right to normalise.
	end := len(data)
	for end > 0 {
		b := data[end-1]
		if b != 0x00 && b != 0x20 {
			break
		}
		end--
	}
	return string(data[:end])
}

// CodePageString decodes a string accompanied by an explicit 1-byte
// code-page selector (Appendix 1 §2.99 "Name", §2.117 "PlaceRecord"
// etc.). The dictionary defers the actual code-page table to ISO 8859
// variants; for the field set we care about, the readable subset is
// ASCII, so we treat the body as latin-1-ish: each byte maps to its
// rune value. This is good enough for surnames, first names, and
// place strings that the UI displays.
//
// A code page byte of 0 means "default" — currently treated the same
// way (latin-1 mapping). When we add full IConv-style decoding later,
// this is the place to dispatch by code-page value.
func CodePageString(codePage byte, body []byte) string {
	trimmed := strings.TrimRight(string(body), "\x00 ")
	if codePage == 0 {
		return trimmed
	}
	// Latin-1 / ASCII passthrough: bytes are already runes for
	// code points <128, and ISO-8859-1 maps byte = rune for 128-255.
	runes := make([]rune, 0, len(trimmed))
	for _, b := range []byte(trimmed) {
		runes = append(runes, rune(b))
	}
	return string(runes)
}

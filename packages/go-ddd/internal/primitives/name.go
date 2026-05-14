package primitives

import "fmt"

// NameLen is the fixed wire-length of a single Name (Appendix 1 §2.99):
// 1 byte code-page selector + 35 bytes of character data.
const NameLen = 36

// Name decodes a single 36-byte Name (Appendix 1 §2.99) into the
// readable string portion. The leading byte is a code-page selector
// applied via CodePageString.
func Name(data []byte) (string, error) {
	if len(data) < NameLen {
		return "", fmt.Errorf("primitives: Name needs %d bytes, got %d", NameLen, len(data))
	}
	return CodePageString(data[0], data[1:NameLen]), nil
}

// HolderName decodes the SEQUENCE { holderSurname Name, holderFirstNames
// Name } structure (Appendix 1 §2.83). 72 bytes on the wire.
type HolderNameValue struct {
	Surname    string `json:"holder_surname"`
	FirstNames string `json:"holder_first_names"`
}

func HolderName(data []byte) (HolderNameValue, error) {
	if len(data) < 2*NameLen {
		return HolderNameValue{}, fmt.Errorf("primitives: HolderName needs %d bytes, got %d", 2*NameLen, len(data))
	}
	surname, err := Name(data[:NameLen])
	if err != nil {
		return HolderNameValue{}, fmt.Errorf("primitives: HolderName surname: %w", err)
	}
	first, err := Name(data[NameLen : 2*NameLen])
	if err != nil {
		return HolderNameValue{}, fmt.Errorf("primitives: HolderName firstNames: %w", err)
	}
	return HolderNameValue{Surname: surname, FirstNames: first}, nil
}

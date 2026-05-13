// Package tlv implements the Tag-Length-Value framing used in tachograph
// card downloads per Commission Implementing Regulation (EU) 2016/799
// Annex IC Appendix 7 §3.2 ("Card data download protocol — Output format").
//
// Each record on the wire is:
//
//	+--------+--------+--------+--------+--------+----- ... ----+
//	|       FID       |  type  |     length      |     value    |
//	|     2 bytes     | 1 byte |     2 bytes     |  length bytes|
//	+-----------------+--------+-----------------+--------------+
//
// FID is the elementary-file identifier (e.g. 0x0520 = EF_Identification).
// type discriminates the body interpretation; the values in practice are
//
//	0x00  raw data (the EF body itself)
//	0x01  signature over the preceding raw-data record
//	0x02  Gen2 raw data (when an EF exists in both generations)
//	0x03  Gen2 signature
//
// Length is big-endian.
//
// This package handles framing only — it does not interpret EF bodies or
// verify signatures. It is safe to call on untrusted input: every read
// returns an explicit error rather than panicking, and the reader rejects
// truncated frames.
package tlv

import (
	"encoding/binary"
	"fmt"
	"io"
)

// Type discriminates the four record kinds defined in App. 7 §3.2.
type Type byte

const (
	TypeData         Type = 0x00 // first-generation raw EF data
	TypeSignature    Type = 0x01 // first-generation signature over preceding data record
	TypeDataGen2     Type = 0x02 // second-generation raw EF data
	TypeSignatureG2  Type = 0x03 // second-generation signature
	TypeDataGen2v2   Type = 0x04 // second-generation v2 raw EF data (Reg. 2021/1228)
	TypeSignatureG2v Type = 0x05 // second-generation v2 signature
)

// IsData reports whether the record carries an EF body (any of the
// generation-specific data variants).
func (t Type) IsData() bool {
	return t == TypeData || t == TypeDataGen2 || t == TypeDataGen2v2
}

// IsSignature reports whether the record is a signature wrapper over the
// immediately preceding data record.
func (t Type) IsSignature() bool {
	return t == TypeSignature || t == TypeSignatureG2 || t == TypeSignatureG2v
}

// Generation reports which card generation the record originated from.
// 1 for first-generation data/sig, 2 for second-generation v1, 22 for
// second-generation v2 (the encoding used by EU 2021/1228 amendments).
func (t Type) Generation() int {
	switch t {
	case TypeData, TypeSignature:
		return 1
	case TypeDataGen2, TypeSignatureG2:
		return 2
	case TypeDataGen2v2, TypeSignatureG2v:
		return 22
	}
	return 0
}

// Record is one framed TLV entry as it appears on the wire.
type Record struct {
	FID   uint16 // elementary-file identifier
	Type  Type
	Value []byte // raw EF body or signature bytes; sub-slice of input, do not mutate
}

// HeaderLen is the constant header size: 2-byte FID + 1-byte type +
// 2-byte length.
const HeaderLen = 5

// MaxLength caps the value size to keep allocation predictable.
// 1 MiB is more than 30× any single EF emitted by a Gen2 card, so this
// is purely a defence against pathological inputs.
const MaxLength = 1 << 20

// Read consumes a single TLV record from data starting at offset and
// returns the parsed record plus the number of bytes consumed.
// io.EOF is returned when offset is exactly at len(data) so callers can
// loop naturally.
func Read(data []byte, offset int) (Record, int, error) {
	if offset == len(data) {
		return Record{}, 0, io.EOF
	}
	if offset+HeaderLen > len(data) {
		return Record{}, 0, fmt.Errorf("tlv: truncated header at offset %d (need %d bytes, have %d)",
			offset, HeaderLen, len(data)-offset)
	}
	r := Record{
		FID:  binary.BigEndian.Uint16(data[offset : offset+2]),
		Type: Type(data[offset+2]),
	}
	length := int(binary.BigEndian.Uint16(data[offset+3 : offset+HeaderLen]))
	if length > MaxLength {
		return Record{}, 0, fmt.Errorf("tlv: declared length %d exceeds cap %d at offset %d",
			length, MaxLength, offset)
	}
	end := offset + HeaderLen + length
	if end > len(data) {
		return Record{}, 0, fmt.Errorf("tlv: truncated value at offset %d (need %d bytes, have %d)",
			offset, length, len(data)-offset-HeaderLen)
	}
	r.Value = data[offset+HeaderLen : end]
	return r, HeaderLen + length, nil
}

// Walk iterates every record in data, invoking fn for each. The walk
// stops early and returns the error from fn if it returns one. A
// framing error in the stream is returned directly.
func Walk(data []byte, fn func(Record) error) error {
	offset := 0
	for {
		rec, n, err := Read(data, offset)
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if err := fn(rec); err != nil {
			return err
		}
		offset += n
	}
}

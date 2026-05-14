package crypto

import "fmt"

// Minimal DER/BER-TLV reader for the certificate format defined in
// Reg. 2016/799 Annex IC App. 11 Part B §9.3.2 Table 4. We only need
// to read a small fixed set of tags, so this isn't a general-purpose
// ASN.1 implementation.

// derTag represents a 1- or 2-byte BER-TLV tag.
type derTag uint16

// Tags used by Gen2 certificates.
const (
	tagECCCertificate    derTag = 0x7F21 // outer wrapper (sometimes stripped)
	tagCertBody          derTag = 0x7F4E
	tagProfileIdentifier derTag = 0x5F29
	tagCAR               derTag = 0x0042
	tagCHA               derTag = 0x5F4C
	tagPublicKey         derTag = 0x7F49
	tagDomainParameters  derTag = 0x0006
	tagPublicPoint       derTag = 0x0086
	tagCHR               derTag = 0x5F20
	tagEffectiveDate     derTag = 0x5F25
	tagExpirationDate    derTag = 0x5F24
	tagSignature         derTag = 0x5F37
)

// derTLV is one parsed (tag, value) pair plus the length of the entire
// (tag || length || value) sequence on the wire — useful when callers
// need to know how many bytes the whole record occupied.
type derTLV struct {
	Tag       derTag
	Value     []byte
	TotalSize int
}

// readDERTLV parses one TLV record at offset 0 of `buf`. Returns the
// parsed record or an error if the framing is corrupt.
func readDERTLV(buf []byte) (derTLV, error) {
	if len(buf) < 2 {
		return derTLV{}, fmt.Errorf("der: truncated tag (have %d bytes)", len(buf))
	}
	tagBytes := 1
	tag := derTag(buf[0])
	// Multi-byte tag indicator: low 5 bits of the first byte all set.
	if buf[0]&0x1F == 0x1F {
		tagBytes = 2
		tag = derTag(buf[0])<<8 | derTag(buf[1])
	}
	if len(buf) < tagBytes+1 {
		return derTLV{}, fmt.Errorf("der: truncated length (have %d bytes after tag)", len(buf)-tagBytes)
	}
	lenByte := buf[tagBytes]
	lenSize := 1
	var contentLen int
	if lenByte < 0x80 {
		contentLen = int(lenByte)
	} else {
		n := int(lenByte & 0x7F)
		if n == 0 || n > 4 {
			return derTLV{}, fmt.Errorf("der: invalid long-form length 0x%02X", lenByte)
		}
		if len(buf) < tagBytes+1+n {
			return derTLV{}, fmt.Errorf("der: truncated long-form length")
		}
		for i := 0; i < n; i++ {
			contentLen = (contentLen << 8) | int(buf[tagBytes+1+i])
		}
		lenSize = 1 + n
	}
	end := tagBytes + lenSize + contentLen
	if end > len(buf) {
		return derTLV{}, fmt.Errorf("der: declared content length %d exceeds available bytes %d",
			contentLen, len(buf)-tagBytes-lenSize)
	}
	return derTLV{
		Tag:       tag,
		Value:     buf[tagBytes+lenSize : end],
		TotalSize: end,
	}, nil
}

// walkDERTLV iterates all top-level TLV records in `buf`, calling fn
// for each. Returns the first error from fn or a framing error.
func walkDERTLV(buf []byte, fn func(derTLV) error) error {
	for offset := 0; offset < len(buf); {
		rec, err := readDERTLV(buf[offset:])
		if err != nil {
			return err
		}
		if err := fn(rec); err != nil {
			return err
		}
		offset += rec.TotalSize
	}
	return nil
}

// findDERTLV finds the first TLV record with the given tag at the top
// level of `buf`. Returns (value, true) on success.
func findDERTLV(buf []byte, want derTag) ([]byte, bool) {
	var out []byte
	_ = walkDERTLV(buf, func(rec derTLV) error {
		if rec.Tag == want && out == nil {
			out = rec.Value
		}
		return nil
	})
	return out, out != nil
}

// Package card contains decoders for the elementary files (EFs) defined
// on a driver tachograph card per Commission Implementing Regulation
// (EU) 2016/799 Annex IC Appendix 2 ("Tachograph Cards Specification").
//
// Each EF is identified by a 2-byte File Identifier (FID). The FIDs
// below are taken from App. 2 §4.2 (driver card application). They are
// shared between first- and second-generation cards; the parser routes
// records to generation-specific decoders based on the TLV record type.
package card

// FIDs of the elementary files emitted by a driver card .ddd download.
// Source: EU 2016/799 Annex IC Appendix 2 §4.2 (driver card application
// elementary files).
const (
	FIDApplicationIdentification FID = 0x0501
	FIDEventsData                FID = 0x0502
	FIDFaultsData                FID = 0x0503
	FIDDriverActivityData        FID = 0x0504
	FIDVehiclesUsed              FID = 0x0505
	FIDPlaces                    FID = 0x0506
	FIDIdentification            FID = 0x0520
	FIDGNSSPlaces                FID = 0x0525 // Gen2 only
	FIDGNSSPlacesAuth            FID = 0x0526 // Gen2v2 only (Reg. 2021/1228)
)

// FID is the 2-byte EF identifier.
type FID uint16

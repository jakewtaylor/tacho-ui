// Package card contains decoders for the elementary files (EFs) defined
// on a driver tachograph card per Commission Implementing Regulation
// (EU) 2016/799 Annex IC Appendix 2 ("Tachograph Cards Specification")
// and amended by Reg. (EU) 2021/1228 for second-generation version-2
// cards.
//
// Each EF is identified by a 2-byte File Identifier (FID). The values
// below are the driver-card application FIDs from App. 2 §TCS_149
// (Gen1, FID 0500h "DF_Tachograph") and §TCS_152 (Gen2, FID 0500h
// "DF_Tachograph_G2"). FIDs are shared between Gen1 and Gen2 where the
// same logical EF exists in both applications; the TLV record type
// byte discriminates generations on the wire.
package card

// FIDs of the elementary files emitted by a driver card .ddd download.
//
// Source: 2016/799 Annex IC App. 2 §TCS_149 (Gen1 driver card) and
// §TCS_152 (Gen2 driver card); 2021/1228 §TCS_152 amends the Gen2
// table to add the Gen2v2-only EFs (Application_Identification_V2,
// Places_Authentication, GNSS_Places_Authentication, Border_Crossings,
// Load_Unload_Operations, Load_Type_Entries, VU_Configuration).
const (
	FIDApplicationIdentification FID = 0x0501
	FIDEventsData                FID = 0x0502
	FIDFaultsData                FID = 0x0503
	FIDDriverActivityData        FID = 0x0504
	FIDVehiclesUsed              FID = 0x0505
	FIDPlaces                    FID = 0x0506
	FIDCurrentUsage              FID = 0x0507
	FIDControlActivityData       FID = 0x0508
	FIDCardDownload              FID = 0x050E
	FIDIdentification            FID = 0x0520
	FIDDrivingLicenceInfo        FID = 0x0521
	FIDSpecificConditions        FID = 0x0522
	FIDVehicleUnitsUsed          FID = 0x0523 // Gen2 only
	FIDGNSSPlaces                FID = 0x0524 // Gen2 only

	// Gen2v2 only (Reg. 2021/1228 §TCS_152). The PII-bearing EFs are
	// the *_Authentication / border / load files; Application_Identification_V2
	// is just a config-extension record.
	FIDApplicationIdentificationV2 FID = 0x0525
	FIDPlacesAuthentication        FID = 0x0526
	FIDGNSSPlacesAuthentication    FID = 0x0527
	FIDBorderCrossings             FID = 0x0528
	FIDLoadUnloadOperations        FID = 0x0529
	FIDLoadTypeEntries             FID = 0x0530
	FIDVUConfiguration             FID = 0x0531
)

// FID is the 2-byte EF identifier.
type FID uint16

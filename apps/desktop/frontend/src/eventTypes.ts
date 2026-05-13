// EventFaultType decoding per EU Regulation 2016/799 Annex IC Appendix 1 §2.70.
// Events and faults share this code space; range indicates category.

const TYPES: Record<number, string> = {
  // 0x0_ General events
  0x00: "No further details",
  0x01: "Insertion of a non-valid card",
  0x02: "Card conflict",
  0x03: "Time overlap",
  0x04: "Driving without an appropriate card",
  0x05: "Card insertion while driving",
  0x06: "Last card session not correctly closed",
  0x07: "Over-speeding",
  0x08: "Power supply interruption",
  0x09: "Motion data error",
  0x0a: "Vehicle motion conflict",
  0x0b: "Time conflict (GNSS vs VU)",
  0x0c: "Communication error with remote facility",
  0x0d: "Absence of GNSS position info",
  0x0e: "Communication error with external GNSS",
  0x0f: "GNSS anomaly",

  // 0x1_ Vehicle-related security breaches
  0x10: "Security breach (unspecified)",
  0x11: "Motion sensor authentication failure",
  0x12: "Tachograph card authentication failure",
  0x13: "Unauthorized change of motion sensor",
  0x14: "Card data input integrity error",
  0x15: "Stored user data integrity error",
  0x16: "Internal data transfer error",
  0x17: "Unauthorized case opening",
  0x18: "Hardware sabotage",
  0x19: "GNSS tampering",

  // 0x2_ Card-related security breaches
  0x20: "Card security breach (unspecified)",
  0x21: "Card authentication failure",
  0x22: "Card data input integrity error",
  0x23: "Stored user data integrity error",

  // 0x3_ Recording equipment faults
  0x30: "Recording equipment fault (unspecified)",
  0x31: "VU internal fault",
  0x32: "Printer fault",
  0x33: "Display fault",
  0x34: "Downloading fault",
  0x35: "Sensor fault",
  0x36: "Internal GNSS receiver fault",
  0x37: "External GNSS facility fault",
  0x38: "Remote communication facility fault",
  0x39: "ITS interface fault",
  0x3a: "Internal sensor data fault",

  // 0x4_ Card faults
  0x40: "Card fault (unspecified)",
  0x41: "Card fault",
};

export function eventTypeLabel(code: number): string {
  return TYPES[code] ?? `Unknown (0x${code.toString(16).padStart(2, "0")})`;
}

export function eventCategory(
  code: number,
): "general" | "security" | "fault" | "card-fault" | "other" {
  if (code <= 0x0f) return "general";
  if (code <= 0x2f) return "security";
  if (code <= 0x3f) return "fault";
  if (code <= 0x4f) return "card-fault";
  return "other";
}

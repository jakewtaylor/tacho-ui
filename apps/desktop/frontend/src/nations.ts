// NationNumeric → country name, per Commission Regulation (EC) 1360/2002
// Annex IB §2.72 (the canonical value-list 2016/799 Annex IC App. 1 §2.100
// defers to). The list runs 0..0x33 (51) with 0x34..0xFC marked "RFU";
// special codes 0xFD–0xFF cover supranational / unspecified categories.
//
// Codes >= 52 are post-2002 additions maintained by the JRC laboratory
// (Annex IC §2.100 refers to "the list maintained on the website of the
// laboratory appointed to carry out interoperability testing"). They
// don't appear in our sample card; values below are best-effort from
// public references and may need verification if a real card surfaces
// one.

const NATIONS: Record<number, { name: string; alpha: string }> = {
  0: { name: "No country", alpha: "—" },
  1: { name: "Austria", alpha: "A" },
  2: { name: "Albania", alpha: "AL" },
  3: { name: "Andorra", alpha: "AND" },
  4: { name: "Armenia", alpha: "AM" },
  5: { name: "Azerbaijan", alpha: "AZ" },
  6: { name: "Belgium", alpha: "B" },
  7: { name: "Bulgaria", alpha: "BG" },
  8: { name: "Bosnia and Herzegovina", alpha: "BIH" },
  9: { name: "Belarus", alpha: "BY" },
  10: { name: "Switzerland", alpha: "CH" },
  11: { name: "Cyprus", alpha: "CY" },
  12: { name: "Czech Republic", alpha: "CZ" },
  13: { name: "Germany", alpha: "D" },
  14: { name: "Denmark", alpha: "DK" },
  15: { name: "Spain", alpha: "E" },
  16: { name: "Estonia", alpha: "EST" },
  17: { name: "France", alpha: "F" },
  18: { name: "Finland", alpha: "FIN" },
  19: { name: "Liechtenstein", alpha: "FL" },
  20: { name: "Faeroe Islands", alpha: "FR" },
  21: { name: "United Kingdom", alpha: "GB" },
  22: { name: "Georgia", alpha: "GE" },
  23: { name: "Greece", alpha: "GR" },
  24: { name: "Hungary", alpha: "H" },
  25: { name: "Croatia", alpha: "HR" },
  26: { name: "Italy", alpha: "I" },
  27: { name: "Ireland", alpha: "IRL" },
  28: { name: "Iceland", alpha: "IS" },
  29: { name: "Kazakhstan", alpha: "KZ" },
  30: { name: "Luxembourg", alpha: "L" },
  31: { name: "Lithuania", alpha: "LT" },
  32: { name: "Latvia", alpha: "LV" },
  33: { name: "Malta", alpha: "M" },
  34: { name: "Monaco", alpha: "MC" },
  35: { name: "Republic of Moldova", alpha: "MD" },
  36: { name: "North Macedonia", alpha: "MK" },
  37: { name: "Norway", alpha: "N" },
  38: { name: "Netherlands", alpha: "NL" },
  39: { name: "Portugal", alpha: "P" },
  40: { name: "Poland", alpha: "PL" },
  41: { name: "Romania", alpha: "RO" },
  42: { name: "San Marino", alpha: "RSM" },
  43: { name: "Russian Federation", alpha: "RUS" },
  44: { name: "Sweden", alpha: "S" },
  45: { name: "Slovakia", alpha: "SK" },
  46: { name: "Slovenia", alpha: "SLO" },
  47: { name: "Turkmenistan", alpha: "TM" },
  48: { name: "Turkey", alpha: "TR" },
  49: { name: "Ukraine", alpha: "UA" },
  50: { name: "Vatican City", alpha: "V" },
  51: { name: "Yugoslavia / Serbia", alpha: "YU" },
  // Post-2002 JRC additions (codes >= 52). Best-effort, not validated
  // against a real card.
  52: { name: "Montenegro", alpha: "MNE" },
  53: { name: "Serbia", alpha: "SRB" },
  54: { name: "Tajikistan", alpha: "TJ" },
  55: { name: "Uzbekistan", alpha: "UZ" },
  56: { name: "Kyrgyzstan", alpha: "KS" },
  0xfd: { name: "European Community", alpha: "EC" },
  0xfe: { name: "Rest of Europe", alpha: "EUR" },
  0xff: { name: "Rest of World", alpha: "WLD" },
};

export function nationName(code: number | null | undefined): string {
  if (code == null) return "—";
  return NATIONS[code]?.name ?? `Country ${code}`;
}

export function nationAlpha(code: number | null | undefined): string {
  if (code == null) return "—";
  return NATIONS[code]?.alpha ?? String(code);
}

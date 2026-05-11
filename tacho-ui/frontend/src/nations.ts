// NationNumeric → country name, per EU Regulation 2016/799 Annex IC Appendix 1
// section 2.101. Confirmed against our sample: card driving_licence_issuing_authority
// is "DVLA" (UK) with nation code 21 → United Kingdom.
//
// Special codes (0xFD–0xFF) cover supranational / unspecified categories.

const NATIONS: Record<number, { name: string; alpha: string }> = {
  0: { name: 'No country', alpha: '—' },
  1: { name: 'Austria', alpha: 'A' },
  2: { name: 'Albania', alpha: 'AL' },
  3: { name: 'Andorra', alpha: 'AND' },
  4: { name: 'Armenia', alpha: 'AM' },
  5: { name: 'Azerbaijan', alpha: 'AZ' },
  6: { name: 'Belgium', alpha: 'B' },
  7: { name: 'Bulgaria', alpha: 'BG' },
  8: { name: 'Bosnia and Herzegovina', alpha: 'BIH' },
  9: { name: 'Belarus', alpha: 'BY' },
  10: { name: 'Switzerland', alpha: 'CH' },
  11: { name: 'Cyprus', alpha: 'CY' },
  12: { name: 'Czech Republic', alpha: 'CZ' },
  13: { name: 'Germany', alpha: 'D' },
  14: { name: 'Denmark', alpha: 'DK' },
  15: { name: 'Spain', alpha: 'E' },
  16: { name: 'Estonia', alpha: 'EST' },
  17: { name: 'France', alpha: 'F' },
  18: { name: 'Finland', alpha: 'FIN' },
  19: { name: 'Liechtenstein', alpha: 'FL' },
  20: { name: 'Faroe Islands', alpha: 'FR' },
  21: { name: 'United Kingdom', alpha: 'GB' },
  22: { name: 'Georgia', alpha: 'GE' },
  23: { name: 'Greece', alpha: 'GR' },
  24: { name: 'Hungary', alpha: 'H' },
  25: { name: 'Croatia', alpha: 'HR' },
  26: { name: 'Italy', alpha: 'I' },
  27: { name: 'Ireland', alpha: 'IRL' },
  28: { name: 'Iceland', alpha: 'IS' },
  29: { name: 'Kazakhstan', alpha: 'KZ' },
  30: { name: 'Luxembourg', alpha: 'L' },
  31: { name: 'Lithuania', alpha: 'LT' },
  32: { name: 'Latvia', alpha: 'LV' },
  33: { name: 'Malta', alpha: 'M' },
  34: { name: 'Republic of Moldova', alpha: 'MD' },
  35: { name: 'North Macedonia', alpha: 'MK' },
  36: { name: 'Norway', alpha: 'N' },
  37: { name: 'Netherlands', alpha: 'NL' },
  38: { name: 'Portugal', alpha: 'P' },
  39: { name: 'Poland', alpha: 'PL' },
  40: { name: 'Romania', alpha: 'RO' },
  41: { name: 'San Marino', alpha: 'RSM' },
  42: { name: 'Russian Federation', alpha: 'RUS' },
  43: { name: 'Sweden', alpha: 'S' },
  44: { name: 'Slovakia', alpha: 'SK' },
  45: { name: 'Slovenia', alpha: 'SLO' },
  46: { name: 'Turkmenistan', alpha: 'TM' },
  47: { name: 'Turkey', alpha: 'TR' },
  48: { name: 'Ukraine', alpha: 'UA' },
  49: { name: 'Vatican City', alpha: 'V' },
  50: { name: 'Yugoslavia', alpha: 'YU' },
  51: { name: 'Serbia', alpha: 'SRB' },
  52: { name: 'Montenegro', alpha: 'MNE' },
  53: { name: 'Tajikistan', alpha: 'TJ' },
  54: { name: 'Uzbekistan', alpha: 'UZ' },
  55: { name: 'Kyrgyzstan', alpha: 'KS' },
  0xfd: { name: 'European Community', alpha: 'EC' },
  0xfe: { name: 'Rest of Europe', alpha: 'EUR' },
  0xff: { name: 'Rest of World', alpha: 'WLD' },
};

export function nationName(code: number | null | undefined): string {
  if (code == null) return '—';
  return NATIONS[code]?.name ?? `Country ${code}`;
}

export function nationAlpha(code: number | null | undefined): string {
  if (code == null) return '—';
  return NATIONS[code]?.alpha ?? String(code);
}

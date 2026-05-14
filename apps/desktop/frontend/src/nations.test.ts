import { describe, expect, it } from "vitest";

import { nationAlpha, nationName } from "./nations";

// Regression: the table used to be off-by-one starting at 34, conflating
// Monaco/Moldova/Macedonia/Norway/Netherlands/Portugal/Poland etc. Anchor
// the codes that appear in real sample data so a future re-shuffle of
// the list (e.g. when adding JRC additions above 51) gets flagged.

describe("nations.ts (Reg. 1360/2002 §2.72 canonical list)", () => {
  it.each([
    [0, "No country", "—"],
    [6, "Belgium", "B"],
    [13, "Germany", "D"],
    [17, "France", "F"],
    [21, "United Kingdom", "GB"],
    [26, "Italy", "I"],
    // The off-by-one regression block:
    [33, "Malta", "M"],
    [34, "Monaco", "MC"],
    [35, "Republic of Moldova", "MD"],
    [36, "North Macedonia", "MK"],
    [37, "Norway", "N"],
    [38, "Netherlands", "NL"],
    [39, "Portugal", "P"],
    [40, "Poland", "PL"],
    // Tail of the canonical list:
    [50, "Vatican City", "V"],
    [51, "Yugoslavia / Serbia", "YU"],
    // Special supranational codes:
    [0xfd, "European Community", "EC"],
    [0xfe, "Rest of Europe", "EUR"],
    [0xff, "Rest of World", "WLD"],
  ])("code %i decodes to %s (%s)", (code, name, alpha) => {
    expect(nationName(code)).toBe(name);
    expect(nationAlpha(code)).toBe(alpha);
  });

  it("falls back to 'Country N' for unknown codes", () => {
    expect(nationName(200)).toBe("Country 200");
    expect(nationAlpha(200)).toBe("200");
  });

  it("returns em-dash for null / undefined", () => {
    expect(nationName(null)).toBe("—");
    expect(nationName(undefined)).toBe("—");
    expect(nationAlpha(null)).toBe("—");
  });
});

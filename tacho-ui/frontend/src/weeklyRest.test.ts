import { describe, expect, it } from "vitest";

import type { ActivityChange, DailyRecord } from "./activity";
import {
  assessWeeklyRest,
  dataWindow,
  extractAmbiguousSpans,
  extractPossibleRestSpans,
  extractRestSpans,
} from "./weeklyRest";
import type { WeekBucket } from "./weeks";

function ev(
  minutes: number,
  work_type: number,
  card_present = true,
): ActivityChange {
  return { driver: true, team: false, card_present, work_type, minutes };
}

function record(date: string, changes: ActivityChange[]): DailyRecord {
  return {
    activity_record_date: `${date}T00:00:00Z`,
    activity_day_distance: 0,
    activity_change_info: changes,
  };
}

// A week bucket is mostly metadata; assessWeeklyRest only reads weekStart / weekEnd.
function week(weekStart: string, weekEnd: string): WeekBucket {
  return {
    weekStart,
    weekEnd,
    days: [null, null, null, null, null, null, null],
    rollup: {
      days: 0,
      daysWithDriving: 0,
      totalDrivingMin: 0,
      totalWorkMin: 0,
      totalRestMin: 0,
      totalDistanceKm: 0,
      daysOverLimit: 0,
    },
  };
}

describe("extractRestSpans", () => {
  it("merges consecutive rest across a day boundary", () => {
    // Sat 18:00 → end of Sat = 6h. Sun 00:00 → Sun 23:59 → end of day = 24h.
    // Mon 00:00 → Mon 09:00 = 9h. Total ~39h continuous rest.
    const records = [
      // Sat: drive then rest after 18:00.
      record("2026-05-02", [ev(0, 3), ev(18 * 60, 0)]),
      // Sun: rest all day.
      record("2026-05-03", [ev(0, 0)]),
      // Mon: rest until 09:00 then drive.
      record("2026-05-04", [ev(0, 0), ev(9 * 60, 3)]),
    ];
    const spans = extractRestSpans(records);
    expect(spans).toHaveLength(1);
    expect(spans[0].durationMin).toBe(6 * 60 + 24 * 60 + 9 * 60);
  });

  it("breaks the chain on driving", () => {
    // Rest from 00:00 → 12:00, drive 12:00 → 13:00, rest 13:00 → 24:00.
    const records = [
      record("2026-05-01", [ev(0, 0), ev(12 * 60, 3), ev(13 * 60, 0)]),
    ];
    const spans = extractRestSpans(records);
    expect(spans).toHaveLength(2);
    expect(spans[0].durationMin).toBe(12 * 60);
    expect(spans[1].durationMin).toBe(11 * 60);
  });

  it("does not treat availability as rest", () => {
    const records = [record("2026-05-01", [ev(0, 1)])];
    expect(extractRestSpans(records)).toHaveLength(0);
  });

  it("ignores card-not-inserted segments (covered by extractAmbiguousSpans)", () => {
    const records = [record("2026-05-01", [ev(0, 0, false)])];
    expect(extractRestSpans(records)).toHaveLength(0);
    expect(extractAmbiguousSpans(records)).toHaveLength(1);
  });
});

describe("extractPossibleRestSpans", () => {
  it("includes contiguous card-not-inserted minutes as possible rest", () => {
    // Rest 00:00 → 06:00 (verified), card out 06:00 → 18:00, rest 18:00 → EOD.
    const records = [
      record("2026-05-01", [
        ev(0, 0, true),
        ev(360, 0, false),
        ev(18 * 60, 0, true),
      ]),
    ];
    const possible = extractPossibleRestSpans(records);
    expect(possible).toHaveLength(1);
    expect(possible[0].durationMin).toBe(24 * 60);
  });
});

describe("assessWeeklyRest", () => {
  const w = week("2026-05-03", "2026-05-09"); // Sun → Sat

  function span(startIso: string, endIso: string) {
    const startMs = Date.parse(startIso);
    const endMs = Date.parse(endIso);
    return {
      start: startIso,
      end: endIso,
      startMs,
      endMs,
      durationMin: Math.round((endMs - startMs) / 60000),
    };
  }

  it("qualifies regular when a ≥45h verified rest overlaps the week", () => {
    const rest = span("2026-05-08T00:00:00Z", "2026-05-10T00:00:00Z"); // 48h
    const win = {
      startMs: Date.parse("2026-05-01"),
      endMs: Date.parse("2026-05-15"),
    };
    const r = assessWeeklyRest(w, [rest], [rest], [], win);
    expect(r.qualifiesRegular).toBe(true);
    expect(r.qualifiesReduced).toBe(false);
    expect(r.missing).toBe(false);
    expect(r.inconclusive).toBe(false);
    expect(r.longestRest?.durationMin).toBe(48 * 60);
  });

  it("qualifies reduced when 24–45h verified rest is the best on offer", () => {
    const rest = span("2026-05-08T00:00:00Z", "2026-05-09T06:00:00Z"); // 30h
    const win = {
      startMs: Date.parse("2026-05-01"),
      endMs: Date.parse("2026-05-15"),
    };
    const r = assessWeeklyRest(w, [rest], [rest], [], win);
    expect(r.qualifiesReduced).toBe(true);
    expect(r.qualifiesRegular).toBe(false);
    expect(r.missing).toBe(false);
  });

  it("reports missing when there is no rest and no plausible card-out gap", () => {
    const win = {
      startMs: Date.parse("2026-05-01"),
      endMs: Date.parse("2026-05-15"),
    };
    const r = assessWeeklyRest(w, [], [], [], win);
    expect(r.missing).toBe(true);
    expect(r.inconclusive).toBe(false);
  });

  it("reports inconclusive when a card-not-inserted gap could have contained a rest", () => {
    const possible = span("2026-05-08T00:00:00Z", "2026-05-09T06:00:00Z"); // 30h ambiguous
    const win = {
      startMs: Date.parse("2026-05-01"),
      endMs: Date.parse("2026-05-15"),
    };
    const r = assessWeeklyRest(w, [], [possible], [possible], win);
    expect(r.missing).toBe(false);
    expect(r.inconclusive).toBe(true);
    expect(r.longestPossibleRest?.durationMin).toBe(30 * 60);
  });

  it("reports inconclusive when the data window doesn't fully cover the week", () => {
    // Week is May 3–9; data only goes through May 6.
    const win = {
      startMs: Date.parse("2026-05-01"),
      endMs: Date.parse("2026-05-07"),
    };
    const r = assessWeeklyRest(w, [], [], [], win);
    expect(r.inconclusive).toBe(true);
    expect(r.missing).toBe(false);
  });

  it("ignores rest spans shorter than 24h", () => {
    const short = span("2026-05-08T00:00:00Z", "2026-05-08T20:00:00Z"); // 20h
    const win = {
      startMs: Date.parse("2026-05-01"),
      endMs: Date.parse("2026-05-15"),
    };
    const r = assessWeeklyRest(w, [short], [short], [], win);
    expect(r.longestRest).toBeNull();
    expect(r.missing).toBe(true);
  });
});

describe("dataWindow", () => {
  it("returns null for an empty record set", () => {
    expect(dataWindow([])).toBeNull();
  });

  it("spans first record's start to last record's end-of-day", () => {
    const records = [
      record("2026-05-01", [ev(0, 0)]),
      record("2026-05-03", [ev(0, 0)]),
    ];
    const w = dataWindow(records);
    expect(w).not.toBeNull();
    expect(w!.startMs).toBe(Date.parse("2026-05-01T00:00:00Z"));
    expect(w!.endMs).toBe(Date.parse("2026-05-04T00:00:00Z"));
  });
});

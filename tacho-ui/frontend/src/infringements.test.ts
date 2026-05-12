import { describe, expect, it } from "vitest";

import type { DailyRecord, DailyStats, DayDetail } from "./activity";
import {
  countInfringements,
  detectDayInfringements,
  detectWeekInfringements,
  sortInfringements,
} from "./infringements";
import type { Shift } from "./shifts";
import type { WeekBucket } from "./weeks";
import type { WeekRestAssessment } from "./weeklyRest";

function stats(overrides: Partial<DailyStats> = {}): DailyStats {
  return {
    date: "2026-05-01",
    distanceKm: 0,
    drivingMin: 0,
    workMin: 0,
    availableMin: 0,
    restMin: 0,
    cardNotInsertedMin: 0,
    overDailyLimit: false,
    wayOverDailyLimit: false,
    ...overrides,
  };
}

function detail(overrides: Partial<DayDetail> = {}): DayDetail {
  return {
    date: "2026-05-01",
    segments: [],
    drivingSessions: [],
    hasBreakBreach: false,
    ...overrides,
  };
}

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    date: "2026-05-01",
    startTime: "2026-05-01T06:00:00Z",
    endTime: "2026-05-01T18:00:00Z",
    startCountry: 0,
    endCountry: 0,
    startOdometer: 0,
    endOdometer: 0,
    distanceKm: 0,
    restBeforeMin: null,
    shortRest: false,
    ...overrides,
  };
}

function weekBucket(overrides: Partial<WeekBucket> = {}): WeekBucket {
  return {
    weekStart: "2026-05-03",
    weekEnd: "2026-05-09",
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
    ...overrides,
  };
}

function rest(overrides: Partial<WeekRestAssessment> = {}): WeekRestAssessment {
  return {
    longestRest: null,
    longestPossibleRest: null,
    ambiguousMin: 0,
    qualifiesRegular: false,
    qualifiesReduced: false,
    missing: false,
    inconclusive: false,
    ...overrides,
  };
}

describe("detectDayInfringements", () => {
  it("flags continuous-driving breach from a session marked breachedContinuous", () => {
    const items = detectDayInfringements({
      stats: stats(),
      detail: detail({
        hasBreakBreach: true,
        drivingSessions: [
          {
            startMin: 360,
            endMin: 360 + 280,
            drivingMin: 280,
            followingBreakMin: 0,
            firstBreakMin: null,
            secondBreakMin: null,
            breachedContinuous: true,
          },
        ],
      }),
    });
    expect(items.some((i) => i.code === "CONTINUOUS_DRIVING")).toBe(true);
    expect(items.find((i) => i.code === "CONTINUOUS_DRIVING")?.severity).toBe(
      "breach",
    );
  });

  it("flags daily driving over 10h as a breach", () => {
    const items = detectDayInfringements({
      stats: stats({
        drivingMin: 10 * 60 + 30,
        overDailyLimit: true,
        wayOverDailyLimit: true,
      }),
      detail: detail(),
    });
    expect(items.some((i) => i.code === "DAILY_DRIVING_HARD")).toBe(true);
  });

  it("flags daily driving 9–10h as info (extension)", () => {
    const items = detectDayInfringements({
      stats: stats({ drivingMin: 9 * 60 + 30, overDailyLimit: true }),
      detail: detail(),
    });
    const ext = items.find((i) => i.code === "DAILY_DRIVING_EXTENDED");
    expect(ext?.severity).toBe("info");
  });

  it("flags pre-shift rest < 9h as a breach", () => {
    const items = detectDayInfringements({
      stats: stats(),
      detail: detail(),
      shift: shift({ restBeforeMin: 8 * 60 }),
    });
    expect(items.some((i) => i.code === "DAILY_REST_INSUFFICIENT")).toBe(true);
  });

  it("flags pre-shift rest 9–11h as info (reduced)", () => {
    const items = detectDayInfringements({
      stats: stats(),
      detail: detail(),
      shift: shift({ restBeforeMin: 10 * 60 }),
    });
    const reduced = items.find((i) => i.code === "DAILY_REST_REDUCED");
    expect(reduced?.severity).toBe("info");
  });

  it("returns nothing for a clean day", () => {
    const items = detectDayInfringements({
      stats: stats({ drivingMin: 8 * 60 }),
      detail: detail(),
      shift: shift({ restBeforeMin: 12 * 60 }),
    });
    expect(items).toHaveLength(0);
  });
});

describe("detectWeekInfringements", () => {
  const emptyMaps = {
    recordsByDate: new Map<string, DailyRecord>(),
    shiftsByDate: new Map<string, Shift>(),
  };

  it("flags weekly driving over 56h", () => {
    const items = detectWeekInfringements({
      week: weekBucket({
        rollup: {
          days: 7,
          daysWithDriving: 6,
          totalDrivingMin: 57 * 60,
          totalWorkMin: 0,
          totalRestMin: 0,
          totalDistanceKm: 0,
          daysOverLimit: 0,
        },
      }),
      ...emptyMaps,
    });
    expect(items.some((i) => i.code === "WEEKLY_DRIVING")).toBe(true);
  });

  it("flags fortnightly driving over 90h across consecutive weeks", () => {
    const items = detectWeekInfringements({
      week: weekBucket({
        rollup: {
          ...weekBucket().rollup,
          totalDrivingMin: 46 * 60,
        },
      }),
      prevWeek: weekBucket({
        rollup: {
          ...weekBucket().rollup,
          totalDrivingMin: 46 * 60,
        },
      }),
      ...emptyMaps,
    });
    expect(items.some((i) => i.code === "FORTNIGHTLY_DRIVING")).toBe(true);
  });

  it("flags 3+ extension days as a breach", () => {
    const day = (date: string) =>
      stats({ date, drivingMin: 9 * 60 + 30, overDailyLimit: true });
    const items = detectWeekInfringements({
      week: weekBucket({
        days: [
          day("2026-05-03"),
          day("2026-05-04"),
          day("2026-05-05"),
          null,
          null,
          null,
          null,
        ],
      }),
      ...emptyMaps,
    });
    expect(items.some((i) => i.code === "TOO_MANY_EXTENSIONS")).toBe(true);
    expect(items.find((i) => i.code === "TOO_MANY_EXTENSIONS")?.severity).toBe(
      "breach",
    );
  });

  it("surfaces 1–2 extension days as info", () => {
    const day = stats({
      date: "2026-05-03",
      drivingMin: 9 * 60 + 30,
      overDailyLimit: true,
    });
    const items = detectWeekInfringements({
      week: weekBucket({
        days: [day, null, null, null, null, null, null],
      }),
      ...emptyMaps,
    });
    expect(items.find((i) => i.code === "EXTENSION_USED")?.severity).toBe(
      "info",
    );
  });

  it("flags weekly rest missing as a breach", () => {
    const items = detectWeekInfringements({
      week: weekBucket(),
      ...emptyMaps,
      weeklyRest: rest({ missing: true }),
    });
    expect(items.find((i) => i.code === "WEEKLY_REST_MISSING")?.severity).toBe(
      "breach",
    );
  });

  it("flags reduced weekly rest as info", () => {
    const items = detectWeekInfringements({
      week: weekBucket(),
      ...emptyMaps,
      weeklyRest: rest({
        qualifiesReduced: true,
        longestRest: {
          start: "2026-05-08T00:00:00Z",
          end: "2026-05-09T06:00:00Z",
          startMs: Date.parse("2026-05-08"),
          endMs: Date.parse("2026-05-09T06:00:00Z"),
          durationMin: 30 * 60,
        },
      }),
    });
    expect(items.find((i) => i.code === "WEEKLY_REST_REDUCED")?.severity).toBe(
      "info",
    );
  });

  it("surfaces an inconclusive verdict as info", () => {
    const items = detectWeekInfringements({
      week: weekBucket(),
      ...emptyMaps,
      weeklyRest: rest({ inconclusive: true }),
    });
    expect(
      items.find((i) => i.code === "WEEKLY_REST_INCONCLUSIVE")?.severity,
    ).toBe("info");
  });
});

describe("countInfringements / sortInfringements", () => {
  it("counts by severity and totals", () => {
    const c = countInfringements([
      { code: "a", severity: "breach", title: "", description: "" },
      { code: "b", severity: "breach", title: "", description: "" },
      { code: "c", severity: "info", title: "", description: "" },
    ]);
    expect(c).toEqual({ breach: 2, warning: 0, info: 1, total: 3 });
  });

  it("sorts breaches before warnings before info, then by date", () => {
    const sorted = sortInfringements([
      { code: "x", severity: "info", title: "", description: "" },
      {
        code: "y",
        severity: "breach",
        title: "",
        description: "",
        date: "2026-05-02",
      },
      {
        code: "z",
        severity: "breach",
        title: "",
        description: "",
        date: "2026-05-01",
      },
    ]);
    expect(sorted.map((i) => i.code)).toEqual(["z", "y", "x"]);
  });
});

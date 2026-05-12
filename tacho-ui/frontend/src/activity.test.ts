import { describe, expect, it } from "vitest";

import {
  computeDailyStats,
  computeDayDetail,
  Thresholds,
  type ActivityChange,
  type DailyRecord,
} from "./activity";

// Tiny builder for an activity_change_info event.
function ev(
  minutes: number,
  work_type: number,
  card_present = true,
): ActivityChange {
  return { driver: true, team: false, card_present, work_type, minutes };
}

function record(
  date: string,
  changes: ActivityChange[],
  distance = 0,
): DailyRecord {
  return {
    activity_record_date: `${date}T00:00:00Z`,
    activity_day_distance: distance,
    activity_change_info: changes,
  };
}

describe("computeDailyStats", () => {
  it("buckets minutes by work_type", () => {
    // 00:00 rest, 06:00 driving, 12:00 work, 14:00 available, 18:00 rest (until 24:00)
    const r = record("2026-05-01", [
      ev(0, 0),
      ev(360, 3),
      ev(720, 2),
      ev(840, 1),
      ev(1080, 0),
    ]);
    const s = computeDailyStats(r);
    expect(s.drivingMin).toBe(6 * 60);
    expect(s.workMin).toBe(2 * 60);
    expect(s.availableMin).toBe(4 * 60);
    expect(s.restMin).toBe(6 * 60 + 6 * 60); // first 6h + last 6h
    expect(s.cardNotInsertedMin).toBe(0);
  });

  it("excludes card-not-inserted time from work/rest buckets", () => {
    // 00:00 driving, 06:00 card out, 12:00 card back in driving, 18:00 rest
    const r = record("2026-05-01", [
      ev(0, 3, true),
      ev(360, 3, false),
      ev(720, 3, true),
      ev(1080, 0, true),
    ]);
    const s = computeDailyStats(r);
    expect(s.cardNotInsertedMin).toBe(6 * 60);
    expect(s.drivingMin).toBe(12 * 60); // 6h + 6h
    expect(s.restMin).toBe(6 * 60);
  });

  it("flags the 9h and 10h daily driving thresholds", () => {
    const justOver9 = computeDailyStats(
      record("2026-05-01", [ev(0, 3), ev(9 * 60 + 1, 0)]),
    );
    expect(justOver9.overDailyLimit).toBe(true);
    expect(justOver9.wayOverDailyLimit).toBe(false);

    const justOver10 = computeDailyStats(
      record("2026-05-01", [ev(0, 3), ev(10 * 60 + 1, 0)]),
    );
    expect(justOver10.overDailyLimit).toBe(true);
    expect(justOver10.wayOverDailyLimit).toBe(true);
  });
});

describe("computeDayDetail break compliance", () => {
  it("closes a session on a single ≥45-min rest", () => {
    // 06:00 drive 4h, 10:00 rest 45m, 10:45 work to EOD.
    const d = computeDayDetail(
      record("2026-05-01", [ev(360, 3), ev(600, 0), ev(645, 2)]),
    );
    expect(d.drivingSessions).toHaveLength(1);
    expect(d.drivingSessions[0].drivingMin).toBe(4 * 60);
    expect(d.drivingSessions[0].followingBreakMin).toBe(45);
    expect(d.drivingSessions[0].firstBreakMin).toBeNull();
    expect(d.drivingSessions[0].secondBreakMin).toBeNull();
    expect(d.hasBreakBreach).toBe(false);
  });

  it("closes a session on a 15+30 split with intervening work/driving", () => {
    // 06:00 drive 2h → 08:00 rest 15m → 08:15 drive 2h → 10:15 rest 30m → trailing non-rest.
    // First break (15) recorded; second break (30) completes the split.
    // Trailing event is work so no new session opens.
    const d = computeDayDetail(
      record("2026-05-01", [
        ev(360, 3),
        ev(480, 0),
        ev(495, 3),
        ev(615, 0),
        ev(645, 2),
      ]),
    );
    expect(d.drivingSessions).toHaveLength(1);
    const closed = d.drivingSessions[0];
    expect(closed.firstBreakMin).toBe(15);
    expect(closed.secondBreakMin).toBe(30);
    expect(closed.followingBreakMin).toBe(45);
    expect(d.hasBreakBreach).toBe(false);
  });

  it("flags a continuous-driving breach when 4h30m elapses without a qualifying break", () => {
    // 06:00 drive 4h31m straight, then trailing work — no qualifying break.
    const d = computeDayDetail(
      record("2026-05-01", [ev(360, 3), ev(360 + 271, 2)]),
    );
    expect(d.drivingSessions).toHaveLength(1);
    expect(d.drivingSessions[0].breachedContinuous).toBe(true);
    expect(d.hasBreakBreach).toBe(true);
  });

  it("does not treat availability (work_type 1) as a break", () => {
    // 06:00 drive 4h, 10:00 available 45m, 10:45 drive 1h. Availability is
    // NOT rest, so the session continues — but cumulative driving is 5h
    // which exceeds the 4h30m limit.
    const d = computeDayDetail(
      record("2026-05-01", [ev(360, 3), ev(600, 1), ev(645, 3), ev(705, 0)]),
    );
    expect(d.drivingSessions[0].breachedContinuous).toBe(true);
  });

  it("ignores a sub-15-minute rest as a potential first split", () => {
    // 06:00 drive 4h, 10:00 rest 14m, 10:14 drive 31m, 10:45 rest 30m.
    // The 14m rest doesn't qualify as a first-break; only the trailing 30m
    // sits as a candidate but with no first-break recorded.
    const d = computeDayDetail(
      record("2026-05-01", [ev(360, 3), ev(600, 0), ev(614, 3), ev(645, 0)]),
    );
    expect(d.drivingSessions[0].firstBreakMin).toBeNull();
    expect(d.drivingSessions[0].secondBreakMin).toBeNull();
  });

  it("requires 15-then-30 ordering — a 30 followed by a 15 does NOT complete a split", () => {
    // 06:00 drive 2h, 08:00 rest 30m, 08:30 drive 2h, 10:30 rest 15m.
    // Per the regulation the first break (recorded) is 30m, then we need a
    // subsequent ≥30 to close — a 15m can't close a split. So session stays
    // open.
    const d = computeDayDetail(
      record("2026-05-01", [
        ev(360, 3),
        ev(480, 0),
        ev(510, 3),
        ev(630, 0),
        ev(645, 2),
      ]),
    );
    // Session never closed by a qualifying break.
    expect(d.drivingSessions[0].followingBreakMin).toBe(0);
  });

  it("threshold constant is 4h30m", () => {
    expect(Thresholds.CONTINUOUS_DRIVING_MAX_MIN).toBe(270);
    expect(Thresholds.QUALIFYING_BREAK_MIN).toBe(45);
    expect(Thresholds.SPLIT_FIRST_MIN).toBe(15);
    expect(Thresholds.SPLIT_SECOND_MIN).toBe(30);
  });
});

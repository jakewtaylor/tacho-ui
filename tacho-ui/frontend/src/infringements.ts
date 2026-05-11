// Detection of EU 561/2006 driver-hours infringements from parsed tachograph data.
// Reference: https://www.gov.uk/drivers-hours/eu-rules
//
// Coverage:
//   - Daily driving > 9h (info: extension counts toward the weekly cap of 2)
//   - Daily driving > 10h (breach: hard limit)
//   - Continuous driving > 4h30m without a 45-min break (breach)
//   - Weekly driving > 56h (breach)
//   - Fortnightly driving > 90h across consecutive weeks (breach)
//   - More than two 10h extensions in a single week (breach)
//   - Daily rest before a shift < 9h (breach) / 9-11h (reduced, info)
//   - More than three reduced (9-11h) daily rests in a week (breach)
//
// Limitations (documented for honesty, not silently swallowed):
//   - Weekly rest (45h regular / 24h reduced and compensation) is NOT computed:
//     the necessary 24h+ continuous-rest analysis across day boundaries is
//     reliable only with full shift-pair data, which is incomplete on cards
//     that don't have matching open/close place_records.
//   - The 15+30 split-break rule is not modelled (matches existing
//     computeDayDetail behaviour). Two rests separated by work won't combine.
//   - The EU "fixed week" is Monday 00:00 → Sunday 24:00. This module uses
//     the displayed Sunday-starting bucket; the totals will differ from a
//     strict regulatory calculation when work straddles a Sun/Mon boundary.

import {
  computeDayDetail,
  formatClock,
  formatHours,
  Thresholds,
  type DailyRecord,
  type DailyStats,
  type DayDetail,
} from './activity';
import type { Shift } from './shifts';
import type { WeekBucket } from './weeks';
import type { WeekRestAssessment } from './weeklyRest';

export type Severity = 'breach' | 'warning' | 'info';

export type Infringement = {
  /** Stable code for tests/filtering. */
  code: string;
  severity: Severity;
  title: string;
  /** Plain-English explanation including the numbers that triggered the rule. */
  description: string;
  /** yyyy-mm-dd if the issue is anchored to a specific date. */
  date?: string;
  /** Regulation reference (EU 561/2006 article / gov.uk page section). */
  ruleRef?: string;
};

// EU 561/2006 limits.
const DAILY_DRIVING_LIMIT_MIN = 9 * 60;
const DAILY_DRIVING_HARD_LIMIT_MIN = 10 * 60;
const WEEKLY_DRIVING_LIMIT_MIN = 56 * 60;
const FORTNIGHTLY_DRIVING_LIMIT_MIN = 90 * 60;
const MAX_EXTENSIONS_PER_WEEK = 2;
const REGULAR_DAILY_REST_MIN = 11 * 60;
const REDUCED_DAILY_REST_MIN = 9 * 60;
const MAX_REDUCED_DAILY_RESTS_PER_WEEK = 3;

const REF_DAILY_DRIVE = 'EU 561/2006 Art. 6(1)';
const REF_WEEKLY_DRIVE = 'EU 561/2006 Art. 6(2)';
const REF_FORTNIGHTLY_DRIVE = 'EU 561/2006 Art. 6(3)';
const REF_BREAK = 'EU 561/2006 Art. 7';
const REF_DAILY_REST = 'EU 561/2006 Art. 8';
const REF_WEEKLY_REST = 'EU 561/2006 Art. 8(6)';

const SEVERITY_RANK: Record<Severity, number> = { breach: 0, warning: 1, info: 2 };

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

export function sortInfringements(items: Infringement[]): Infringement[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      (a.date ?? '').localeCompare(b.date ?? '') ||
      a.code.localeCompare(b.code)
  );
}

export type DayCtx = {
  stats: DailyStats;
  detail: DayDetail;
  /** The shift that started on this date, if any — used for daily-rest check. */
  shift?: Shift | null;
};

/** Detect infringements that can be evaluated from a single day's data. */
export function detectDayInfringements(ctx: DayCtx): Infringement[] {
  const { stats, detail, shift } = ctx;
  const out: Infringement[] = [];

  // 1. Continuous driving — breach when cumulative driving exceeded 4h 30m
  //    before either a single ≥45-min break or a 15+30 split break completed.
  for (const s of detail.drivingSessions) {
    if (!s.breachedContinuous) continue;
    const closingDesc = (() => {
      if (s.firstBreakMin != null && s.secondBreakMin != null) {
        return `eventually closed by a ${s.firstBreakMin}+${s.secondBreakMin}m split, but the break sequence completed after the 4h 30m limit was already exceeded`;
      }
      if (s.followingBreakMin >= Thresholds.QUALIFYING_BREAK_MIN) {
        return `eventually closed by a ${formatHours(s.followingBreakMin)} break, but only after the 4h 30m limit was already exceeded`;
      }
      return s.followingBreakMin > 0
        ? `following rest was ${formatHours(s.followingBreakMin)} — no qualifying single ≥45-min break or 15+30 split observed`
        : 'no qualifying break observed before the session ended';
    })();
    out.push({
      code: 'CONTINUOUS_DRIVING',
      severity: 'breach',
      title: 'Continuous driving over 4h 30m before a qualifying break',
      description: `${formatHours(s.drivingMin)} of driving from ${formatClock(
        s.startMin
      )} to ${formatClock(s.endMin)}; ${closingDesc}.`,
      date: stats.date,
      ruleRef: REF_BREAK,
    });
  }

  // 2. Daily driving limit.
  if (stats.drivingMin > DAILY_DRIVING_HARD_LIMIT_MIN) {
    out.push({
      code: 'DAILY_DRIVING_HARD',
      severity: 'breach',
      title: 'Daily driving over the 10h absolute limit',
      description: `${formatHours(stats.drivingMin)} of driving exceeds the 10h ceiling. The 9h daily limit may only be extended to 10h twice per week — never further.`,
      date: stats.date,
      ruleRef: REF_DAILY_DRIVE,
    });
  } else if (stats.drivingMin > DAILY_DRIVING_LIMIT_MIN) {
    out.push({
      code: 'DAILY_DRIVING_EXTENDED',
      severity: 'info',
      title: 'Daily driving extended (9–10h)',
      description: `${formatHours(stats.drivingMin)} of driving — uses one of the two 10h extensions permitted per week.`,
      date: stats.date,
      ruleRef: REF_DAILY_DRIVE,
    });
  }

  // 3. Daily rest before the shift that started on this date.
  if (shift && shift.restBeforeMin != null) {
    if (shift.restBeforeMin < REDUCED_DAILY_REST_MIN) {
      out.push({
        code: 'DAILY_REST_INSUFFICIENT',
        severity: 'breach',
        title: 'Daily rest under 9h before this shift',
        description: `Only ${formatHours(
          shift.restBeforeMin
        )} of rest before the shift started — below the 9h reduced minimum.`,
        date: stats.date,
        ruleRef: REF_DAILY_REST,
      });
    } else if (shift.restBeforeMin < REGULAR_DAILY_REST_MIN) {
      out.push({
        code: 'DAILY_REST_REDUCED',
        severity: 'info',
        title: 'Reduced daily rest (9–11h)',
        description: `${formatHours(
          shift.restBeforeMin
        )} of rest before this shift — counts as a reduced daily rest (max 3 between weekly rests).`,
        date: stats.date,
        ruleRef: REF_DAILY_REST,
      });
    }
  }

  return sortInfringements(out);
}

export type WeekCtx = {
  week: WeekBucket;
  /** The week immediately before this one (for the 90h fortnightly check). */
  prevWeek?: WeekBucket | null;
  /** Records by yyyy-mm-dd — used to recompute DayDetail for break/shift checks. */
  recordsByDate: Map<string, DailyRecord>;
  /** Shifts indexed by their start-date (yyyy-mm-dd) — used for daily-rest counts. */
  shiftsByDate: Map<string, Shift>;
  /** Pre-computed weekly-rest assessment for this week. Optional. */
  weeklyRest?: WeekRestAssessment | null;
};

function formatDateTime(iso: string): string {
  return iso.replace('T', ' ').replace('Z', '').slice(0, 16);
}

/** Detect infringements visible at the weekly bucket level. */
export function detectWeekInfringements(ctx: WeekCtx): Infringement[] {
  const { week, prevWeek, recordsByDate, shiftsByDate, weeklyRest } = ctx;
  const out: Infringement[] = [];

  const presentDays = week.days.filter((d): d is DailyStats => d != null);

  // 1. Weekly driving total.
  if (week.rollup.totalDrivingMin > WEEKLY_DRIVING_LIMIT_MIN) {
    out.push({
      code: 'WEEKLY_DRIVING',
      severity: 'breach',
      title: 'Weekly driving over 56h',
      description: `${formatHours(
        week.rollup.totalDrivingMin
      )} of driving this week — over the 56h weekly maximum.`,
      ruleRef: REF_WEEKLY_DRIVE,
    });
  }

  // 2. Fortnightly driving.
  if (prevWeek) {
    const total = week.rollup.totalDrivingMin + prevWeek.rollup.totalDrivingMin;
    if (total > FORTNIGHTLY_DRIVING_LIMIT_MIN) {
      out.push({
        code: 'FORTNIGHTLY_DRIVING',
        severity: 'breach',
        title: 'Fortnightly driving over 90h',
        description: `${formatHours(total)} driven across this week and the previous one (${formatHours(
          prevWeek.rollup.totalDrivingMin
        )} + ${formatHours(week.rollup.totalDrivingMin)}) — over the 90h two-week maximum.`,
        ruleRef: REF_FORTNIGHTLY_DRIVE,
      });
    }
  }

  // 3. Days over the 10h hard limit.
  for (const d of presentDays) {
    if (d.wayOverDailyLimit) {
      out.push({
        code: 'DAILY_DRIVING_HARD',
        severity: 'breach',
        title: `Daily driving over 10h on ${d.date}`,
        description: `${formatHours(d.drivingMin)} of driving — over the absolute 10h daily ceiling.`,
        date: d.date,
        ruleRef: REF_DAILY_DRIVE,
      });
    }
  }

  // 4. Too many 10h extension days in this week.
  const extensionDays = presentDays.filter((d) => d.overDailyLimit && !d.wayOverDailyLimit);
  if (extensionDays.length > MAX_EXTENSIONS_PER_WEEK) {
    out.push({
      code: 'TOO_MANY_EXTENSIONS',
      severity: 'breach',
      title: `${extensionDays.length} days over 9h driving (max ${MAX_EXTENSIONS_PER_WEEK} per week)`,
      description: `Driving exceeded 9h on ${extensionDays.length} days this week: ${extensionDays
        .map((d) => d.date)
        .join(', ')}. Only ${MAX_EXTENSIONS_PER_WEEK} such extensions are permitted per week.`,
      ruleRef: REF_DAILY_DRIVE,
    });
  } else if (extensionDays.length > 0) {
    const remaining = MAX_EXTENSIONS_PER_WEEK - extensionDays.length;
    out.push({
      code: 'EXTENSION_USED',
      severity: 'info',
      title: `${extensionDays.length} day${extensionDays.length === 1 ? '' : 's'} used a 10h extension`,
      description: `Driving was 9–10h on: ${extensionDays
        .map((d) => d.date)
        .join(', ')}. ${remaining} extension${remaining === 1 ? '' : 's'} remaining this week.`,
      ruleRef: REF_DAILY_DRIVE,
    });
  }

  // 5. Continuous-driving break breaches across the week.
  const breachDays: string[] = [];
  for (const d of presentDays) {
    const rec = recordsByDate.get(d.date);
    if (!rec) continue;
    const det = computeDayDetail(rec);
    if (det.hasBreakBreach) breachDays.push(d.date);
  }
  if (breachDays.length > 0) {
    out.push({
      code: 'CONTINUOUS_DRIVING_WEEK',
      severity: 'breach',
      title: `${breachDays.length} day${breachDays.length === 1 ? '' : 's'} with continuous-driving breach`,
      description: `Driving exceeded 4h 30m without a 45-min break on: ${breachDays.join(', ')}.`,
      ruleRef: REF_BREAK,
    });
  }

  // 6. Daily-rest counts across the week.
  const restShort: string[] = [];
  const restReduced: string[] = [];
  for (const d of presentDays) {
    const shift = shiftsByDate.get(d.date);
    if (!shift || shift.restBeforeMin == null) continue;
    if (shift.restBeforeMin < REDUCED_DAILY_REST_MIN) {
      restShort.push(d.date);
    } else if (shift.restBeforeMin < REGULAR_DAILY_REST_MIN) {
      restReduced.push(d.date);
    }
  }
  for (const date of restShort) {
    out.push({
      code: 'DAILY_REST_INSUFFICIENT',
      severity: 'breach',
      title: `Daily rest under 9h before shift on ${date}`,
      description: `Pre-shift rest fell below the 9h reduced minimum on ${date}.`,
      date,
      ruleRef: REF_DAILY_REST,
    });
  }
  if (restReduced.length > MAX_REDUCED_DAILY_RESTS_PER_WEEK) {
    out.push({
      code: 'TOO_MANY_REDUCED_RESTS',
      severity: 'breach',
      title: `${restReduced.length} reduced daily rests (max ${MAX_REDUCED_DAILY_RESTS_PER_WEEK} between weekly rests)`,
      description: `Daily rest was 9–11h before ${restReduced.length} shifts this week (${restReduced.join(
        ', '
      )}). Only ${MAX_REDUCED_DAILY_RESTS_PER_WEEK} reductions are permitted between weekly rest periods.`,
      ruleRef: REF_DAILY_REST,
    });
  } else if (restReduced.length > 0) {
    out.push({
      code: 'REDUCED_REST_USED',
      severity: 'info',
      title: `${restReduced.length} reduced daily rest${restReduced.length === 1 ? '' : 's'} (9–11h)`,
      description: `Reduced daily rest taken before: ${restReduced.join(
        ', '
      )}. Allowed up to ${MAX_REDUCED_DAILY_RESTS_PER_WEEK} between weekly rests.`,
      ruleRef: REF_DAILY_REST,
    });
  }

  // 7. Weekly rest (Art. 8(6)).
  if (weeklyRest) {
    const r = weeklyRest;
    if (r.missing) {
      const ambig = r.ambiguousMin > 0
        ? ` (this week includes ${formatHours(r.ambiguousMin)} of card-not-inserted time — a rest period there cannot be verified from the card.)`
        : '';
      out.push({
        code: 'WEEKLY_REST_MISSING',
        severity: 'breach',
        title: 'No qualifying weekly rest taken',
        description: `No continuous rest of at least 24h overlapped this week. EU rules require a weekly rest of 45h (regular) or 24h (reduced, every other week).${ambig}`,
        ruleRef: REF_WEEKLY_REST,
      });
    } else if (r.qualifiesReduced && r.longestRest) {
      out.push({
        code: 'WEEKLY_REST_REDUCED',
        severity: 'info',
        title: `Reduced weekly rest (${formatHours(r.longestRest.durationMin)})`,
        description: `Longest weekly rest overlapping this week was ${formatHours(
          r.longestRest.durationMin
        )} (${formatDateTime(r.longestRest.start)} → ${formatDateTime(
          r.longestRest.end
        )}). A reduced rest is permitted every other week and must be compensated as one block before the end of the third following week (not tracked here).`,
        ruleRef: REF_WEEKLY_REST,
      });
    }
    if (r.inconclusive) {
      const possible = r.longestPossibleRest;
      const reason = possible
        ? `A ${formatHours(possible.durationMin)} card-not-inserted gap (${formatDateTime(
            possible.start
          )} → ${formatDateTime(possible.end)}) could have contained a weekly rest; the card cannot prove it either way.`
        : 'This week extends past the recorded data window, so a weekly rest may yet occur.';
      out.push({
        code: 'WEEKLY_REST_INCONCLUSIVE',
        severity: 'info',
        title: 'Weekly rest could not be confirmed',
        description: `${reason} Verdict deferred — not counted as a breach.`,
        ruleRef: REF_WEEKLY_REST,
      });
    }
  }

  return sortInfringements(out);
}

/** Summary counts for headline display. */
export type InfringementCounts = {
  breach: number;
  warning: number;
  info: number;
  total: number;
};

export function countInfringements(items: Infringement[]): InfringementCounts {
  const c: InfringementCounts = { breach: 0, warning: 0, info: 0, total: items.length };
  for (const it of items) c[it.severity]++;
  return c;
}

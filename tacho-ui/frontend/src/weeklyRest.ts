// Weekly-rest detection per EU 561/2006 Art. 8.
//
// Algorithm
// ---------
// 1. Walk every daily record's `activity_change_info` in chronological order.
//    Each event has `minutes` (0–1439 within its day), `work_type`, and
//    `card_present`. Convert to absolute UTC ms and split into time segments
//    `[start, end)`.
// 2. A segment counts as VERIFIED REST only when `card_present === true` AND
//    `work_type === 0`. Anything else (driving, work, availability, or
//    card-not-inserted) breaks the rest accumulator — we will NOT optimistically
//    extend a rest span across card-not-inserted gaps. See "Caveats" below.
// 3. Adjacent verified-rest segments are merged across day boundaries so a
//    rest spanning Sat 18:00 → Mon 09:00 shows up as a single ~63h span.
// 4. For each Sun–Sat week bucket, find the longest qualifying rest (≥24h)
//    that overlaps the week. ≥45h = regular; 24–45h = reduced; <24h or none
//    = missing (unless the week extends beyond the recorded data window —
//    then "inconclusive").
//
// Caveats (called out in the UI footer)
// -------------------------------------
// - Card-not-inserted periods are AMBIGUOUS (the driver may have been resting,
//   working in another role, or doing nothing). We do not merge them into rest
//   spans. Drivers who pull the card during a weekly rest will therefore see
//   undercounted rest durations. Set `ambiguousGaps` on each assessment so the
//   UI can disclose this.
// - The 15+30 split rule does not apply to weekly rest, so no special case
//   needed there.
// - Compensation tracking (Art. 8(6b)) is NOT implemented yet — the regulation
//   requires a reduced weekly rest to be compensated as one block by the end
//   of the third following week. That's a separate cross-week bookkeeping pass.

import type { DailyRecord } from "./activity";
import type { WeekBucket } from "./weeks";

const MS_PER_MIN = 60_000;
const MIN_PER_DAY = 1440;
const REDUCED_WEEKLY_REST_MIN = 24 * 60;
const REGULAR_WEEKLY_REST_MIN = 45 * 60;

export const WeeklyRestThresholds = {
  REDUCED_WEEKLY_REST_MIN,
  REGULAR_WEEKLY_REST_MIN,
};

export type RestSpan = {
  start: string; // ISO datetime UTC
  end: string; // ISO datetime UTC
  startMs: number;
  endMs: number;
  durationMin: number;
};

export type DataWindow = {
  startMs: number;
  endMs: number;
};

/** All verified-rest spans across the record, merged across day boundaries. */
export function extractRestSpans(records: DailyRecord[]): RestSpan[] {
  type Seg = { startMs: number; endMs: number; isRest: boolean };

  const sorted = [...records].sort((a, b) =>
    a.activity_record_date.localeCompare(b.activity_record_date),
  );

  const segs: Seg[] = [];
  for (const rec of sorted) {
    const dateStr = rec.activity_record_date.slice(0, 10);
    const dayBaseMs = Date.parse(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(dayBaseMs)) continue;

    const events = [...rec.activity_change_info].sort(
      (a, b) => a.minutes - b.minutes,
    );
    for (let i = 0; i < events.length; i++) {
      const cur = events[i];
      // Guard against malformed events that would wrap into the next day.
      if (cur.minutes < 0 || cur.minutes >= MIN_PER_DAY) continue;
      const nextMin =
        i + 1 < events.length ? events[i + 1].minutes : MIN_PER_DAY;
      const dur = nextMin - cur.minutes;
      if (dur <= 0) continue;
      const isRest = cur.card_present === true && cur.work_type === 0;
      const startMs = dayBaseMs + cur.minutes * MS_PER_MIN;
      const endMs = dayBaseMs + Math.min(nextMin, MIN_PER_DAY) * MS_PER_MIN;

      const last = segs.length > 0 ? segs[segs.length - 1] : null;
      if (last && last.isRest === isRest && last.endMs === startMs) {
        last.endMs = endMs;
      } else {
        segs.push({ startMs, endMs, isRest });
      }
    }
  }

  return segs
    .filter((s) => s.isRest && s.endMs > s.startMs)
    .map((s) => ({
      start: new Date(s.startMs).toISOString(),
      end: new Date(s.endMs).toISOString(),
      startMs: s.startMs,
      endMs: s.endMs,
      durationMin: Math.round((s.endMs - s.startMs) / MS_PER_MIN),
    }));
}

/**
 * Spans of "could have been rest" time — verified-rest minutes plus any
 * contiguous card-not-inserted minutes. We treat these as an UPPER BOUND on
 * possible rest: when one of these is ≥24h and there's no verified-rest span
 * of that length, the verdict is "inconclusive" (driver may have rested with
 * the card removed) rather than "missing".
 */
export function extractPossibleRestSpans(records: DailyRecord[]): RestSpan[] {
  type Seg = { startMs: number; endMs: number; possibleRest: boolean };

  const sorted = [...records].sort((a, b) =>
    a.activity_record_date.localeCompare(b.activity_record_date),
  );

  const segs: Seg[] = [];
  for (const rec of sorted) {
    const dateStr = rec.activity_record_date.slice(0, 10);
    const dayBaseMs = Date.parse(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(dayBaseMs)) continue;
    const events = [...rec.activity_change_info].sort(
      (a, b) => a.minutes - b.minutes,
    );
    for (let i = 0; i < events.length; i++) {
      const cur = events[i];
      if (cur.minutes < 0 || cur.minutes >= MIN_PER_DAY) continue;
      const nextMin =
        i + 1 < events.length ? events[i + 1].minutes : MIN_PER_DAY;
      const dur = nextMin - cur.minutes;
      if (dur <= 0) continue;
      // "possible rest" = verified rest OR card-not-inserted (unknown).
      // Anything else (driving, work, availability) breaks the chain.
      const possible =
        (cur.card_present === true && cur.work_type === 0) ||
        cur.card_present === false;
      const startMs = dayBaseMs + cur.minutes * MS_PER_MIN;
      const endMs = dayBaseMs + Math.min(nextMin, MIN_PER_DAY) * MS_PER_MIN;
      const last = segs.length > 0 ? segs[segs.length - 1] : null;
      if (last && last.possibleRest === possible && last.endMs === startMs) {
        last.endMs = endMs;
      } else {
        segs.push({ startMs, endMs, possibleRest: possible });
      }
    }
  }
  return segs
    .filter((s) => s.possibleRest && s.endMs > s.startMs)
    .map((s) => ({
      start: new Date(s.startMs).toISOString(),
      end: new Date(s.endMs).toISOString(),
      startMs: s.startMs,
      endMs: s.endMs,
      durationMin: Math.round((s.endMs - s.startMs) / MS_PER_MIN),
    }));
}

/** All card-not-inserted spans, merged. Used for "may be inconclusive" disclosure. */
export function extractAmbiguousSpans(records: DailyRecord[]): RestSpan[] {
  type Seg = { startMs: number; endMs: number; isAmbig: boolean };

  const sorted = [...records].sort((a, b) =>
    a.activity_record_date.localeCompare(b.activity_record_date),
  );

  const segs: Seg[] = [];
  for (const rec of sorted) {
    const dateStr = rec.activity_record_date.slice(0, 10);
    const dayBaseMs = Date.parse(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(dayBaseMs)) continue;
    const events = [...rec.activity_change_info].sort(
      (a, b) => a.minutes - b.minutes,
    );
    for (let i = 0; i < events.length; i++) {
      const cur = events[i];
      if (cur.minutes < 0 || cur.minutes >= MIN_PER_DAY) continue;
      const nextMin =
        i + 1 < events.length ? events[i + 1].minutes : MIN_PER_DAY;
      const dur = nextMin - cur.minutes;
      if (dur <= 0) continue;
      const isAmbig = cur.card_present === false;
      const startMs = dayBaseMs + cur.minutes * MS_PER_MIN;
      const endMs = dayBaseMs + Math.min(nextMin, MIN_PER_DAY) * MS_PER_MIN;
      const last = segs.length > 0 ? segs[segs.length - 1] : null;
      if (last && last.isAmbig === isAmbig && last.endMs === startMs) {
        last.endMs = endMs;
      } else {
        segs.push({ startMs, endMs, isAmbig });
      }
    }
  }

  return segs
    .filter((s) => s.isAmbig && s.endMs > s.startMs)
    .map((s) => ({
      start: new Date(s.startMs).toISOString(),
      end: new Date(s.endMs).toISOString(),
      startMs: s.startMs,
      endMs: s.endMs,
      durationMin: Math.round((s.endMs - s.startMs) / MS_PER_MIN),
    }));
}

/** Outer bounds of the activity record, used for inconclusive-edge detection. */
export function dataWindow(records: DailyRecord[]): DataWindow | null {
  if (records.length === 0) return null;
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;
  for (const rec of records) {
    const day = rec.activity_record_date.slice(0, 10);
    const base = Date.parse(`${day}T00:00:00Z`);
    if (Number.isNaN(base)) continue;
    if (base < startMs) startMs = base;
    const dayEnd = base + MIN_PER_DAY * MS_PER_MIN;
    if (dayEnd > endMs) endMs = dayEnd;
  }
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return { startMs, endMs };
}

export type WeekRestAssessment = {
  /** Longest verified rest span (≥24h) overlapping the week. */
  longestRest: RestSpan | null;
  /** Longest "possible rest" span (verified + adjacent card-not-inserted) overlapping the week. */
  longestPossibleRest: RestSpan | null;
  /** Total card-not-inserted minutes overlapping the week. */
  ambiguousMin: number;
  qualifiesRegular: boolean;
  qualifiesReduced: boolean;
  /**
   * No qualifying rest overlaps the week — neither verified nor any plausible
   * card-not-inserted gap that could have contained one. This is a real breach.
   */
  missing: boolean;
  /**
   * Verified rest fell short, but the week contains either a ≥24h
   * card-not-inserted gap or extends past the recorded data window. The driver
   * may have rested with the card removed; the card cannot prove it either way.
   */
  inconclusive: boolean;
};

function overlapMin(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEnd, bEnd);
  if (e <= s) return 0;
  return Math.round((e - s) / MS_PER_MIN);
}

export function assessWeeklyRest(
  week: WeekBucket,
  restSpans: RestSpan[],
  possibleRestSpans: RestSpan[],
  ambiguousSpans: RestSpan[],
  window: DataWindow | null,
): WeekRestAssessment {
  const weekStartMs = Date.parse(`${week.weekStart}T00:00:00Z`);
  const weekEndExclusiveMs =
    Date.parse(`${week.weekEnd}T00:00:00Z`) + MIN_PER_DAY * MS_PER_MIN;

  let best: RestSpan | null = null;
  for (const span of restSpans) {
    if (span.durationMin < REDUCED_WEEKLY_REST_MIN) continue;
    if (span.endMs <= weekStartMs) continue;
    if (span.startMs >= weekEndExclusiveMs) continue;
    if (!best || span.durationMin > best.durationMin) best = span;
  }

  let bestPossible: RestSpan | null = null;
  for (const span of possibleRestSpans) {
    if (span.durationMin < REDUCED_WEEKLY_REST_MIN) continue;
    if (span.endMs <= weekStartMs) continue;
    if (span.startMs >= weekEndExclusiveMs) continue;
    if (!bestPossible || span.durationMin > bestPossible.durationMin)
      bestPossible = span;
  }

  let ambiguousMin = 0;
  for (const span of ambiguousSpans) {
    ambiguousMin += overlapMin(
      span.startMs,
      span.endMs,
      weekStartMs,
      weekEndExclusiveMs,
    );
  }

  const incompleteOnEdge = window
    ? weekStartMs < window.startMs || weekEndExclusiveMs > window.endMs
    : true;
  // If verified rest is short, but either a long ambiguous gap could have
  // contained one, or the data window doesn't fully cover this week, treat
  // the verdict as inconclusive rather than a definitive miss.
  const couldHaveRested = !!bestPossible;
  const inconclusive = !best && (couldHaveRested || incompleteOnEdge);

  return {
    longestRest: best,
    longestPossibleRest: bestPossible,
    ambiguousMin,
    qualifiesRegular: !!best && best.durationMin >= REGULAR_WEEKLY_REST_MIN,
    qualifiesReduced:
      !!best &&
      best.durationMin >= REDUCED_WEEKLY_REST_MIN &&
      best.durationMin < REGULAR_WEEKLY_REST_MIN,
    missing: !best && !inconclusive,
    inconclusive,
  };
}

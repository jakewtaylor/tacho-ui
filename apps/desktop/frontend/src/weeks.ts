import { rollup, type ActivityRollup, type DailyStats } from "./activity";

export type WeekBucket = {
  weekStart: string; // Sunday, yyyy-mm-dd (UTC)
  weekEnd: string; // Saturday, yyyy-mm-dd (UTC)
  // 7 slots, index 0 = Sunday … 6 = Saturday. null = no record for that day.
  days: (DailyStats | null)[];
  rollup: ActivityRollup;
};

function toUTCDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00Z`);
}

function addDays(yyyyMmDd: string, n: number): string {
  const d = toUTCDate(yyyyMmDd);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Sunday on-or-before the given date (UTC). */
export function weekStartSunday(yyyyMmDd: string): string {
  const d = toUTCDate(yyyyMmDd);
  const dow = d.getUTCDay(); // 0 = Sun … 6 = Sat
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Group daily stats into Sunday-starting weeks, newest week first. */
export function groupByWeekSunday(days: DailyStats[]): WeekBucket[] {
  const byWeek = new Map<string, Map<string, DailyStats>>();
  for (const day of days) {
    const ws = weekStartSunday(day.date);
    let bucket = byWeek.get(ws);
    if (!bucket) {
      bucket = new Map();
      byWeek.set(ws, bucket);
    }
    bucket.set(day.date, day);
  }

  const out: WeekBucket[] = [];
  for (const [ws, bucket] of byWeek) {
    const slots: (DailyStats | null)[] = [];
    const present: DailyStats[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(ws, i);
      const day = bucket.get(date) ?? null;
      slots.push(day);
      if (day) present.push(day);
    }
    out.push({
      weekStart: ws,
      weekEnd: addDays(ws, 6),
      days: slots,
      rollup: rollup(present),
    });
  }
  out.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return out;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function dowLabel(i: number): string {
  return DOW_LABELS[i] ?? "";
}

/** "May 10 – May 16, 2026" or "Dec 28, 2025 – Jan 3, 2026" if it crosses a year. */
export function formatWeekRange(weekStart: string, weekEnd: string): string {
  const a = toUTCDate(weekStart);
  const b = toUTCDate(weekEnd);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const left = a.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    timeZone: "UTC",
  });
  const right = b.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${left} – ${right}`;
}

import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  computeDailyStats,
  formatHours,
  type DailyRecord,
  type DailyStats,
} from '../activity';
import { deriveShifts, type Shift } from '../shifts';
import {
  countInfringements,
  detectWeekInfringements,
  type Infringement,
} from '../infringements';
import { InfringementsPanel } from '../InfringementsPanel';
import { dowLabel, formatWeekRange, groupByWeekSunday, type WeekBucket } from '../weeks';
import {
  assessWeeklyRest,
  dataWindow,
  extractAmbiguousSpans,
  extractPossibleRestSpans,
  extractRestSpans,
  type WeekRestAssessment,
} from '../weeklyRest';
import { pageTitle, useDocumentTitle } from '../useDocumentTitle';
import { useDriverData } from '../useDriverData';

export function WeeksPage() {
  const { cardNumber } = useParams<{ cardNumber: string }>();
  const { data, loading, error } = useDriverData(cardNumber);

  const driverName = useMemo(() => {
    const p = data?.profile;
    if (!p) return null;
    return [p.firstNames, p.surname].filter(Boolean).join(' ') || p.cardNumber;
  }, [data?.profile]);
  useDocumentTitle(pageTitle(driverName ? `Weekly summary — ${driverName}` : 'Weekly summary'));

  const { weeks, recordsByDate, shiftsByDate, weeklyRestByWeek } = useMemo(() => {
    const empty = {
      weeks: [] as WeekBucket[],
      recordsByDate: new Map<string, DailyRecord>(),
      shiftsByDate: new Map<string, Shift>(),
      weeklyRestByWeek: new Map<string, WeekRestAssessment>(),
    };
    if (!data) return empty;
    const days = data.dailyRecords.map(computeDailyStats);
    const recMap = new Map<string, DailyRecord>();
    for (const r of data.dailyRecords) {
      recMap.set(r.activity_record_date.slice(0, 10), r);
    }
    const shifts = deriveShifts(data.placeRecords);
    const shiftMap = new Map<string, Shift>();
    for (const s of shifts) {
      if (!shiftMap.has(s.date)) shiftMap.set(s.date, s);
    }
    const groupedWeeks = groupByWeekSunday(days);
    const restSpans = extractRestSpans(data.dailyRecords);
    const possible = extractPossibleRestSpans(data.dailyRecords);
    const ambiguous = extractAmbiguousSpans(data.dailyRecords);
    const win = dataWindow(data.dailyRecords);
    const restMap = new Map<string, WeekRestAssessment>();
    for (const w of groupedWeeks) {
      restMap.set(w.weekStart, assessWeeklyRest(w, restSpans, possible, ambiguous, win));
    }
    return {
      weeks: groupedWeeks,
      recordsByDate: recMap,
      shiftsByDate: shiftMap,
      weeklyRestByWeek: restMap,
    };
  }, [data]);

  const { weekInfringements, allItems } = useMemo(() => {
    const map = new Map<string, Infringement[]>();
    const all: Infringement[] = [];
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i];
      const prev = weeks[i + 1] ?? null;
      const items = detectWeekInfringements({
        week: w,
        prevWeek: prev,
        recordsByDate,
        shiftsByDate,
        weeklyRest: weeklyRestByWeek.get(w.weekStart) ?? null,
      });
      map.set(w.weekStart, items);
      all.push(...items);
    }
    return { weekInfringements: map, allItems: all };
  }, [weeks, recordsByDate, shiftsByDate, weeklyRestByWeek]);

  const totalCounts = countInfringements(allItems);

  if (!cardNumber) return <Navigate to="/" replace />;

  if (error) {
    return (
      <div className="rounded-md border border-(--color-warn)/60 bg-(--color-warn)/10 px-3 py-2 font-mono text-xs">
        {error}
      </div>
    );
  }
  if (loading || !data) {
    return <div className="mt-16 text-center text-(--color-muted)">Loading…</div>;
  }
  if (weeks.length === 0) {
    return (
      <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-6 text-center text-(--color-muted)">
        No driver activity records found on this card.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={`/driver/${cardNumber}`}
        className="self-start text-xs text-(--color-muted) hover:text-white"
      >
        ← Overview
      </Link>

      <header className="flex items-baseline justify-between gap-3">
        <h1 className="m-0 text-lg font-semibold">Weekly summary</h1>
        <p className="text-xs text-(--color-muted)">
          {weeks.length} week{weeks.length === 1 ? '' : 's'} · Sunday as day 1
        </p>
      </header>

      <ComplianceHeadline counts={totalCounts} weeks={weeks.length} />

      <div className="flex flex-col gap-3">
        {weeks.map((w) => (
          <WeekCard
            key={w.weekStart}
            cardNumber={cardNumber}
            bucket={w}
            infringements={weekInfringements.get(w.weekStart) ?? []}
            weeklyRest={weeklyRestByWeek.get(w.weekStart) ?? null}
          />
        ))}
      </div>

      <p className="text-xs text-(--color-muted)">
        Weekly limits are computed against the displayed Sunday–Saturday bucket. The EU regulatory
        "fixed week" runs Monday 00:00 → Sunday 24:00 — totals near a Sun/Mon boundary may differ
        from a strict compliance calculation. Weekly rest is detected only across periods where the
        card was inserted; long card-not-inserted gaps (e.g. card removed during a weekend) will
        undercount real rest and may surface as "could not be confirmed". Compensation tracking for
        reduced weekly rests is not yet implemented.
      </p>
    </div>
  );
}

function ComplianceHeadline({
  counts,
  weeks,
}: {
  counts: ReturnType<typeof countInfringements>;
  weeks: number;
}) {
  if (counts.total === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/25 font-semibold text-emerald-300"
        >
          ✓
        </span>
        <div>
          <div className="text-sm font-semibold text-emerald-200">
            Compliant across {weeks} week{weeks === 1 ? '' : 's'}
          </div>
          <div className="text-xs text-emerald-100/80">
            No driver-hours infringements detected on the card.
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-(--color-warn)/60 bg-(--color-warn)/10 px-4 py-3">
      <span
        aria-hidden
        className="grid h-7 w-7 place-items-center rounded-full bg-(--color-warn)/25 font-semibold text-(--color-warn)"
      >
        ⚠
      </span>
      <div className="flex-1">
        <div className="text-sm font-semibold text-(--color-warn)">
          {counts.breach} breach{counts.breach === 1 ? '' : 'es'}
          {counts.warning > 0 ? `, ${counts.warning} warning${counts.warning === 1 ? '' : 's'}` : ''}
          {counts.info > 0 ? `, ${counts.info} info` : ''} across {weeks} week
          {weeks === 1 ? '' : 's'}
        </div>
        <div className="text-xs text-(--color-text)/80">
          See per-week breakdowns below for the rule, date, and quantity behind each entry.
        </div>
      </div>
    </div>
  );
}

function WeekCard({
  cardNumber,
  bucket,
  infringements,
  weeklyRest,
}: {
  cardNumber: string;
  bucket: WeekBucket;
  infringements: Infringement[];
  weeklyRest: WeekRestAssessment | null;
}) {
  const { weekStart, weekEnd, days, rollup: r } = bucket;
  const counts = countInfringements(infringements);
  const hasIssues = counts.total > 0;
  const restValue = (() => {
    if (!weeklyRest) return '—';
    if (weeklyRest.longestRest) return formatHours(weeklyRest.longestRest.durationMin);
    if (weeklyRest.inconclusive) return '?';
    return 'None';
  })();
  const restWarn = !!weeklyRest && (weeklyRest.missing || weeklyRest.qualifiesReduced);
  const restTitle = weeklyRest?.longestRest
    ? `${weeklyRest.longestRest.start.replace('T', ' ').slice(0, 16)} → ${weeklyRest.longestRest.end.replace('T', ' ').slice(0, 16)}`
    : weeklyRest?.missing
      ? 'No qualifying ≥24h rest overlaps this week'
      : weeklyRest?.inconclusive
        ? 'Week extends past recorded data — verdict deferred'
        : undefined;
  return (
    <section
      className={`rounded-lg border p-4 ${
        counts.breach > 0
          ? 'border-(--color-warn)/50 bg-(--color-warn)/5'
          : 'border-(--color-border) bg-(--color-surface)'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="m-0 text-base font-semibold">{formatWeekRange(weekStart, weekEnd)}</h2>
            <ComplianceChip counts={counts} />
            <Link
              to={`/driver/${cardNumber}/print/week/${weekStart}`}
              className="rounded-md border border-(--color-border) bg-white/5 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider text-(--color-muted) hover:bg-white/10 hover:text-white"
              title="Open a printable spreadsheet view of this week"
            >
              Print
            </Link>
          </div>
          <div className="mt-0.5 font-mono text-[0.7rem] text-(--color-muted)">
            {weekStart} → {weekEnd}
          </div>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
          <WeekStat label="Driving" value={formatHours(r.totalDrivingMin)} />
          <WeekStat label="Work" value={formatHours(r.totalWorkMin)} />
          <WeekStat label="Rest" value={formatHours(r.totalRestMin)} />
          <WeekStat label="Distance" value={`${r.totalDistanceKm.toLocaleString()} km`} />
          <WeekStat label="Days driven" value={`${r.daysWithDriving}/7`} />
          <WeekStat
            label="Over 9h"
            value={String(r.daysOverLimit)}
            warn={r.daysOverLimit > 0}
          />
          <WeekStat label="Weekly rest" value={restValue} warn={restWarn} title={restTitle} />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d, i) => (
          <DayCell key={i} cardNumber={cardNumber} dow={i} day={d} />
        ))}
      </div>
      {hasIssues && (
        <div className="mt-4">
          <InfringementsPanel
            items={infringements}
            title="Infringements this week"
            hideWhenEmpty
            headingLevel="h3"
          />
        </div>
      )}
    </section>
  );
}

function ComplianceChip({ counts }: { counts: ReturnType<typeof countInfringements> }) {
  if (counts.total === 0) {
    return (
      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-300">
        ✓ Compliant
      </span>
    );
  }
  if (counts.breach > 0) {
    return (
      <span className="rounded-full bg-(--color-warn)/25 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-(--color-warn)">
        {counts.breach} breach{counts.breach === 1 ? '' : 'es'}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-amber-200">
      {counts.total} note{counts.total === 1 ? '' : 's'}
    </span>
  );
}

function WeekStat({
  label,
  value,
  warn,
  title,
}: {
  label: string;
  value: string;
  warn?: boolean;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-end" title={title}>
      <div className="text-[0.6rem] uppercase tracking-wider text-(--color-muted)">{label}</div>
      <div className={`tabular-nums font-semibold ${warn ? 'text-(--color-warn)' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function DayCell({
  cardNumber,
  dow,
  day,
}: {
  cardNumber: string;
  dow: number;
  day: DailyStats | null;
}) {
  const label = dowLabel(dow);
  if (!day) {
    return (
      <div className="flex flex-col gap-1 rounded-md border border-dashed border-(--color-border) bg-black/15 px-2 py-2 text-center text-[0.65rem] text-(--color-muted)">
        <div className="font-semibold uppercase tracking-wider">{label}</div>
        <div className="text-(--color-muted)/60">—</div>
      </div>
    );
  }
  return (
    <Link
      to={`/driver/${cardNumber}/day/${day.date}`}
      state={{ from: 'weeks' }}
      className="flex flex-col gap-1 rounded-md border border-(--color-border) bg-black/15 px-2 py-2 text-center hover:bg-white/5"
    >
      <div className="flex items-baseline justify-between text-[0.65rem]">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="font-mono text-(--color-muted)">{day.date.slice(8)}</span>
      </div>
      <DayBars day={day} />
      <div className="flex items-baseline justify-between text-[0.7rem] tabular-nums">
        <span
          className={
            day.wayOverDailyLimit || day.overDailyLimit ? 'text-(--color-warn) font-semibold' : ''
          }
        >
          {formatHours(day.drivingMin)}
        </span>
        <span className="text-(--color-muted)">{day.distanceKm.toLocaleString()}km</span>
      </div>
    </Link>
  );
}

function DayBars({ day }: { day: DailyStats }) {
  const total = 16 * 60;
  const pct = (m: number) => `${Math.min(100, (m / total) * 100)}%`;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div className="flex h-full">
        <span className="block bg-(--color-driving)" style={{ width: pct(day.drivingMin) }} />
        <span className="block bg-(--color-work)" style={{ width: pct(day.workMin) }} />
        <span className="block bg-(--color-available)" style={{ width: pct(day.availableMin) }} />
      </div>
    </div>
  );
}

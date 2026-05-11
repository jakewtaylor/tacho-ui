import { useMemo } from 'react';
import { Link, Navigate, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { DayDetail } from '../DayDetail';
import { MapPanel } from '../MapPanel';
import {
  computeDailyStats,
  computeDayDetail,
  extractDailyRecords,
  formatHours,
  type DailyRecord,
  type DailyStats,
} from '../activity';
import { deriveShifts, extractPlaceRecords } from '../shifts';
import { detectDayInfringements } from '../infringements';
import { InfringementsPanel } from '../InfringementsPanel';
import { pageTitle, useDocumentTitle } from '../useDocumentTitle';
import { extractDriverSummary } from '../panels';
import type { AppCtx } from './Overview';

function formatHeading(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function DayPage() {
  const { date } = useParams<{ date: string }>();
  const { result, parsedData } = useOutletContext<AppCtx>();
  const navState = useLocation().state as { from?: string } | null;
  const back =
    navState?.from === 'weeks'
      ? { to: '/weeks', label: '← Week view' }
      : { to: '/', label: '← Overview' };

  const records = useMemo<DailyRecord[]>(
    () => (parsedData ? extractDailyRecords(parsedData) : []),
    [parsedData]
  );

  // Records come back newest-first. Sort by date for deterministic prev/next.
  const sortedDates = useMemo(
    () =>
      records
        .map((r) => r.activity_record_date.slice(0, 10))
        .sort((a, b) => a.localeCompare(b)),
    [records]
  );

  const driver = useMemo(() => {
    if (!result || !parsedData) return null;
    return extractDriverSummary(result.fileType, parsedData).find((s) => s.label === 'Driver')
      ?.value ?? null;
  }, [result, parsedData]);
  useDocumentTitle(
    pageTitle(date ? (driver ? `${date} — ${driver}` : date) : null)
  );

  if (!result || !parsedData) {
    return <Navigate to="/" replace />;
  }
  if (!date) return <Navigate to="/" replace />;

  const idx = sortedDates.indexOf(date);
  const record = records.find((r) => r.activity_record_date.slice(0, 10) === date);

  if (!record || idx === -1) {
    return (
      <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-6 text-center">
        <p className="mb-3 text-(--color-muted)">
          No activity record found for{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">{date}</code>.
        </p>
        <Link
          to="/"
          className="inline-block h-8 rounded-md border border-(--color-border) bg-white/5 px-3 text-sm leading-8 hover:bg-white/10"
        >
          Back to overview
        </Link>
      </div>
    );
  }

  const prevDate = idx > 0 ? sortedDates[idx - 1] : null;
  const nextDate = idx < sortedDates.length - 1 ? sortedDates[idx + 1] : null;
  const stats: DailyStats = computeDailyStats(record);
  const detail = computeDayDetail(record);
  const shift = deriveShifts(extractPlaceRecords(parsedData)).find((s) => s.date === date) ?? null;
  const infringements = detectDayInfringements({ stats, detail, shift });

  return (
    <div className="flex flex-col gap-5">
      <Link
        to={back.to}
        className="self-start text-xs text-(--color-muted) hover:text-white"
      >
        {back.label}
      </Link>

      <header className="flex flex-col gap-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
        <div className="flex items-center justify-between gap-2">
          <NavButton to={prevDate ? `/day/${prevDate}` : null} label="← Previous day" state={navState} />
          <div className="flex flex-col items-center text-center">
            <div className="text-xs text-(--color-muted) tabular-nums">{date}</div>
            <h1 className="m-0 text-lg font-semibold">{formatHeading(date)}</h1>
            <div className="text-xs text-(--color-muted)">
              Day {idx + 1} of {sortedDates.length}
            </div>
          </div>
          <NavButton to={nextDate ? `/day/${nextDate}` : null} label="Next day →" align="right" state={navState} />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <DayChip label="Driving" value={formatHours(stats.drivingMin)} warn={stats.overDailyLimit} />
          <DayChip label="Work" value={formatHours(stats.workMin)} />
          <DayChip label="Rest" value={formatHours(stats.restMin)} />
          <DayChip label="Distance" value={`${stats.distanceKm.toLocaleString()} km`} />
        </div>
      </header>

      <InfringementsPanel items={infringements} linkDates={false} />

      <DayDetail record={record} />

      <MapPanel data={parsedData} dateFilter={date} title={`Driving map · ${date}`} />
    </div>
  );
}

function NavButton({
  to,
  label,
  align = 'left',
  state,
}: {
  to: string | null;
  label: string;
  align?: 'left' | 'right';
  state?: unknown;
}) {
  const justify = align === 'right' ? 'justify-end' : 'justify-start';
  if (!to) {
    return (
      <div className={`flex flex-1 ${justify}`}>
        <span className="h-8 cursor-not-allowed rounded-md border border-(--color-border) bg-white/[0.02] px-3 text-sm leading-8 text-(--color-muted)/50">
          {label}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex flex-1 ${justify}`}>
      <Link
        to={to}
        state={state}
        className="h-8 rounded-md border border-(--color-border) bg-white/5 px-3 text-sm leading-8 hover:bg-white/10"
      >
        {label}
      </Link>
    </div>
  );
}

function DayChip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border border-(--color-border) bg-black/15 px-3 py-2">
      <div className="text-[0.65rem] uppercase tracking-wider text-(--color-muted)">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          warn ? 'text-(--color-warn)' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import { DayDetail } from '../DayDetail';
import { MapPanel } from '../MapPanel';
import {
  computeDailyStats,
  computeDayDetail,
  formatHours,
  type DailyStats,
} from '../activity';
import { deriveShifts } from '../shifts';
import { detectDayInfringements } from '../infringements';
import { InfringementsPanel } from '../InfringementsPanel';
import { pageTitle, useDocumentTitle } from '../useDocumentTitle';
import { useDriverData } from '../useDriverData';

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
  const { cardNumber, date } = useParams<{ cardNumber: string; date: string }>();
  const navState = useLocation().state as { from?: string } | null;
  const back =
    navState?.from === 'weeks'
      ? { to: `/driver/${cardNumber}/weeks`, label: '← Week view' }
      : { to: `/driver/${cardNumber}`, label: '← Overview' };
  const { data, loading, error } = useDriverData(cardNumber);

  const sortedDates = useMemo(
    () =>
      (data?.dailyRecords ?? [])
        .map((r) => r.activity_record_date.slice(0, 10))
        .sort((a, b) => a.localeCompare(b)),
    [data?.dailyRecords]
  );

  const driverName = useMemo(() => {
    const p = data?.profile;
    if (!p) return null;
    return [p.firstNames, p.surname].filter(Boolean).join(' ') || p.cardNumber;
  }, [data?.profile]);
  useDocumentTitle(pageTitle(date && driverName ? `${date} — ${driverName}` : date ?? null));

  if (!cardNumber || !date) return <Navigate to="/" replace />;

  if (error) {
    return (
      <div className="rounded-md border border-(--color-warn)/60 bg-(--color-warn)/10 px-3 py-2 font-mono text-xs">
        {error}
      </div>
    );
  }
  if (loading || !data) {
    return <div className="mt-16 text-center text-(--color-muted)">Loading day…</div>;
  }

  const idx = sortedDates.indexOf(date);
  const record = data.dailyRecords.find((r) => r.activity_record_date.slice(0, 10) === date);
  if (!record || idx === -1) {
    return (
      <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-6 text-center">
        <p className="mb-3 text-(--color-muted)">
          No activity record found for{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">{date}</code>.
        </p>
        <Link
          to={`/driver/${cardNumber}`}
          className="inline-block h-8 rounded-md border border-(--color-border) bg-white/5 px-3 text-sm leading-8 hover:bg-white/10"
        >
          Back to driver overview
        </Link>
      </div>
    );
  }

  const prevDate = idx > 0 ? sortedDates[idx - 1] : null;
  const nextDate = idx < sortedDates.length - 1 ? sortedDates[idx + 1] : null;
  const stats: DailyStats = computeDailyStats(record);
  const detail = computeDayDetail(record);
  const shift = deriveShifts(data.placeRecords).find((s) => s.date === date) ?? null;
  const infringements = detectDayInfringements({ stats, detail, shift });

  return (
    <div className="flex flex-col gap-5">
      <Link to={back.to} className="self-start text-xs text-(--color-muted) hover:text-white">
        {back.label}
      </Link>

      <header className="flex flex-col gap-3 rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
        <div className="flex items-center justify-between gap-2">
          <NavButton
            to={prevDate ? `/driver/${cardNumber}/day/${prevDate}` : null}
            label="← Previous day"
            state={navState}
          />
          <div className="flex flex-col items-center text-center">
            <div className="text-xs text-(--color-muted) tabular-nums">{date}</div>
            <h1 className="m-0 text-lg font-semibold">{formatHeading(date)}</h1>
            <div className="text-xs text-(--color-muted)">
              Day {idx + 1} of {sortedDates.length}
            </div>
          </div>
          <NavButton
            to={nextDate ? `/driver/${cardNumber}/day/${nextDate}` : null}
            label="Next day →"
            align="right"
            state={navState}
          />
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

      <MapPanel points={data.gnssPoints} dateFilter={date} title={`Driving map · ${date}`} />
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

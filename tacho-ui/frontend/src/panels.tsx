import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  computeDailyStats,
  extractDailyRecords,
  formatHours,
  rollup,
  type DailyStats,
} from './activity';
import { DailyActivityChart } from './DailyActivityChart';
import {
  deriveShifts,
  extractPlaceRecords,
  formatTimeOfDay,
  type Shift,
} from './shifts';
import { nationAlpha, nationName } from './nations';
import { extractVehicles, vehicleForShift } from './vehicles';
import { extractEventsAndFaults, durationMinutes, type CardEvent } from './events';
import { eventCategory, eventTypeLabel } from './eventTypes';

export type Summary = {
  label: string;
  value: string;
};

export function extractDriverSummary(fileType: string, data: any): Summary[] {
  if (!data) return [];

  if (fileType === 'card') {
    const ident =
      data.card_identification_and_driver_card_holder_identification_1 ??
      data.card_identification_and_driver_card_holder_identification_2;
    if (!ident) return [];

    const name = ident.driver_card_holder_identification?.card_holder_name;
    const id = ident.card_identification;
    const dob = ident.driver_card_holder_identification?.card_holder_birth_date;

    const out: Summary[] = [];
    if (name?.holder_surname || name?.holder_first_names) {
      out.push({
        label: 'Driver',
        value: [name.holder_first_names, name.holder_surname]
          .filter(Boolean)
          .join(' '),
      });
    }
    if (id?.card_number) out.push({ label: 'Card number', value: id.card_number });
    if (id?.card_issuing_member_state !== undefined) {
      out.push({
        label: 'Issuing member state',
        value: nationName(id.card_issuing_member_state),
      });
    }
    if (id?.card_issue_date) out.push({ label: 'Issued', value: String(id.card_issue_date) });
    if (id?.card_expiry_date) out.push({ label: 'Expires', value: String(id.card_expiry_date) });
    if (dob) {
      out.push({
        label: 'Date of birth',
        value: `${dob.year}-${String(dob.month).padStart(2, '0')}-${String(dob.day).padStart(2, '0')}`,
      });
    }
    return out;
  }

  if (fileType === 'vu') {
    const ident = data.vu_identification ?? data.vehicle_identification;
    if (ident?.vehicle_identification_number) {
      return [{ label: 'VIN', value: ident.vehicle_identification_number }];
    }
  }
  return [];
}

export function DriverSummaryPanel({ summary }: { summary: Summary[] }) {
  if (summary.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
        Driver
      </h2>
      <dl className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        {summary.map((s, idx) => (
          <div
            key={s.label}
            className={`grid grid-cols-[200px_1fr] px-4 py-2 text-sm ${
              idx !== 0 ? 'border-t border-(--color-border)' : ''
            }`}
          >
            <dt className="text-(--color-muted)">{s.label}</dt>
            <dd className="m-0 font-mono">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-3">
      <div className="text-[0.7rem] uppercase tracking-wider text-(--color-muted)">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-(--color-muted)">{hint}</div>}
    </div>
  );
}

function MiniBar({ day }: { day: DailyStats }) {
  const total = 16 * 60;
  const pct = (m: number) => `${Math.min(100, (m / total) * 100)}%`;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
      <div className="flex h-full">
        <span className="block bg-(--color-driving)" style={{ width: pct(day.drivingMin) }} />
        <span className="block bg-(--color-work)" style={{ width: pct(day.workMin) }} />
        <span className="block bg-(--color-available)" style={{ width: pct(day.availableMin) }} />
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[0.7rem] text-(--color-muted)">
      <span className="flex items-center gap-1">
        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-(--color-driving)" /> Driving
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-(--color-work)" /> Work
      </span>
      <span className="flex items-center gap-1">
        <i className="inline-block h-2.5 w-2.5 rounded-sm bg-(--color-available)" /> Available
      </span>
    </div>
  );
}

export function ActivityPanel({ data }: { data: any }) {
  const records = useMemo(() => extractDailyRecords(data), [data]);
  const allDays = useMemo(() => records.map(computeDailyStats), [records]);

  if (allDays.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
          Driver activity
        </h2>
        <div className="rounded-lg border border-(--color-border) bg-(--color-surface) px-4 py-3 text-sm text-(--color-muted)">
          No driver activity records found on this card.
        </div>
      </section>
    );
  }

  const last7 = allDays.slice(0, 7);
  const last28 = allDays.slice(0, 28);
  const r7 = rollup(last7);
  const r28 = rollup(last28);
  const fullRollup = rollup(allDays);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
        Driver activity
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Last 7 days driving"
          value={formatHours(r7.totalDrivingMin)}
          hint={`${r7.daysWithDriving} active day${r7.daysWithDriving === 1 ? '' : 's'} · ${r7.totalDistanceKm.toLocaleString()} km`}
        />
        <StatCard
          label="Last 28 days driving"
          value={formatHours(r28.totalDrivingMin)}
          hint={`${r28.daysWithDriving} active day${r28.daysWithDriving === 1 ? '' : 's'} · ${r28.totalDistanceKm.toLocaleString()} km`}
        />
        <StatCard
          label="Last 28 days rest"
          value={formatHours(r28.totalRestMin)}
          hint={`Work (non-driving): ${formatHours(r28.totalWorkMin)}`}
        />
        <StatCard
          label="Days over 9h driving"
          value={String(r28.daysOverLimit)}
          hint={`In last 28 days · ${fullRollup.daysOverLimit} ever`}
        />
      </div>

      <div className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Daily activity · last 28 days</h3>
          <Legend />
        </div>
        <DailyActivityChart days={last28} />
      </div>

      <div className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        <div
          className="grid items-center gap-x-3 bg-black/15 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wider text-(--color-muted)"
          style={{ gridTemplateColumns: '110px minmax(140px,1fr) 90px 80px 80px 70px' }}
        >
          <div>Date</div>
          <div>Activity</div>
          <div className="text-right">Driving</div>
          <div className="text-right">Work</div>
          <div className="text-right">Rest</div>
          <div className="text-right">Km</div>
        </div>
        {last28.map((day) => (
          <Link
            key={day.date}
            to={`/day/${day.date}`}
            className="grid w-full items-center gap-x-3 border-t border-(--color-border) px-4 py-2 text-sm tabular-nums first:border-t-0 cursor-pointer hover:bg-white/5"
            style={{ gridTemplateColumns: '110px minmax(140px,1fr) 90px 80px 80px 70px' }}
          >
            <div className="font-mono text-xs">{day.date}</div>
            <div className="pr-3">
              <MiniBar day={day} />
            </div>
            <div className="text-right">
              {formatHours(day.drivingMin)}
              {day.wayOverDailyLimit ? (
                <span className="ml-1 font-bold text-(--color-warn)" title="Over 10h driving">!!</span>
              ) : day.overDailyLimit ? (
                <span className="ml-1 font-bold text-(--color-warn)" title="Over 9h driving">!</span>
              ) : null}
            </div>
            <div className="text-right">{formatHours(day.workMin)}</div>
            <div className="text-right">{formatHours(day.restMin)}</div>
            <div className="text-right">{day.distanceKm.toLocaleString()}</div>
          </Link>
        ))}
      </div>

      <p className="text-xs text-(--color-muted)">
        Click a day for a 24-hour timeline, GNSS map, and break-compliance breakdown. Activity is computed only from periods with the card inserted; the dashed line on the chart marks the EU 9h daily driving limit.
      </p>
    </section>
  );
}

export function ShiftsPanel({ data }: { data: any }) {
  const shifts = useMemo<Shift[]>(() => {
    const records = extractPlaceRecords(data);
    return deriveShifts(records).slice(0, 20);
  }, [data]);

  const vehicles = useMemo(() => extractVehicles(data), [data]);

  if (shifts.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
        Recent shifts
      </h2>
      <div className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        <div
          className="grid gap-x-3 bg-black/15 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wider text-(--color-muted)"
          style={{ gridTemplateColumns: '110px 100px 1fr 1fr 90px 80px' }}
        >
          <div>Date</div>
          <div>Vehicle</div>
          <div>Start</div>
          <div>End</div>
          <div className="text-right">Rest before</div>
          <div className="text-right">Distance</div>
        </div>
        {shifts.map((s, i) => {
          const vehicle = vehicleForShift(vehicles, s.startTime, s.endTime);
          return (
            <Link
              key={i}
              to={`/day/${s.date}`}
              className="grid items-center gap-x-3 border-t border-(--color-border) px-4 py-2 text-sm tabular-nums first:border-t-0 hover:bg-white/5"
              style={{ gridTemplateColumns: '110px 100px 1fr 1fr 90px 80px' }}
            >
              <div className="font-mono text-xs">{s.date}</div>
              <div className="font-mono text-xs">
                {vehicle ? vehicle.registration : <span className="text-(--color-muted)">—</span>}
              </div>
              <div className="text-sm">
                <span
                  className="mr-2 inline-block rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem]"
                  title={nationName(s.startCountry)}
                >
                  {nationAlpha(s.startCountry)}
                </span>
                <span className="font-mono text-xs text-(--color-muted)">
                  {formatTimeOfDay(s.startTime)}
                </span>
              </div>
              <div className="text-sm">
                {s.endTime ? (
                  <>
                    <span
                      className="mr-2 inline-block rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.65rem]"
                      title={nationName(s.endCountry ?? 0)}
                    >
                      {nationAlpha(s.endCountry ?? 0)}
                    </span>
                    <span className="font-mono text-xs text-(--color-muted)">
                      {formatTimeOfDay(s.endTime)}
                    </span>
                  </>
                ) : (
                  <span className="text-(--color-muted)">open</span>
                )}
              </div>
              <div
                className={`text-right text-xs ${s.shortRest ? 'text-(--color-warn)' : ''}`}
                title={s.shortRest ? 'Less than 11 hours rest before this shift' : undefined}
              >
                {s.restBeforeMin != null ? formatHours(s.restBeforeMin) : '—'}
                {s.shortRest && <span className="ml-1 font-bold">!</span>}
              </div>
              <div className="text-right text-xs">
                {s.distanceKm != null ? `${s.distanceKm.toLocaleString()} km` : '—'}
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-(--color-muted)">
        Rest before is the gap between the previous shift's end and this shift's start. <span className="text-(--color-warn)">!</span> marks gaps under the EU 11h daily-rest threshold. Click a row for the day breakdown.
      </p>
    </section>
  );
}

function categoryColor(c: ReturnType<typeof eventCategory>): string {
  switch (c) {
    case 'security':
      return 'bg-(--color-warn)/20 text-(--color-warn)';
    case 'fault':
    case 'card-fault':
      return 'bg-amber-500/20 text-amber-200';
    default:
      return 'bg-white/10 text-(--color-muted)';
  }
}

export function EventsPanel({ data }: { data: any }) {
  const rows = useMemo<CardEvent[]>(() => extractEventsAndFaults(data).slice(0, 30), [data]);
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
        Events &amp; faults
      </h2>
      <div className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        <div
          className="grid gap-x-3 bg-black/15 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wider text-(--color-muted)"
          style={{ gridTemplateColumns: '170px 60px 1fr 80px 100px' }}
        >
          <div>When</div>
          <div>Kind</div>
          <div>Type</div>
          <div className="text-right">Duration</div>
          <div>Vehicle</div>
        </div>
        {rows.map((r, i) => {
          const cat = eventCategory(r.type);
          const dur = durationMinutes(r.begin, r.end);
          return (
            <div
              key={i}
              className="grid items-center gap-x-3 border-t border-(--color-border) px-4 py-2 text-sm tabular-nums first:border-t-0"
              style={{ gridTemplateColumns: '170px 60px 1fr 80px 100px' }}
            >
              <div className="font-mono text-xs">
                {r.begin.replace('T', ' ').replace('Z', '')}
              </div>
              <div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider ${categoryColor(cat)}`}
                >
                  {r.kind}
                </span>
              </div>
              <div className="text-sm">{eventTypeLabel(r.type)}</div>
              <div className="text-right text-xs text-(--color-muted)">
                {dur != null ? formatHours(dur) : '—'}
              </div>
              <div className="font-mono text-xs">
                {r.vehicleRegistration || <span className="text-(--color-muted)">—</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

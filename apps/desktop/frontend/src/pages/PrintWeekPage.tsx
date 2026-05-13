import { useMemo, useState } from "react";
import { Link, Navigate, useLoaderData, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";

import { Button } from "@tacholens/ui/components/button";
import {
  computeDailyStats,
  computeDayDetail,
  formatHours,
  type DailyRecord,
  type DailyStats,
} from "../activity";
import { deriveShifts, formatTimeOfDay, type Shift } from "../shifts";
import { vehicleForShift, type VehicleUsage } from "../vehicles";
import { driverSummaryFromProfile } from "../panels";
import { dowLabel, formatWeekRange, groupByWeekSunday } from "../weeks";
import {
  assessWeeklyRest,
  dataWindow,
  extractAmbiguousSpans,
  extractPossibleRestSpans,
  extractRestSpans,
  type WeekRestAssessment,
} from "../weeklyRest";
import { detectWeekInfringements, type Infringement } from "../infringements";
import { useDocumentTitle } from "../useDocumentTitle";
import { PrintWindow } from "../../wailsjs/go/main/App";
import type { DriverLoaderData } from "../loaders";

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "day", label: "Day" },
  { key: "start", label: "Start" },
  { key: "end", label: "End" },
  { key: "vehicle", label: "Vehicle" },
  { key: "drive", label: "Driving" },
  { key: "work", label: "Work" },
  { key: "avail", label: "Available" },
  { key: "rest", label: "Rest" },
  { key: "distance", label: "Distance" },
  { key: "notes", label: "Notes" },
];

export function PrintWeekPage() {
  const { cardNumber, weekStart } = useParams<{
    cardNumber: string;
    weekStart: string;
  }>();
  const data = useLoaderData() as DriverLoaderData;

  const computed = useMemo(() => {
    const stats = data.dailyRecords.map(computeDailyStats);
    const weeks = groupByWeekSunday(stats);
    const shifts = deriveShifts(data.placeRecords);
    const shiftsByDate = new Map<string, Shift>();
    for (const s of shifts) {
      if (!shiftsByDate.has(s.date)) shiftsByDate.set(s.date, s);
    }
    const recordsByDate = new Map<string, DailyRecord>();
    for (const r of data.dailyRecords) {
      recordsByDate.set(r.activity_record_date.slice(0, 10), r);
    }
    const restSpans = extractRestSpans(data.dailyRecords);
    const possibleRest = extractPossibleRestSpans(data.dailyRecords);
    const ambiguous = extractAmbiguousSpans(data.dailyRecords);
    const win = dataWindow(data.dailyRecords);
    return {
      weeks,
      shiftsByDate,
      recordsByDate,
      restSpans,
      possibleRest,
      ambiguous,
      win,
      vehicles: data.vehicles,
    };
  }, [data]);

  const driverSummary = useMemo(
    () => driverSummaryFromProfile(data.profile),
    [data.profile],
  );
  const driver = driverSummary.find((s) => s.label === "Driver")?.value ?? "—";
  const cardNumberDisplay =
    driverSummary.find((s) => s.label === "Card number")?.value ??
    cardNumber ??
    "—";

  const driverPart =
    driver && driver !== "—" ? sanitiseForFilename(driver) : "driver";
  useDocumentTitle(
    weekStart
      ? `Tachograph weekly - ${driverPart} - ${weekStart} to ${addDays(weekStart, 6)}`
      : null,
  );

  if (!cardNumber || !weekStart) return <Navigate to="/" replace />;

  const weekIdx = computed.weeks.findIndex((w) => w.weekStart === weekStart);
  if (weekIdx === -1) {
    return (
      <div className="p-8">
        <p>
          No data for week starting{" "}
          <code className="rounded bg-gray-200 px-1.5 py-0.5">{weekStart}</code>
          .
        </p>
        <Link
          to={`/driver/${cardNumber}/weeks`}
          className="text-blue-600 underline"
        >
          Back to weeks
        </Link>
      </div>
    );
  }

  const week = computed.weeks[weekIdx];
  const prevWeek = computed.weeks[weekIdx + 1] ?? null;
  const weeklyRest: WeekRestAssessment = assessWeeklyRest(
    week,
    computed.restSpans,
    computed.possibleRest,
    computed.ambiguous,
    computed.win,
  );
  const infringements: Infringement[] = detectWeekInfringements({
    week,
    prevWeek,
    recordsByDate: computed.recordsByDate,
    shiftsByDate: computed.shiftsByDate,
    weeklyRest,
  });

  const totals = week.days.reduce(
    (acc, d) => {
      if (!d) return acc;
      acc.drive += d.drivingMin;
      acc.work += d.workMin;
      acc.avail += d.availableMin;
      acc.rest += d.restMin;
      acc.distance += d.distanceKm;
      return acc;
    },
    { drive: 0, work: 0, avail: 0, rest: 0, distance: 0 },
  );

  const restCell = (() => {
    if (weeklyRest.longestRest)
      return `${formatHours(weeklyRest.longestRest.durationMin)} (${weeklyRest.longestRest.start
        .replace("T", " ")
        .slice(
          0,
          16,
        )} → ${weeklyRest.longestRest.end.replace("T", " ").slice(0, 16)})`;
    if (weeklyRest.inconclusive)
      return "Inconclusive (card-not-inserted gap could contain a rest)";
    if (weeklyRest.missing) return "NONE recorded";
    return "—";
  })();

  return (
    <div className="print-page">
      <PrintToolbar cardNumber={cardNumber} />

      <article className="print-sheet">
        <header className="print-header">
          <div className="print-title">
            <div className="print-title-row">TACHOGRAPH WEEKLY REPORT</div>
            <div className="print-subtitle">
              {formatWeekRange(week.weekStart, week.weekEnd)}
            </div>
          </div>
          <table className="print-meta">
            <tbody>
              <tr>
                <th>Driver</th>
                <td>{driver}</td>
                <th>Card #</th>
                <td>{cardNumberDisplay}</td>
              </tr>
              <tr>
                <th>Period</th>
                <td>
                  {week.weekStart} → {week.weekEnd}
                </td>
                <th>Source</th>
                <td>
                  {data.profile.importCount} import
                  {data.profile.importCount === 1 ? "" : "s"}
                </td>
              </tr>
            </tbody>
          </table>
        </header>

        <table className="print-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.days.map((d, i) => (
              <DayRow
                key={i}
                dow={i}
                day={d}
                shiftsByDate={computed.shiftsByDate}
                vehicles={computed.vehicles}
                recordsByDate={computed.recordsByDate}
                weekStart={week.weekStart}
              />
            ))}
            <tr className="print-totals">
              <td colSpan={5} className="text-right">
                TOTALS
              </td>
              <td>{formatHours(totals.drive)}</td>
              <td>{formatHours(totals.work)}</td>
              <td>{formatHours(totals.avail)}</td>
              <td>{formatHours(totals.rest)}</td>
              <td>{totals.distance.toLocaleString()} km</td>
              <td />
            </tr>
          </tbody>
        </table>

        <section className="print-summary">
          <div className="print-row">
            <span className="print-label">Weekly rest:</span>
            <span>{restCell}</span>
          </div>
          {weeklyRest.qualifiesRegular && (
            <div className="print-row">
              <span className="print-label">Status:</span>
              <span>Regular weekly rest (≥45h) ✓</span>
            </div>
          )}
          {weeklyRest.qualifiesReduced && (
            <div className="print-row">
              <span className="print-label">Status:</span>
              <span>Reduced weekly rest (24–45h) — compensation required</span>
            </div>
          )}
          <div className="print-row">
            <span className="print-label">Days driven:</span>
            <span>
              {week.rollup.daysWithDriving} / 7 · Days over 9h:{" "}
              {week.rollup.daysOverLimit}
            </span>
          </div>
        </section>

        <section className="print-infringements">
          <h2>Infringements ({infringements.length})</h2>
          {infringements.length === 0 ? (
            <p className="print-compliant">
              ✓ No infringements detected for this week.
            </p>
          ) : (
            <ol>
              {infringements.map((it, i) => (
                <li key={i} className={`print-inf print-inf-${it.severity}`}>
                  <span className="print-inf-sev">
                    [{it.severity.toUpperCase()}]
                  </span>{" "}
                  <strong>{it.title}</strong>
                  {it.date && (
                    <span className="print-inf-date"> · {it.date}</span>
                  )}
                  <div className="print-inf-desc">{it.description}</div>
                  {it.ruleRef && (
                    <div className="print-inf-ref">{it.ruleRef}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <footer className="print-footer">
          <div className="print-sig">
            <div className="print-sig-line">
              <span>Driver signature</span>
            </div>
            <div className="print-sig-line">
              <span>Date</span>
            </div>
          </div>
          <div className="print-caveat">
            Generated by TachoLens · Weekly rest detected only across
            card-inserted periods · Sun–Sat week buckets used for display (EU
            regulatory week is Mon–Sun) · Compensation tracking for reduced
            weekly rests not modelled.
          </div>
        </footer>
      </article>
    </div>
  );
}

function DayRow({
  dow,
  day,
  shiftsByDate,
  vehicles,
  recordsByDate,
  weekStart,
}: {
  dow: number;
  day: DailyStats | null;
  shiftsByDate: Map<string, Shift>;
  vehicles: VehicleUsage[];
  recordsByDate: Map<string, DailyRecord>;
  weekStart: string;
}) {
  const date = day?.date ?? addDays(weekStart, dow);
  const shift = shiftsByDate.get(date);
  const vehicle = shift
    ? vehicleForShift(vehicles, shift.startTime, shift.endTime)
    : null;
  const rec = recordsByDate.get(date);
  const detail = rec ? computeDayDetail(rec) : null;
  const notes: string[] = [];
  if (day?.wayOverDailyLimit) notes.push("> 10h drive");
  else if (day?.overDailyLimit) notes.push("extension");
  if (detail?.hasBreakBreach) notes.push("break breach");
  if (shift?.shortRest) notes.push("< 11h rest before");

  return (
    <tr className={day ? "" : "print-empty"}>
      <td className="font-mono">{date}</td>
      <td>{dowLabel(dow)}</td>
      <td>{shift ? formatTimeOfDay(shift.startTime) : "—"}</td>
      <td>
        {shift?.endTime ? formatTimeOfDay(shift.endTime) : shift ? "open" : "—"}
      </td>
      <td className="font-mono">{vehicle?.registration ?? "—"}</td>
      <td>{day ? formatHours(day.drivingMin) : "—"}</td>
      <td>{day ? formatHours(day.workMin) : "—"}</td>
      <td>{day ? formatHours(day.availableMin) : "—"}</td>
      <td>{day ? formatHours(day.restMin) : "—"}</td>
      <td>{day ? `${day.distanceKm.toLocaleString()} km` : "—"}</td>
      <td>{notes.join(", ")}</td>
    </tr>
  );
}

function addDays(yyyyMmDd: string, n: number): string {
  const d = new Date(`${yyyyMmDd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function sanitiseForFilename(s: string): string {
  return s
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function PrintToolbar({ cardNumber }: { cardNumber: string }) {
  const [error, setError] = useState<string | null>(null);

  async function printInApp() {
    setError(null);
    try {
      await PrintWindow();
    } catch (e) {
      setError(`Print failed: ${String((e as Error)?.message ?? e)}`);
    }
  }

  return (
    <div className="print-toolbar no-print">
      <div className="flex items-center gap-3">
        <Button asChild size="sm" variant="outline">
          <Link to={`/driver/${cardNumber}/weeks`}>
            <ArrowLeft data-icon="inline-start" />
            Back to weeks
          </Link>
        </Button>
        <span className="text-sm text-gray-600">Print preview</span>
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-red-700">{error}</span>}
        <Button
          size="sm"
          onClick={printInApp}
          title="Open the native print dialog (Save as PDF available there)"
        >
          <Printer data-icon="inline-start" />
          Print
        </Button>
      </div>
    </div>
  );
}

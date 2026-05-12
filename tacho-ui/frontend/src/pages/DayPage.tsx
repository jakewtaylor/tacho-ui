import { useMemo } from "react";
import { Link, Navigate, useLocation, useParams, useRouteLoaderData } from "react-router-dom";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { DayDetail } from "../DayDetail";
import { MapPanel } from "../MapPanel";
import {
  computeDailyStats,
  computeDayDetail,
  formatHours,
  type DailyStats,
} from "../activity";
import { deriveShifts } from "../shifts";
import { detectDayInfringements } from "../infringements";
import { InfringementsPanel } from "../InfringementsPanel";
import { pageTitle, useDocumentTitle } from "../useDocumentTitle";
import type { DriverLoaderData } from "../loaders";

function formatHeading(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function DayPage() {
  const { cardNumber, date } = useParams<{ cardNumber: string; date: string }>();
  const navState = useLocation().state as { from?: string } | null;
  const data = useRouteLoaderData("driver") as DriverLoaderData;

  const sortedDates = useMemo(
    () =>
      data.dailyRecords
        .map((r) => r.activity_record_date.slice(0, 10))
        .sort((a, b) => a.localeCompare(b)),
    [data.dailyRecords],
  );

  const driverName = useMemo(() => {
    const p = data.profile;
    return [p.firstNames, p.surname].filter(Boolean).join(" ") || p.cardNumber;
  }, [data.profile]);
  useDocumentTitle(
    pageTitle(date && driverName ? `${date} — ${driverName}` : (date ?? null)),
  );

  if (!cardNumber || !date) return <Navigate to="/" replace />;

  const idx = sortedDates.indexOf(date);
  const record = data.dailyRecords.find(
    (r) => r.activity_record_date.slice(0, 10) === date,
  );

  if (!record || idx === -1) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No activity for {date}</EmptyTitle>
          <EmptyDescription>
            There’s no record for this date on this card.
          </EmptyDescription>
        </EmptyHeader>
        <Button asChild variant="outline">
          <Link to={`/driver/${cardNumber}`}>Back to driver overview</Link>
        </Button>
      </Empty>
    );
  }

  const prevDate = idx > 0 ? sortedDates[idx - 1] : null;
  const nextDate = idx < sortedDates.length - 1 ? sortedDates[idx + 1] : null;
  const stats: DailyStats = computeDailyStats(record);
  const detail = computeDayDetail(record);
  const shift = deriveShifts(data.placeRecords).find((s) => s.date === date) ?? null;
  const infringements = detectDayInfringements({ stats, detail, shift });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-2">
            <NavButton
              to={prevDate ? `/driver/${cardNumber}/day/${prevDate}` : null}
              direction="prev"
              state={navState}
            />
            <div className="flex flex-col items-center text-center">
              <CardDescription className="font-mono tabular-nums">{date}</CardDescription>
              <CardTitle className="text-xl">{formatHeading(date)}</CardTitle>
              <CardDescription>
                Day {idx + 1} of {sortedDates.length}
              </CardDescription>
            </div>
            <NavButton
              to={nextDate ? `/driver/${cardNumber}/day/${nextDate}` : null}
              direction="next"
              state={navState}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DayChip
              label="Driving"
              value={formatHours(stats.drivingMin)}
              warn={stats.overDailyLimit}
            />
            <DayChip label="Work" value={formatHours(stats.workMin)} />
            <DayChip label="Rest" value={formatHours(stats.restMin)} />
            <DayChip label="Distance" value={`${stats.distanceKm.toLocaleString()} km`} />
          </div>
        </CardContent>
      </Card>

      <InfringementsPanel items={infringements} linkDates={false} />

      <DayDetail record={record} />

      <MapPanel points={data.gnssPoints} dateFilter={date} title={`Driving map · ${date}`} />
    </div>
  );
}

function NavButton({
  to,
  direction,
  state,
}: {
  to: string | null;
  direction: "prev" | "next";
  state?: unknown;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const label = direction === "prev" ? "Previous day" : "Next day";
  if (!to) {
    return (
      <Button variant="ghost" size="sm" disabled>
        {direction === "prev" && <Icon data-icon="inline-start" />}
        {label}
        {direction === "next" && <Icon data-icon="inline-end" />}
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" asChild>
      <Link to={to} state={state}>
        {direction === "prev" && <Icon data-icon="inline-start" />}
        {label}
        {direction === "next" && <Icon data-icon="inline-end" />}
      </Link>
    </Button>
  );
}

function DayChip({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="uppercase tracking-wider">{label}</CardDescription>
        <CardTitle
          className={
            "font-heading text-xl tabular-nums " +
            (warn ? "inline-flex items-center gap-1 text-destructive" : "")
          }
        >
          {warn && <TriangleAlert className="size-4" />}
          {value}
        </CardTitle>
      </CardHeader>
    </Card>
  );
}

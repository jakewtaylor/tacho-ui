import { useMemo } from "react";
import { Link, useRouteLoaderData } from "react-router-dom";
import { CheckCircle2, Printer, ShieldAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@tacholens/ui/alert";
import { Badge } from "@tacholens/ui/badge";
import { Button } from "@tacholens/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tacholens/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@tacholens/ui/empty";
import { cn } from "@tacholens/ui/utils";
import {
  computeDailyStats,
  formatHours,
  type DailyRecord,
  type DailyStats,
} from "../activity";
import { deriveShifts, type Shift } from "../shifts";
import {
  countInfringements,
  detectWeekInfringements,
  type Infringement,
} from "../infringements";
import { InfringementsPanel } from "../InfringementsPanel";
import {
  dowLabel,
  formatWeekRange,
  groupByWeekSunday,
  type WeekBucket,
} from "../weeks";
import {
  assessWeeklyRest,
  dataWindow,
  extractAmbiguousSpans,
  extractPossibleRestSpans,
  extractRestSpans,
  type WeekRestAssessment,
} from "../weeklyRest";
import { pageTitle, useDocumentTitle } from "../useDocumentTitle";
import type { DriverLoaderData } from "../loaders";

export function WeeksPage() {
  const data = useRouteLoaderData("driver") as DriverLoaderData;

  const driverName = useMemo(() => {
    const p = data.profile;
    return [p.firstNames, p.surname].filter(Boolean).join(" ") || p.cardNumber;
  }, [data.profile]);
  useDocumentTitle(pageTitle(`Weekly summary — ${driverName}`));

  const { weeks, recordsByDate, shiftsByDate, weeklyRestByWeek } =
    useMemo(() => {
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
        restMap.set(
          w.weekStart,
          assessWeeklyRest(w, restSpans, possible, ambiguous, win),
        );
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

  if (weeks.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No driver activity</EmptyTitle>
          <EmptyDescription>
            No driver activity records found on this card.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Weekly summary</h1>
        <p className="text-xs text-muted-foreground">
          {weeks.length} week{weeks.length === 1 ? "" : "s"} · Sunday as day 1
        </p>
      </div>

      <ComplianceHeadline counts={totalCounts} weeks={weeks.length} />

      <div className="flex flex-col gap-3">
        {weeks.map((w) => (
          <WeekCard
            key={w.weekStart}
            cardNumber={data.cardNumber}
            bucket={w}
            infringements={weekInfringements.get(w.weekStart) ?? []}
            weeklyRest={weeklyRestByWeek.get(w.weekStart) ?? null}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Weekly limits are computed against the displayed Sunday–Saturday bucket.
        The EU regulatory "fixed week" runs Monday 00:00 → Sunday 24:00 — totals
        near a Sun/Mon boundary may differ from a strict compliance calculation.
        Weekly rest is detected only across periods where the card was inserted;
        long card-not-inserted gaps may surface as "could not be confirmed".
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
      <Alert className="border-emerald-500/40 bg-emerald-500/5">
        <CheckCircle2 className="text-emerald-400" />
        <AlertTitle className="text-emerald-300">
          Compliant across {weeks} week{weeks === 1 ? "" : "s"}
        </AlertTitle>
        <AlertDescription>
          No driver-hours infringements detected on the card.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <ShieldAlert />
      <AlertTitle>
        {counts.breach} breach{counts.breach === 1 ? "" : "es"}
        {counts.warning > 0
          ? `, ${counts.warning} warning${counts.warning === 1 ? "" : "s"}`
          : ""}
        {counts.info > 0 ? `, ${counts.info} info` : ""} across {weeks} week
        {weeks === 1 ? "" : "s"}
      </AlertTitle>
      <AlertDescription>
        See per-week breakdowns below for the rule, date, and quantity behind
        each entry.
      </AlertDescription>
    </Alert>
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
    if (!weeklyRest) return "—";
    if (weeklyRest.longestRest)
      return formatHours(weeklyRest.longestRest.durationMin);
    if (weeklyRest.inconclusive) return "?";
    return "None";
  })();
  const restWarn =
    !!weeklyRest && (weeklyRest.missing || weeklyRest.qualifiesReduced);
  const restTitle = weeklyRest?.longestRest
    ? `${weeklyRest.longestRest.start.replace("T", " ").slice(0, 16)} → ${weeklyRest.longestRest.end.replace("T", " ").slice(0, 16)}`
    : weeklyRest?.missing
      ? "No qualifying ≥24h rest overlaps this week"
      : weeklyRest?.inconclusive
        ? "Week extends past recorded data — verdict deferred"
        : undefined;
  return (
    <Card className={cn(counts.breach > 0 && "ring-2 ring-destructive/40")}>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-baseline gap-2">
          <CardTitle>{formatWeekRange(weekStart, weekEnd)}</CardTitle>
          <ComplianceChip counts={counts} />
        </div>
        <CardDescription className="font-mono">
          {weekStart} → {weekEnd}
        </CardDescription>
        <CardAction>
          <Button asChild variant="outline" size="sm">
            <Link
              to={`/driver/${cardNumber}/print/week/${weekStart}`}
              title="Open a printable spreadsheet view of this week"
            >
              <Printer data-icon="inline-start" />
              Print
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
          <WeekStat label="Driving" value={formatHours(r.totalDrivingMin)} />
          <WeekStat label="Work" value={formatHours(r.totalWorkMin)} />
          <WeekStat label="Rest" value={formatHours(r.totalRestMin)} />
          <WeekStat
            label="Distance"
            value={`${r.totalDistanceKm.toLocaleString()} km`}
          />
          <WeekStat label="Days driven" value={`${r.daysWithDriving}/7`} />
          <WeekStat
            label="Over 9h"
            value={String(r.daysOverLimit)}
            warn={r.daysOverLimit > 0}
          />
          <WeekStat
            label="Weekly rest"
            value={restValue}
            warn={restWarn}
            title={restTitle}
          />
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, i) => (
            <DayCell key={i} cardNumber={cardNumber} dow={i} day={d} />
          ))}
        </div>
        {hasIssues && (
          <InfringementsPanel
            items={infringements}
            title="Infringements this week"
            hideWhenEmpty
          />
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceChip({
  counts,
}: {
  counts: ReturnType<typeof countInfringements>;
}) {
  if (counts.total === 0) {
    return (
      <Badge className="bg-emerald-500/20 text-emerald-300">Compliant</Badge>
    );
  }
  if (counts.breach > 0) {
    return (
      <Badge variant="destructive">
        {counts.breach} breach{counts.breach === 1 ? "" : "es"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      {counts.total} note{counts.total === 1 ? "" : "s"}
    </Badge>
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
      <div className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          warn ? "text-destructive" : "text-foreground",
        )}
      >
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
      <div className="flex flex-col gap-1 rounded-md border border-dashed bg-muted/30 px-2 py-2 text-center text-[0.65rem] text-muted-foreground">
        <div className="font-semibold uppercase tracking-wider">{label}</div>
        <div>—</div>
      </div>
    );
  }
  return (
    <Link
      to={`/driver/${cardNumber}/day/${day.date}`}
      state={{ from: "weeks" }}
      className="flex flex-col gap-1 rounded-md border bg-card px-2 py-2 text-center transition-colors hover:bg-muted/50"
    >
      <div className="flex items-baseline justify-between text-[0.65rem]">
        <span className="font-semibold uppercase tracking-wider">{label}</span>
        <span className="font-mono text-muted-foreground">
          {day.date.slice(8)}
        </span>
      </div>
      <DayBars day={day} />
      <div className="flex items-baseline justify-between text-[0.7rem] tabular-nums">
        <span
          className={
            day.wayOverDailyLimit || day.overDailyLimit
              ? "font-semibold text-destructive"
              : ""
          }
        >
          {formatHours(day.drivingMin)}
        </span>
        <span className="text-muted-foreground">
          {day.distanceKm.toLocaleString()}km
        </span>
      </div>
    </Link>
  );
}

function DayBars({ day }: { day: DailyStats }) {
  const total = 16 * 60;
  const pct = (m: number) => `${Math.min(100, (m / total) * 100)}%`;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="flex h-full">
        <span
          className="block"
          style={{
            width: pct(day.drivingMin),
            background: "var(--color-driving)",
          }}
        />
        <span
          className="block"
          style={{ width: pct(day.workMin), background: "var(--color-work)" }}
        />
        <span
          className="block"
          style={{
            width: pct(day.availableMin),
            background: "var(--color-available)",
          }}
        />
      </div>
    </div>
  );
}

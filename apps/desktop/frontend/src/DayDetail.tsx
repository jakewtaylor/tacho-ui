import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@tacholens/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@tacholens/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@tacholens/ui/collapsible";
import { ScrollArea } from "@tacholens/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tacholens/ui/table";
import {
  computeDayDetail,
  formatClock,
  formatHours,
  Thresholds,
  type ActivitySegment,
  type DailyRecord,
  type DrivingSession,
  type WorkType,
} from "./activity";

type Props = {
  record: DailyRecord;
};

const SEGMENT_COLORS: Record<WorkType, string> = {
  0: "var(--color-rest)",
  1: "var(--color-available)",
  2: "var(--color-work)",
  3: "var(--color-driving)",
};

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  0: "Rest",
  1: "Available",
  2: "Work",
  3: "Driving",
};

const NO_CARD_COLOR = "var(--color-no-card)";
const MINUTES_IN_DAY = 1440;

function Timeline({ segments }: { segments: ActivitySegment[] }) {
  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24];
  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${MINUTES_IN_DAY} 36`}
        preserveAspectRatio="none"
        className="h-9 w-full rounded-md bg-muted"
        role="img"
        aria-label="24-hour activity timeline"
      >
        {segments.map((seg, i) => (
          <rect
            key={i}
            x={seg.startMin}
            y={0}
            width={Math.max(1, seg.endMin - seg.startMin)}
            height={36}
            fill={
              seg.cardPresent ? SEGMENT_COLORS[seg.workType] : NO_CARD_COLOR
            }
          >
            <title>
              {formatClock(seg.startMin)}–{formatClock(seg.endMin)} ·{" "}
              {WORK_TYPE_LABELS[seg.workType]}
              {seg.cardPresent ? "" : " (card not inserted)"}
            </title>
          </rect>
        ))}
      </svg>
      <div className="relative h-3 w-full text-[0.6rem] text-muted-foreground">
        {hourTicks.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 tabular-nums"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
      </div>
    </div>
  );
}

function DrivingSessions({ sessions }: { sessions: DrivingSession[] }) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No driving recorded for this day.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead className="text-right">Driving</TableHead>
          <TableHead className="text-right">Break after</TableHead>
          <TableHead>Compliance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((s, i) => {
          const isSplit = s.firstBreakMin != null && s.secondBreakMin != null;
          return (
            <TableRow key={i}>
              <TableCell className="font-mono text-xs">
                {formatClock(s.startMin)}–{formatClock(s.endMin)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatHours(s.drivingMin)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.followingBreakMin > 0 ? (
                  isSplit ? (
                    <span
                      title={`${s.firstBreakMin}m + ${s.secondBreakMin}m split`}
                    >
                      {s.firstBreakMin}+{s.secondBreakMin}m
                    </span>
                  ) : (
                    formatHours(s.followingBreakMin)
                  )
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>
                {s.breachedContinuous ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <TriangleAlert className="size-3" />
                    Over 4h 30m driving before a qualifying break
                  </span>
                ) : isSplit ? (
                  <span className="text-muted-foreground">
                    OK (split break)
                  </span>
                ) : s.drivingMin >= Thresholds.CONTINUOUS_DRIVING_MAX_MIN ? (
                  <span className="text-muted-foreground">
                    At limit, break observed
                  </span>
                ) : (
                  <span className="text-muted-foreground">OK</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AllSegments({ segments }: { segments: ActivitySegment[] }) {
  const filtered = segments.filter((s) => s.durationMin >= 1);
  if (filtered.length === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground">
        All segments ({filtered.length})
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ScrollArea className="mt-2 h-56 rounded-md border">
          <Table>
            <TableBody>
              {filtered.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-[0.7rem]">
                    {formatClock(s.startMin)}–{formatClock(s.endMin)}
                  </TableCell>
                  <TableCell className="text-right text-[0.7rem] tabular-nums">
                    {formatHours(s.durationMin)}
                  </TableCell>
                  <TableCell className="text-[0.7rem]">
                    <span
                      className="mr-1 inline-block size-2 rounded-sm align-middle"
                      style={{
                        background: s.cardPresent
                          ? SEGMENT_COLORS[s.workType]
                          : NO_CARD_COLOR,
                      }}
                    />
                    {WORK_TYPE_LABELS[s.workType]}
                  </TableCell>
                  <TableCell className="text-[0.7rem] text-muted-foreground">
                    {s.cardPresent ? "" : "card not inserted"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function DayDetail({ record }: Props) {
  const detail = useMemo(() => computeDayDetail(record), [record]);
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          Detail · {detail.date}
          {detail.hasBreakBreach && (
            <Badge variant="destructive">Break breach</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Timeline segments={detail.segments} />
        <div>
          <h3 className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Driving sessions
          </h3>
          <div className="rounded-md border">
            <DrivingSessions sessions={detail.drivingSessions} />
          </div>
        </div>
        <AllSegments segments={detail.segments} />
      </CardContent>
    </Card>
  );
}

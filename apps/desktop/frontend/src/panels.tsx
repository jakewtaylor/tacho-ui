import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@tacholens/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@tacholens/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tacholens/ui/components/table";
import {
  computeDailyStats,
  formatHours,
  rollup,
  type DailyRecord,
  type DailyStats,
} from "./activity";
import { DailyActivityChart } from "./DailyActivityChart";
import {
  deriveShifts,
  formatTimeOfDay,
  type PlaceRecord,
  type Shift,
} from "./shifts";
import { nationAlpha, nationName } from "./nations";
import { vehicleForShift, type VehicleUsage } from "./vehicles";
import { durationMinutes, type CardEvent } from "./events";
import { eventCategory, eventTypeLabel } from "./eventTypes";
import {
  deriveBorderTrips,
  isPhantomDropout,
  type BorderTrip,
} from "./borderCrossings";
import type { db } from "../wailsjs/go/models";

const ROW_LIMIT = 50;

export type Summary = {
  label: string;
  value: string;
};

export function driverSummaryFromProfile(
  profile: db.DriverProfile | null,
): Summary[] {
  if (!profile) return [];
  const out: Summary[] = [];
  const name = [profile.firstNames, profile.surname].filter(Boolean).join(" ");
  if (name) out.push({ label: "Driver", value: name });
  out.push({ label: "Card number", value: profile.cardNumber });
  if (profile.issuingState) {
    out.push({
      label: "Issuing member state",
      value: nationName(profile.issuingState),
    });
  }
  if (profile.cardIssueDate)
    out.push({ label: "Issued", value: profile.cardIssueDate });
  if (profile.cardExpiryDate)
    out.push({ label: "Expires", value: profile.cardExpiryDate });
  if (profile.birthDate)
    out.push({ label: "Date of birth", value: profile.birthDate });
  if (profile.firstDate && profile.lastDate) {
    out.push({
      label: "Data range",
      value: `${profile.firstDate} → ${profile.lastDate}`,
    });
  }
  out.push({
    label: "Imports",
    value: `${profile.importCount} (${profile.dailyRecordCount} days)`,
  });
  return out;
}

export function DriverSummaryPanel({ summary }: { summary: Summary[] }) {
  if (summary.length === 0) return null;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Driver</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableBody>
            {summary.map((s) => (
              <TableRow key={s.label}>
                <TableCell className="w-[220px] pl-4 text-muted-foreground">
                  {s.label}
                </TableCell>
                <TableCell className="pr-4 font-mono">{s.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="uppercase tracking-wider">
          {label}
        </CardDescription>
        <CardTitle className="font-heading text-2xl tabular-nums">
          {value}
        </CardTitle>
      </CardHeader>
      {hint && (
        <CardFooter className="pt-0 text-xs text-muted-foreground">
          {hint}
        </CardFooter>
      )}
    </Card>
  );
}

function MiniBar({ day }: { day: DailyStats }) {
  const total = 16 * 60;
  const pct = (m: number) => `${Math.min(100, (m / total) * 100)}%`;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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

function Legend() {
  const items = [
    { label: "Driving", color: "var(--color-driving)" },
    { label: "Work", color: "var(--color-work)" },
    { label: "Available", color: "var(--color-available)" },
  ];
  return (
    <div className="flex items-center gap-3 text-[0.7rem] text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1">
          <i
            className="inline-block size-2.5 rounded-sm"
            style={{ background: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ActivityPanel({
  cardNumber,
  records,
}: {
  cardNumber: string;
  records: DailyRecord[];
}) {
  const navigate = useNavigate();
  const allDays = useMemo(() => records.map(computeDailyStats), [records]);

  if (allDays.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Driver activity</CardTitle>
          <CardDescription>
            No driver activity records found on this card.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const last7 = allDays.slice(0, 7);
  const last28 = allDays.slice(0, 28);
  const r7 = rollup(last7);
  const r28 = rollup(last28);
  const fullRollup = rollup(allDays);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Driver activity
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Last 7 days driving"
          value={formatHours(r7.totalDrivingMin)}
          hint={`${r7.daysWithDriving} active day${r7.daysWithDriving === 1 ? "" : "s"} · ${r7.totalDistanceKm.toLocaleString()} km`}
        />
        <StatCard
          label="Last 28 days driving"
          value={formatHours(r28.totalDrivingMin)}
          hint={`${r28.daysWithDriving} active day${r28.daysWithDriving === 1 ? "" : "s"} · ${r28.totalDistanceKm.toLocaleString()} km`}
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

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Daily activity · last 28 days</CardTitle>
          <CardDescription>
            Periods with the card inserted only. Dashed line marks the EU 9h
            daily limit.
          </CardDescription>
          <CardAction>
            <Legend />
          </CardAction>
        </CardHeader>
        <CardContent>
          <DailyActivityChart days={last28} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Date</TableHead>
                <TableHead className="min-w-[140px]">Activity</TableHead>
                <TableHead className="text-right">Driving</TableHead>
                <TableHead className="text-right">Work</TableHead>
                <TableHead className="text-right">Rest</TableHead>
                <TableHead className="pr-4 text-right">Km</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {last28.map((day) => (
                <TableRow
                  key={day.date}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate(`/driver/${cardNumber}/day/${day.date}`)
                  }
                >
                  <TableCell className="pl-4 font-mono text-xs">
                    {day.date}
                  </TableCell>
                  <TableCell>
                    <MiniBar day={day} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {formatHours(day.drivingMin)}
                      {day.wayOverDailyLimit ? (
                        <TriangleAlert
                          className="size-3 text-destructive"
                          aria-label="Over 10h driving"
                        />
                      ) : day.overDailyLimit ? (
                        <TriangleAlert
                          className="size-3 text-amber-400"
                          aria-label="Over 9h driving"
                        />
                      ) : null}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatHours(day.workMin)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatHours(day.restMin)}
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">
                    {day.distanceKm.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="text-xs text-muted-foreground">
          Click a day for a 24-hour timeline, GNSS map, and break-compliance
          breakdown.
        </CardFooter>
      </Card>
    </section>
  );
}

export function ShiftsPanel({
  cardNumber,
  placeRecords,
  vehicles,
}: {
  cardNumber: string;
  placeRecords: PlaceRecord[];
  vehicles: VehicleUsage[];
}) {
  const navigate = useNavigate();
  const shifts = useMemo<Shift[]>(
    () => deriveShifts(placeRecords).slice(0, 20),
    [placeRecords],
  );

  if (shifts.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Recent shifts</CardTitle>
        <CardDescription>
          Rest before is the gap between the previous shift’s end and this
          shift’s start. A warning marks gaps under the EU 11h daily-rest
          threshold.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Date</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Rest before</TableHead>
              <TableHead className="pr-4 text-right">Distance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.map((s, i) => {
              const vehicle = vehicleForShift(vehicles, s.startTime, s.endTime);
              return (
                <TableRow
                  key={i}
                  className="cursor-pointer"
                  onClick={() =>
                    navigate(`/driver/${cardNumber}/day/${s.date}`)
                  }
                >
                  <TableCell className="pl-4 font-mono text-xs">
                    {s.date}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {vehicle ? (
                      vehicle.registration
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="mr-2 font-mono">
                      {nationAlpha(s.startCountry)}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatTimeOfDay(s.startTime)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {s.endTime ? (
                      <>
                        <Badge variant="outline" className="mr-2 font-mono">
                          {nationAlpha(s.endCountry ?? 0)}
                        </Badge>
                        <span className="font-mono text-xs text-muted-foreground">
                          {formatTimeOfDay(s.endTime)}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">open</span>
                    )}
                  </TableCell>
                  <TableCell
                    className={
                      "text-right text-xs tabular-nums " +
                      (s.shortRest ? "text-destructive" : "")
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {s.restBeforeMin != null
                        ? formatHours(s.restBeforeMin)
                        : "—"}
                      {s.shortRest && <TriangleAlert className="size-3" />}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4 text-right text-xs tabular-nums">
                    {s.distanceKm != null
                      ? `${s.distanceKm.toLocaleString()} km`
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function categoryBadgeVariant(
  c: ReturnType<typeof eventCategory>,
): "destructive" | "outline" | "secondary" {
  switch (c) {
    case "security":
      return "destructive";
    case "fault":
    case "card-fault":
      return "outline";
    default:
      return "secondary";
  }
}

function formatTimestamp(s: string): string {
  return s.replace("T", " ").replace("Z", "");
}

function authBadge(status: string | undefined): ReactNode {
  if (!status || status === "unknown") return null;
  const ok = status === "authenticated";
  return (
    <Badge
      variant={ok ? "secondary" : "outline"}
      className={ok ? "font-mono text-[10px]" : "font-mono text-[10px] text-amber-500"}
      title={ok ? "GNSS position authenticated by the VU" : "GNSS position NOT authenticated"}
    >
      {ok ? "✓ auth" : "⚠ unauth"}
    </Badge>
  );
}

function operationBadge(op: string): ReactNode {
  const variants: Record<string, "secondary" | "outline" | "destructive"> = {
    load: "secondary",
    unload: "outline",
    simultaneous: "destructive",
    unknown: "outline",
  };
  return <Badge variant={variants[op] ?? "outline"}>{op}</Badge>;
}

function loadTypeBadge(t: string): ReactNode {
  return (
    <Badge variant="outline" className="font-mono text-xs">
      {t}
    </Badge>
  );
}

function tripWhen(t: BorderTrip): string {
  return t.kind === "offmap" ? t.leftAt : t.at;
}

function durationMins(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.max(0, Math.round(ms / 60000));
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function locationCell(lat: number, lng: number, auth?: string): ReactNode {
  return (
    <>
      <span className="font-mono text-xs">
        {lat || lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "—"}
      </span>
      <span className="ml-2">{authBadge(auth)}</span>
    </>
  );
}

function countryCell(code: number): ReactNode {
  return (
    <>
      <Badge variant="outline" className="font-mono">
        {nationAlpha(code)}
      </Badge>
      <span className="ml-2 text-xs text-muted-foreground">
        {nationName(code)}
      </span>
    </>
  );
}

export function BorderCrossingsPanel({
  crossings,
}: {
  crossings: db.BorderCrossing[];
}) {
  const [showDropouts, setShowDropouts] = useState(false);

  const trips = useMemo(() => deriveBorderTrips(crossings), [crossings]);
  const dropoutCount = useMemo(
    () => trips.filter(isPhantomDropout).length,
    [trips],
  );

  const visible = useMemo(() => {
    const filtered = showDropouts
      ? trips
      : trips.filter((t) => !isPhantomDropout(t));
    // Newest first, truncate.
    return filtered
      .slice()
      .sort((a, b) => tripWhen(b).localeCompare(tripWhen(a)))
      .slice(0, ROW_LIMIT);
  }, [trips, showDropouts]);

  if (trips.length === 0) return null;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Border crossings</CardTitle>
        <CardDescription>
          Vehicle-unit-detected changes of country and off-map transit
          (Gen2v2 only). {trips.length - dropoutCount} crossings
          {dropoutCount > 0 && (
            <>
              {" "}· {dropoutCount} GPS dropout{dropoutCount === 1 ? "" : "s"}
              {" "}
              <button
                type="button"
                className="text-xs underline-offset-4 hover:underline"
                onClick={() => setShowDropouts((s) => !s)}
              >
                {showDropouts ? "(hide)" : "(show)"}
              </button>
            </>
          )}
          .{" "}
          <span className="text-muted-foreground">
            Off-map = the VU couldn't place the vehicle on its onboard digital
            map (typically at sea on a ferry, or briefly at a port).
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="pr-4 text-right">Odometer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((t, i) => {
              if (t.kind === "crossing") {
                return (
                  <TableRow key={`x-${t.at}-${i}`}>
                    <TableCell className="pl-4 font-mono text-xs">
                      {formatTimestamp(t.at)}
                    </TableCell>
                    <TableCell>{countryCell(t.from)}</TableCell>
                    <TableCell>{countryCell(t.to)}</TableCell>
                    <TableCell>
                      {locationCell(
                        t.latitude,
                        t.longitude,
                        t.authenticationStatus,
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                      {t.odometer.toLocaleString()} km
                    </TableCell>
                  </TableRow>
                );
              }
              if (t.kind === "offmap") {
                const dur = durationMins(t.leftAt, t.rejoinedAt);
                const isDropout = t.classification === "dropout";
                return (
                  <TableRow key={`o-${t.leftAt}-${i}`}>
                    <TableCell className="pl-4 font-mono text-xs">
                      {formatTimestamp(t.leftAt)}
                      <div className="text-[10px] text-muted-foreground">
                        off-map for {formatDuration(dur)}
                      </div>
                    </TableCell>
                    <TableCell>{countryCell(t.from)}</TableCell>
                    <TableCell>
                      {isDropout ? (
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px] text-muted-foreground"
                          title="Vehicle never crossed a border — GPS or map briefly couldn't place it"
                        >
                          GPS dropout
                        </Badge>
                      ) : (
                        countryCell(t.to)
                      )}
                    </TableCell>
                    <TableCell>
                      {locationCell(
                        t.fromLatitude,
                        t.fromLongitude,
                        t.authenticationStatus,
                      )}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                      {t.odometer.toLocaleString()} km
                      {t.kmTravelled > 1 && (
                        <div className="text-[10px] text-muted-foreground">
                          +{t.kmTravelled.toLocaleString()} km off-map
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              }
              // orphan
              return (
                <TableRow key={`orphan-${t.at}-${i}`}>
                  <TableCell className="pl-4 font-mono text-xs text-muted-foreground">
                    {formatTimestamp(t.at)}
                  </TableCell>
                  <TableCell>{countryCell(t.from)}</TableCell>
                  <TableCell>{countryCell(t.to)}</TableCell>
                  <TableCell>
                    {locationCell(
                      t.latitude,
                      t.longitude,
                      t.authenticationStatus,
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                    {t.odometer.toLocaleString()} km
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CargoPanel({
  loadUnloadOps,
  loadTypeEntries,
}: {
  loadUnloadOps: db.LoadUnloadOp[];
  loadTypeEntries: db.LoadTypeEntry[];
}) {
  const ops = useMemo(
    () => loadUnloadOps.slice(-ROW_LIMIT).reverse(),
    [loadUnloadOps],
  );
  const types = useMemo(
    () => loadTypeEntries.slice(-ROW_LIMIT).reverse(),
    [loadTypeEntries],
  );
  if (ops.length === 0 && types.length === 0) return null;
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Cargo events</CardTitle>
        <CardDescription>
          Load/unload presses and load-type entries from the vehicle unit
          (Gen2v2 only). {ops.length} operations, {types.length} type changes
          on this card.
        </CardDescription>
      </CardHeader>
      {ops.length > 0 && (
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="pr-4 text-right">Odometer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ops.map((r, i) => (
                <TableRow key={`op-${r.operationAt}-${i}`}>
                  <TableCell className="pl-4 font-mono text-xs">
                    {formatTimestamp(r.operationAt)}
                  </TableCell>
                  <TableCell>{operationBadge(r.operationType)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {r.latitude || r.longitude
                      ? `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`
                      : "—"}
                    <span className="ml-2">
                      {authBadge(r.authenticationStatus)}
                    </span>
                  </TableCell>
                  <TableCell className="pr-4 text-right font-mono text-xs tabular-nums">
                    {r.odometer.toLocaleString()} km
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
      {types.length > 0 && (
        <CardContent className="px-0">
          <div className="border-t px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">
            Load type changes
          </div>
          <Table>
            <TableBody>
              {types.map((r, i) => (
                <TableRow key={`type-${r.enteredAt}-${i}`}>
                  <TableCell className="pl-4 font-mono text-xs">
                    {formatTimestamp(r.enteredAt)}
                  </TableCell>
                  <TableCell className="pr-4">{loadTypeBadge(r.loadType)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}

export function EventsPanel({ events }: { events: CardEvent[] }) {
  const rows = useMemo<CardEvent[]>(() => events.slice(0, 30), [events]);
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Events &amp; faults</CardTitle>
        <CardDescription>
          Newest {rows.length} entries from the card (events + faults arrays).
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">When</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead className="pr-4">Vehicle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const cat = eventCategory(r.type);
              const dur = durationMinutes(r.begin, r.end);
              return (
                <TableRow key={i}>
                  <TableCell className="pl-4 font-mono text-xs">
                    {r.begin.replace("T", " ").replace("Z", "")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={categoryBadgeVariant(cat)}>{r.kind}</Badge>
                  </TableCell>
                  <TableCell>{eventTypeLabel(r.type)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                    {dur != null ? formatHours(dur) : "—"}
                  </TableCell>
                  <TableCell className="pr-4 font-mono text-xs">
                    {r.vehicleRegistration || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

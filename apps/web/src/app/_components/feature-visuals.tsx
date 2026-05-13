import { monthSeries, routePoints, routeStops } from "../_content/mock-week";

/** Sparkline of 28 daily driving hours — bars > 9h render in breach red. */
export function MonthSparklineBars() {
  return (
    <div className="flex items-end gap-1.5 h-[60px] mt-2">
      {monthSeries.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            background: v > 9 ? "var(--breach)" : "var(--driving)",
            height: `${Math.max(2, (v / 12) * 60)}px`,
            opacity: v > 0 ? 1 : 0.2,
          }}
        />
      ))}
    </div>
  );
}

/** Horizontal 24h timeline with EU 165/2014 colour segments. */
export function DayTimelineMini() {
  const segs: { w: number; c: string }[] = [
    { w: 5, c: "var(--rest)" },
    { w: 1.2, c: "var(--work)" },
    { w: 4.4, c: "var(--driving)" },
    { w: 0.75, c: "var(--rest)" },
    { w: 3.5, c: "var(--driving)" },
    { w: 0.5, c: "var(--available)" },
    { w: 2.5, c: "var(--driving)" },
    { w: 0.4, c: "var(--work)" },
    { w: 5.75, c: "var(--rest)" },
  ];
  const total = segs.reduce((s, x) => s + x.w, 0);
  return (
    <div className="mt-2">
      <div className="flex h-3 rounded-sm overflow-hidden border border-hairline">
        {segs.map((s, i) => (
          <div
            key={i}
            style={{ flex: s.w / total, background: s.c }}
            aria-hidden
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 font-mono text-[9px] text-ink-3">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}

/** Stylised GNSS route on a graph-paper background. */
export function RouteMini() {
  const path = routePoints
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 80"
      className="w-full h-[80px] rounded-sm border border-hairline"
      preserveAspectRatio="none"
      aria-label="Mini route from Calais to Warszawa"
    >
      <defs>
        <pattern
          id="grid-paper-pattern"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 8 0 L 0 0 0 8"
            fill="none"
            stroke="var(--hairline)"
            strokeWidth="0.3"
          />
        </pattern>
      </defs>
      <rect width="100" height="80" fill="url(#grid-paper-pattern)" />
      <path
        d={path}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {routeStops.map((s) => (
        <g key={s.label}>
          <circle cx={s.x} cy={s.y} r="1.6" fill="var(--brand)" />
          <circle
            cx={s.x}
            cy={s.y}
            r="3"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="0.5"
            opacity="0.4"
          />
        </g>
      ))}
    </svg>
  );
}

/** Miniature of the A4-print weekly report. */
export function PrintMini() {
  return (
    <div className="mt-2 bg-white border border-hairline rounded-sm p-2 font-mono text-[8px] text-ink-2 leading-tight">
      <div className="flex justify-between border-b border-ink/40 pb-0.5 mb-1">
        <span className="font-semibold">WEEKLY DRIVING RECORD · WK 19/2026</span>
        <span>M. TAYLOR · DB14·641·6201·28</span>
      </div>
      <div className="grid grid-cols-7 gap-px text-center">
        {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
          <div key={d} className="bg-paper-2 py-0.5">
            {d}
          </div>
        ))}
        {["08:12", "09:24", "04:36", "09:54", "04:42", "02:06", "—"].map(
          (v, i) => (
            <div key={i} className="bg-white py-0.5 border border-hairline">
              {v}
            </div>
          ),
        )}
      </div>
      <div className="flex justify-between mt-1 text-ink-3">
        <span>tot drive 38h 54m</span>
        <span className="text-[var(--breach)]">1 flag · review</span>
      </div>
    </div>
  );
}

import { mockWeek, mockInfringements } from "../_content/mock-week";
import { DailyActivityChart } from "./daily-activity-chart";

/**
 * Pixel-accurate compressed reproduction of the desktop app's Weeks
 * page, used as the hero visual. macOS window chrome, sidebar nav,
 * totals strip, daily activity chart, infringements panel.
 */
export function WeekWindowMock() {
  return (
    <div className="rounded-xl bg-white border border-hairline-strong shadow-[0_30px_60px_-30px_rgba(15,30,50,0.25),0_8px_20px_-12px_rgba(15,30,50,0.15)] overflow-hidden">
      <TitleBar title="TachoLens — Mark Taylor · Week of 10 May 2026" />
      <div className="grid grid-cols-[200px_1fr] min-h-[480px]">
        <Sidebar />
        <Main />
      </div>
    </div>
  );
}

function TitleBar({ title }: { title: string }) {
  const dots: { color: string }[] = [
    { color: "#ff5f57" },
    { color: "#febc2e" },
    { color: "#28c840" },
  ];
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-hairline bg-paper-2">
      <div className="flex items-center gap-1.5">
        {dots.map((d) => (
          <span
            key={d.color}
            className="w-3 h-3 rounded-full"
            style={{ background: d.color }}
            aria-hidden
          />
        ))}
      </div>
      <div className="flex-1 text-center text-[11px] font-mono text-ink-3 tabular-nums truncate">
        {title}
      </div>
      <div className="w-12" />
    </div>
  );
}

function Sidebar() {
  const nav: { label: string; active: boolean }[] = [
    { label: "Overview", active: false },
    { label: "Weeks", active: true },
    { label: "Activity", active: false },
    { label: "Shifts", active: false },
    { label: "Events", active: false },
    { label: "Map", active: false },
  ];

  return (
    <aside className="border-r border-hairline bg-paper-2/60 p-3 flex flex-col gap-3 text-[12px]">
      <div className="flex items-center gap-2 pb-2 border-b border-hairline">
        <div className="w-7 h-7 rounded-md bg-brand grid place-items-center text-white text-[11px] font-mono">
          MT
        </div>
        <div className="leading-tight">
          <div className="font-medium text-ink">Mark Taylor</div>
          <div className="font-mono text-[10px] text-ink-3">
            DB141·641·6201·28
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {nav.map(({ label, active }) => (
          <div
            key={label}
            className={
              active
                ? "px-2 py-1.5 rounded-md bg-white border border-hairline text-ink font-medium"
                : "px-2 py-1.5 rounded-md text-ink-2"
            }
          >
            {label}
          </div>
        ))}
      </nav>
      <div className="mt-auto pt-3 border-t border-hairline text-[10px] text-ink-3 leading-relaxed">
        <div className="font-mono uppercase tracking-wider text-ink-3/80 mb-1">
          Imported
        </div>
        <div className="font-mono">C_20260509_1146_…ddd</div>
        <div className="mt-1 text-ink-3">337 days · 4 cards · 1.8 MB</div>
      </div>
    </aside>
  );
}

function Main() {
  const totals: { label: string; value: string; sub: string; breach: boolean }[] = [
    { label: "Driving", value: "38.9 h", sub: "/ 56 h", breach: false },
    { label: "Other work", value: "9.8 h", sub: "across 5 shifts", breach: false },
    { label: "Weekly rest", value: "108 h", sub: "longest 20h 48m", breach: false },
    { label: "Infringements", value: "1", sub: "breach · +1 info", breach: true },
  ];

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="eyebrow">week 19 / sun → sat</div>
          <h3 className="font-heading text-[22px] font-semibold text-ink mt-0.5">
            10 — 16 May 2026
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-[11px] font-mono px-2.5 py-1 rounded-md border border-hairline text-ink-2"
          >
            ‹ week 18
          </button>
          <button
            type="button"
            className="text-[11px] font-mono px-2.5 py-1 rounded-md border border-hairline text-ink-2"
          >
            week 20 ›
          </button>
          <button
            type="button"
            className="text-[11px] font-mono px-2.5 py-1 rounded-md bg-ink text-white"
          >
            Print A4 ⌘P
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-px bg-hairline border border-hairline rounded-md overflow-hidden">
        {totals.map((t) => (
          <div key={t.label} className="bg-white px-3 py-2.5 min-w-0">
            <div className="text-[10px] font-mono uppercase tracking-wider text-ink-3 mb-1 truncate">
              {t.label}
            </div>
            <div
              className={`font-heading text-[20px] font-semibold tabular-nums whitespace-nowrap ${
                t.breach ? "text-[var(--breach)]" : "text-ink"
              }`}
            >
              {t.value}
            </div>
            <div className="text-[10px] text-ink-3 tabular-nums whitespace-nowrap truncate">
              {t.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-hairline rounded-md bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
            Daily activity · h
          </div>
          <div className="flex items-center gap-3 text-[10px] text-ink-2">
            <LegendDot color="var(--driving)" label="Driving" />
            <LegendDot color="var(--work)" label="Work" />
            <LegendDot color="var(--available)" label="Available" />
            <LegendDot color="var(--breach)" label="Breach" />
          </div>
        </div>
        <DailyActivityChart days={mockWeek} />
      </div>

      <div className="border border-hairline rounded-md bg-white">
        <div className="px-3 py-2 border-b border-hairline flex items-center justify-between">
          <div className="text-[11px] font-mono uppercase tracking-wider text-ink-3">
            Infringements · {mockInfringements.length}
          </div>
          <div className="text-[10px] font-mono text-ink-3">
            EU 561/2006 rules engine
          </div>
        </div>
        <ul className="divide-y divide-[var(--hairline)]">
          {mockInfringements.map((inf) => {
            const isBreach = inf.severity === "breach";
            return (
              <li key={inf.code} className="px-3 py-2.5 flex gap-3">
                <span
                  className={`mt-0.5 inline-block w-1 h-9 rounded-full ${
                    isBreach
                      ? "bg-[var(--breach)]"
                      : "bg-[var(--rest)]"
                  }`}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        isBreach
                          ? "bg-[oklch(0.96_0.04_27)] text-[var(--breach)]"
                          : "bg-paper-2 text-ink-3"
                      }`}
                    >
                      {inf.severity.toUpperCase()}
                    </span>
                    <span className="font-mono text-[10px] text-ink-3">
                      {inf.code}
                    </span>
                    <span className="text-[12px] font-medium text-ink">
                      {inf.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-2 mt-1 leading-relaxed">
                    {inf.desc}
                  </div>
                  <div className="font-mono text-[10px] text-ink-3 mt-1">
                    {inf.rule}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2 h-2 rounded-sm"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

import { mockMonth } from "../_content/mock-week";
import { DailyActivityChart } from "./daily-activity-chart";

/**
 * Compressed but faithful reproduction of the desktop app's Overview page,
 * used as the hero visual. The sidebar items, breadcrumb topbar, driver
 * summary table, stat-card row, and daily-activity chart all mirror the
 * real desktop UI in apps/desktop/frontend/src/{layouts/app-layout.tsx,
 * components/app-sidebar.tsx, pages/Overview.tsx, panels.tsx}.
 */
export function AppWindowMock() {
  return (
    <div className="rounded-xl bg-white border border-hairline-strong shadow-[0_30px_60px_-30px_rgba(15,30,50,0.25),0_8px_20px_-12px_rgba(15,30,50,0.15)] overflow-hidden">
      <TitleBar title="TachoLens · v0.1.2" />
      <div className="grid grid-cols-[200px_1fr] min-h-[520px]">
        <Sidebar />
        <div className="flex flex-col">
          <Topbar />
          <Main />
        </div>
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
  const library: { label: string; active: boolean }[] = [
    { label: "Drivers", active: false },
    { label: "License", active: false },
  ];
  const driverNav: { label: string; active: boolean }[] = [
    { label: "Overview", active: true },
    { label: "Weeks", active: false },
  ];

  return (
    <aside className="border-r border-hairline bg-paper-2/60 flex flex-col text-[12px]">
      <div className="px-3 pt-3 pb-3 flex items-center gap-2">
        <div className="w-7 h-7 rounded-md bg-brand grid place-items-center text-white text-[11px] font-mono">
          T
        </div>
        <div className="leading-tight">
          <div className="font-semibold text-ink">TachoLens</div>
          <div className="text-[10px] text-ink-3">Driver-card viewer</div>
        </div>
      </div>
      <div className="px-3">
        <div className="rounded-md bg-ink text-white text-[11px] font-medium px-3 py-1.5 flex items-center gap-1.5">
          <UploadIcon />
          Import .ddd file
        </div>
      </div>

      <SidebarGroup label="Library">
        {library.map(({ label, active }) => (
          <SidebarItem key={label} active={active}>
            {label}
          </SidebarItem>
        ))}
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup label="Mark Taylor">
        {driverNav.map(({ label, active }) => (
          <SidebarItem key={label} active={active}>
            {label}
          </SidebarItem>
        ))}
      </SidebarGroup>

      <SidebarSeparator />

      <SidebarGroup label="All drivers">
        <SidebarItem active={false}>Mark Taylor</SidebarItem>
      </SidebarGroup>

      <div className="mt-auto px-3 py-3 text-[10px] text-ink-3 leading-relaxed">
        Drop a{" "}
        <code className="rounded bg-paper-2 border border-hairline px-1">
          .ddd
        </code>{" "}
        file anywhere in the window to import.
      </div>
    </aside>
  );
}

function SidebarGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-3">
      <div className="px-2 text-[10px] uppercase tracking-wider font-mono text-ink-3 mb-1">
        {label}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({
  active,
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        active
          ? "px-2 py-1.5 rounded-md bg-white border border-hairline text-ink font-medium"
          : "px-2 py-1.5 rounded-md text-ink-2"
      }
    >
      {children}
    </div>
  );
}

function SidebarSeparator() {
  return <div className="mx-3 mt-3 border-t border-hairline" />;
}

function Topbar() {
  return (
    <header className="flex h-10 items-center gap-2 border-b border-hairline px-4 text-[11px] text-ink-3">
      <span aria-hidden className="w-3 h-3 rounded-sm border border-hairline" />
      <span className="text-ink-2">Drivers</span>
      <span aria-hidden>/</span>
      <span className="text-ink">Mark Taylor</span>
    </header>
  );
}

function Main() {
  const driverRows: { label: string; value: string }[] = [
    { label: "Driver", value: "Mark Taylor" },
    { label: "Card number", value: "DB141 6416 2012 8000" },
    { label: "Issuing member state", value: "United Kingdom" },
    { label: "Issued", value: "2021-05-08" },
    { label: "Expires", value: "2026-05-08" },
    { label: "Data range", value: "2025-06-15 → 2026-05-13" },
    { label: "Imports", value: "1 (337 days)" },
  ];

  const stats: { label: string; value: string; hint: string }[] = [
    {
      label: "Last 7 days driving",
      value: "38h 12m",
      hint: "5 active days · 3,847 km",
    },
    {
      label: "Last 28 days driving",
      value: "178h 24m",
      hint: "22 active days · 17,210 km",
    },
    {
      label: "Last 28 days rest",
      value: "432h 18m",
      hint: "Work (non-driving): 27h 02m",
    },
    {
      label: "Days over 9h driving",
      value: "4",
      hint: "In last 28 days · 19 ever",
    },
  ];

  return (
    <div className="p-5 flex flex-col gap-5">
      <DriverCard rows={driverRows} />

      <section className="flex flex-col gap-3">
        <h2 className="text-[10px] font-mono uppercase tracking-wider text-ink-3">
          Driver activity
        </h2>
        <div className="grid grid-cols-4 gap-3">
          {stats.map((s) => (
            <StatCard key={s.label} {...s} />
          ))}
        </div>
      </section>

      <div className="border border-hairline rounded-md bg-white overflow-hidden">
        <div className="px-3 py-2 border-b border-hairline flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium text-ink">
              Daily activity · last 28 days
            </div>
            <div className="text-[10px] text-ink-3 mt-0.5 leading-tight">
              Periods with the card inserted only. Dashed line marks the EU 9h
              daily limit.
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-ink-2 shrink-0">
            <LegendDot color="var(--driving)" label="Driving" />
            <LegendDot color="var(--work)" label="Work" />
            <LegendDot color="var(--available)" label="Available" />
          </div>
        </div>
        <div className="p-3">
          <DailyActivityChart days={mockMonth} />
        </div>
      </div>
    </div>
  );
}

function DriverCard({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <div className="border border-hairline rounded-md bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-hairline">
        <div className="text-[12px] font-medium text-ink">Driver</div>
      </div>
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              className="border-b border-hairline last:border-b-0"
            >
              <td className="w-[180px] pl-3 py-1.5 text-ink-3">{r.label}</td>
              <td className="pr-3 py-1.5 font-mono text-ink">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-hairline rounded-md bg-white px-3 py-2.5">
      <div className="text-[9px] font-mono uppercase tracking-wider text-ink-3 mb-1">
        {label}
      </div>
      <div className="font-heading text-[20px] font-semibold tabular-nums text-ink leading-none">
        {value}
      </div>
      <div className="text-[10px] text-ink-3 mt-1 leading-tight truncate">
        {hint}
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

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

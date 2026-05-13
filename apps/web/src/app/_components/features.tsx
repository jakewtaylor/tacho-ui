import type { ReactNode } from "react";
import {
  DayTimelineMini,
  MonthSparklineBars,
  PrintMini,
  RouteMini,
} from "./feature-visuals";

export function Features() {
  return (
    <section id="features" className="max-w-[1200px] mx-auto px-6 py-20">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-1">
          <div className="eyebrow">what you get</div>
          <h2 className="font-heading text-[32px] font-semibold tracking-tight text-ink mt-2 leading-tight">
            Built for the way tachograph data actually behaves.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-2 max-w-md">
            Not a generic data viewer. Every panel is shaped by the EU 165/2014
            activity model, EU 561/2006 reference rules, and the quirks of
            Gen-1 and Gen-2 driver cards — surfaced as a starting point for
            your own review, not as a compliance determination.
          </p>
        </div>

        <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-px bg-hairline border border-hairline-strong rounded-xl overflow-hidden">
          <FeatureCard
            title="Rule patterns, with references"
            mono="every flag cites its article"
            body="Continuous drive, 15+30 split breaks, daily and weekly limits, weekly rest, reduced-rest budgets, extension days. Each finding cites the article of the regulation it&apos;s reading so you can verify it yourself."
            visual={<MonthSparklineBars />}
          />
          <FeatureCard
            title="Minute-accurate day timeline"
            mono="see exactly when, exactly how long"
            body="A 24-hour view of every shift. Driving, work, available, and rest minutes placed against the clock. Qualifying breaks highlighted; potential issues called out in context."
            visual={<DayTimelineMini />}
          />
          <FeatureCard
            title="GNSS map for Gen-2 cards"
            mono="every accumulated-driving fix on a map"
            body="Plot the location samples your tachograph already records. Filter to a single day to retrace a shift, or zoom out to see the whole month."
            visual={<RouteMini />}
          />
          <FeatureCard
            title="Printable A4 weekly summaries"
            mono="save as PDF"
            body="A clean spreadsheet-style layout for your own records. Print or save to PDF straight from the macOS print dialog. File alongside your manual compliance checks."
            visual={<PrintMini />}
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  title,
  mono,
  body,
  visual,
}: {
  title: string;
  mono: string;
  body: string;
  visual: ReactNode;
}) {
  return (
    <div className="bg-paper p-6 flex flex-col gap-3 min-h-[260px]">
      <h3 className="font-heading text-[18px] font-semibold text-ink leading-tight">
        {title}
      </h3>
      <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">
        {mono}
      </div>
      <p className="text-[13px] leading-relaxed text-ink-2">{body}</p>
      <div className="mt-auto">{visual}</div>
    </div>
  );
}

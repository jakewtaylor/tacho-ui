import { release } from "../_content/release";
import { getPriceInfo } from "@/lib/price";
import { AppWindowMock } from "./app-window-mock";

const trustItems: { title: string; sub: string }[] = [
  { title: "Local-first", sub: "no upload" },
  { title: "First-look insight", sub: "you verify, you decide" },
  { title: "A4 printable", sub: "weekly summaries" },
];

export async function Hero() {
  const price = await getPriceInfo();
  const priceChip = price
    ? `${price.formatted} · 1 yr updates`
    : "one-time · 1 yr updates";
  return (
    <section id="top" className="relative">
      <div
        className="absolute inset-0 paper-grain pointer-events-none"
        aria-hidden
      />
      <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-10 relative">
        <div className="flex items-center gap-3 mb-7">
          <span className="font-mono text-[11px] text-ink-3">
            <span className="text-brand">●</span> macOS first
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            Currently version {release.version}
            <span className="blink">_</span>
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.15fr] gap-12 items-start">
          <div className="max-w-2xl">
            <h1 className="font-heading text-[clamp(40px,5.4vw,72px)] font-semibold tracking-tight leading-[1.02] text-ink">
              See your{" "}
              <span className="relative inline-block">
                <span className="relative z-10">tacho</span>
                <span
                  className="absolute left-0 right-0 bottom-1 h-[10px] bg-brand/15"
                  aria-hidden
                />
              </span>{" "}
              data
              <br />
              clearly.
            </h1>
            <p className="mt-6 text-[18px] leading-[1.6] text-ink-2 max-w-xl">
              Drop a{" "}
              <span className="font-mono text-[15px] px-1.5 py-0.5 rounded bg-paper-2 border border-hairline">
                .ddd
              </span>{" "}
              driver-card download into TachoLens and get a first-look summary
              of driving sessions, breaks, and weekly totals — patterns to
              review yourself, not a compliance verdict.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <form action="/api/checkout" method="POST">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 px-6 h-14 rounded-md bg-ink text-white text-[16px] font-medium hover:opacity-90 shadow-[0_1px_0_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.4)]"
                >
                  Buy a license
                  <span className="font-mono text-[11px] text-white/60 border-l border-white/20 pl-2 ml-1">
                    {priceChip}
                  </span>
                </button>
              </form>
              <a
                href="/api/download"
                className="inline-flex items-center gap-2 px-5 h-14 rounded-md border border-hairline-strong text-ink text-[15px] hover:bg-paper-2"
              >
                Download to try
                <span className="font-mono text-[11px] text-ink-3 border-l border-hairline pl-2 ml-1">
                  .dmg · {release.dmgSizeMb} MB
                </span>
              </a>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-ink-3">
              <span>Apple silicon &amp; Intel</span>
              <span aria-hidden>·</span>
              <span>Trial mode runs without a license; imports don&apos;t persist.</span>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
              {trustItems.map((t) => (
                <div key={t.title}>
                  <div className="font-heading text-[13px] font-semibold text-ink">
                    {t.title}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3 mt-0.5">
                    {t.sub}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <AppWindowMock />
            <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-ink-3">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-brand"
                aria-hidden
              />
              shown: the Overview page · sample driver, redacted
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

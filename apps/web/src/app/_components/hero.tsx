import { release } from "../_content/release";
import { WeekWindowMock } from "./week-window-mock";

const trustItems: { title: string; sub: string }[] = [
  { title: "Local-first", sub: "no upload" },
  { title: "EU 561/2006", sub: "rules engine" },
  { title: "A4 printable", sub: "weekly reports" },
];

export function Hero() {
  return (
    <section id="top" className="relative">
      <div
        className="absolute inset-0 paper-grain pointer-events-none"
        aria-hidden
      />
      <div className="max-w-[1200px] mx-auto px-6 pt-14 pb-10 relative">
        <div className="flex items-center gap-3 mb-7">
          <span className="font-mono text-[11px] text-ink-3">
            <span className="text-brand">●</span> macOS · code-signed · auto-update
          </span>
          <span className="font-mono text-[11px] text-ink-3">
            {release.version}
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
              driver-card download into TachoLens and get a full breakdown
              of driving sessions, breaks, weekly summaries, and EU 561/2006
              compliance — without uploading anything anywhere.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={release.latestReleaseUrl}
                className="inline-flex items-center gap-2 px-5 h-12 rounded-md bg-ink text-white text-[15px] font-medium hover:opacity-90"
              >
                Download for macOS
                <span className="font-mono text-[11px] text-white/60 border-l border-white/20 pl-2 ml-1">
                  .dmg · {release.dmgSizeMb} MB
                </span>
              </a>
              <a
                href={release.repoUrl}
                className="inline-flex items-center gap-2 px-5 h-12 rounded-md border border-hairline-strong text-ink text-[15px] hover:bg-paper-2"
              >
                <GithubIcon />
                View source
              </a>
              <span className="font-mono text-[11px] text-ink-3 ml-1">
                Apple silicon &amp; Intel
              </span>
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
            <WeekWindowMock />
            <div className="mt-3 flex items-center gap-2 text-[11px] font-mono text-ink-3">
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-brand"
                aria-hidden
              />
              shown: real desktop UI · sample driver, redacted
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GithubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.1 3.29 9.42 7.86 10.95.58.1.79-.25.79-.55v-2.02c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.7 1.27 3.36.97.1-.75.4-1.27.73-1.56-2.55-.3-5.23-1.29-5.23-5.74 0-1.27.45-2.3 1.19-3.11-.12-.3-.52-1.5.11-3.12 0 0 .98-.32 3.2 1.18a11 11 0 0 1 2.91-.4c.99 0 1.99.14 2.91.4 2.22-1.5 3.19-1.18 3.19-1.18.64 1.62.24 2.82.12 3.12.74.81 1.18 1.84 1.18 3.11 0 4.46-2.69 5.44-5.25 5.73.41.36.78 1.05.78 2.12v3.14c0 .3.21.66.8.55A11.53 11.53 0 0 0 23.5 12.02C23.5 5.66 18.35.5 12 .5Z"
      />
    </svg>
  );
}

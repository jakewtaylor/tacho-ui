import { steps } from "../_content/how-it-works";

export function HowItWorks() {
  return (
    <section className="border-y border-hairline bg-paper-2/60">
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="eyebrow">how it works</div>
        <h2 className="font-heading text-[32px] font-semibold tracking-tight text-ink mt-2 max-w-2xl">
          From driver card to a first look at the week in under five seconds.
        </h2>
        <ol className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-px bg-hairline border border-hairline-strong rounded-lg overflow-hidden">
          {steps.map((s) => (
            <li
              key={s.n}
              className="bg-paper p-6 flex flex-col gap-3 min-h-[200px]"
            >
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-[11px] text-brand">{s.n}</span>
                <span
                  className="h-px flex-1 bg-hairline-strong"
                  aria-hidden
                />
              </div>
              <h3 className="font-heading text-[18px] font-semibold text-ink leading-tight">
                {s.title}
              </h3>
              <p className="text-[14px] leading-relaxed text-ink-2">{s.body}</p>
              <div className="mt-auto font-mono text-[11px] text-ink-3 truncate">
                {s.mono}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

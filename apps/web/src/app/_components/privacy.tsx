const dataPoints: { key: string; value: string }[] = [
  { key: "Stays on your Mac", value: "no cloud, no upload" },
  { key: "No analytics", value: "no telemetry of any kind" },
  { key: "Open-source", value: "Apache-2.0 licence" },
  { key: "Auto-update", value: "cryptographically signed" },
];

export function Privacy() {
  return (
    <section id="privacy" className="max-w-[1200px] mx-auto px-6 py-24">
      <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
        <div>
          <div className="eyebrow">privacy by design</div>
          <h2 className="font-heading text-[40px] font-semibold tracking-tight text-ink mt-2 leading-[1.05] max-w-xl">
            Your driver data never leaves your Mac.
          </h2>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-2 max-w-lg">
            Tachograph downloads contain a driver&apos;s full identity, route
            history, and working hours. TachoLens reads everything on-device
            and makes zero network calls — there is no account, no
            telemetry, no opt-in switch to forget to flip.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-4 max-w-lg">
            {dataPoints.map((p) => (
              <div key={p.key}>
                <dt className="text-[13px] font-medium text-ink">{p.key}</dt>
                <dd className="font-mono text-[11px] text-ink-3 mt-0.5">
                  {p.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative">
          <div className="grid-paper aspect-square rounded-xl border border-hairline-strong overflow-hidden relative bg-paper">
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-3">
                  data path
                </div>
                <div className="mt-3 font-mono text-[13px] text-ink leading-relaxed">
                  <span className="text-brand">your driver card</span>
                  <div className="my-2 text-ink-3">│</div>
                  <span className="px-2 py-0.5 border border-hairline-strong rounded">
                    read on your Mac
                  </span>
                  <div className="my-2 text-ink-3">│</div>
                  <span className="px-2 py-0.5 border border-hairline-strong rounded">
                    stored locally
                  </span>
                  <div className="my-2 text-ink-3">│</div>
                  <span className="px-2 py-0.5 bg-brand text-white rounded">
                    your screen
                  </span>
                </div>
                <div className="mt-6 font-mono text-[10px] text-ink-3">
                  ✗ no upload ✗ no account ✗ no telemetry
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

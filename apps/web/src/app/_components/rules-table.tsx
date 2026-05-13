import { rules } from "../_content/rules";

export function RulesTable() {
  return (
    <section id="rules" className="bg-paper-2/60 border-y border-hairline">
      <div className="max-w-[1200px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-10 items-start">
          <div>
            <div className="eyebrow">eu 561/2006 · reference rules</div>
            <h2 className="font-heading text-[32px] font-semibold tracking-tight text-ink mt-2 leading-tight">
              Twelve rule patterns, surfaced for your review.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-2 max-w-md">
              Detection is pure-function. Every rule is its own predicate with
              a code, a severity hint, a regulation reference, and a unit
              test. No cloud round-trip, no black box.
            </p>
            <div className="mt-6 rounded-md border border-hairline-strong bg-paper px-3 py-2.5 text-[12px] leading-relaxed text-ink-2 max-w-md">
              <strong className="text-ink">For your review only.</strong>{" "}
              Findings are pattern matches against published rules, not legal
              advice or a compliance determination. Always verify against the
              raw card data and the regulation itself before acting.
            </div>
            <div className="mt-6 flex flex-col gap-1 font-mono text-[11px] text-ink-3">
              <LegendRow color="var(--breach)" label="breach — hard limit exceeded" />
              <LegendRow color="var(--available)" label="warning — caution / budget close" />
              <LegendRow color="var(--rest)" label="info — used, not breached" />
            </div>
          </div>

          <div className="border border-hairline-strong rounded-lg overflow-hidden bg-paper">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-paper-2 border-b border-hairline-strong text-ink-3 font-mono uppercase text-[10px] tracking-wider">
                  <th className="text-left px-3 py-2 font-medium">Code</th>
                  <th className="text-left px-3 py-2 font-medium w-[60px]">
                    Scope
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Rule</th>
                  <th className="text-left px-3 py-2 font-medium w-[80px]">
                    Ref
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--hairline)]">
                {rules.map((r) => (
                  <tr key={r.code}>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-ink">
                      {r.code}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-ink-3 uppercase">
                      {r.scope}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{r.rule}</td>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-ink-3">
                      {r.ref}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <span>
      <span
        className="inline-block w-2 h-2 rounded-sm mr-2 align-middle"
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

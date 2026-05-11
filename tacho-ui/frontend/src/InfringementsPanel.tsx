import { Link } from 'react-router-dom';
import {
  countInfringements,
  type Infringement,
  type Severity,
} from './infringements';

type Props = {
  items: Infringement[];
  /** Section heading. Defaults to "Infringements". */
  title?: string;
  /** Suppress the "compliant" green card when there are no infringements. */
  hideWhenEmpty?: boolean;
  /** When true, dates in each row link to /day/:date. Defaults to true. */
  linkDates?: boolean;
  /** Header level for accessibility — h2 (default) or h3. */
  headingLevel?: 'h2' | 'h3';
};

const SEVERITY_STYLES: Record<
  Severity,
  { container: string; chip: string; chipText: string; icon: string; label: string }
> = {
  breach: {
    container: 'border-(--color-warn)/60 bg-(--color-warn)/10',
    chip: 'bg-(--color-warn)/25 text-(--color-warn)',
    chipText: 'text-(--color-warn)',
    icon: '⚠',
    label: 'Breach',
  },
  warning: {
    container: 'border-amber-400/60 bg-amber-400/10',
    chip: 'bg-amber-400/20 text-amber-200',
    chipText: 'text-amber-200',
    icon: '!',
    label: 'Warning',
  },
  info: {
    container: 'border-(--color-border) bg-(--color-surface)',
    chip: 'bg-white/10 text-(--color-muted)',
    chipText: 'text-(--color-muted)',
    icon: 'i',
    label: 'Info',
  },
};

export function InfringementsPanel({
  items,
  title = 'Infringements',
  hideWhenEmpty,
  linkDates = true,
  headingLevel = 'h2',
}: Props) {
  const counts = countInfringements(items);
  const Heading = headingLevel;

  if (counts.total === 0) {
    if (hideWhenEmpty) return null;
    return (
      <section className="flex flex-col gap-2">
        <Heading className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
          {title}
        </Heading>
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500/25 font-semibold text-emerald-300"
          >
            ✓
          </span>
          <div>
            <div className="text-sm font-semibold text-emerald-200">Compliant</div>
            <div className="text-xs text-emerald-100/80">
              No driver-hours infringements detected in this period.
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading className="text-xs font-semibold uppercase tracking-wider text-(--color-muted)">
          {title}
        </Heading>
        <div className="flex items-center gap-2 text-[0.7rem]">
          {counts.breach > 0 && (
            <SummaryPill severity="breach" count={counts.breach} />
          )}
          {counts.warning > 0 && (
            <SummaryPill severity="warning" count={counts.warning} />
          )}
          {counts.info > 0 && <SummaryPill severity="info" count={counts.info} />}
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((it, i) => {
          const s = SEVERITY_STYLES[it.severity];
          return (
            <li
              key={`${it.code}-${it.date ?? ''}-${i}`}
              className={`flex gap-3 rounded-lg border px-4 py-3 ${s.container}`}
            >
              <span
                aria-label={s.label}
                title={s.label}
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.chip}`}
              >
                {s.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <div className={`text-sm font-semibold ${s.chipText}`}>{it.title}</div>
                  {it.date &&
                    (linkDates ? (
                      <Link
                        to={`/day/${it.date}`}
                        className="font-mono text-[0.7rem] text-(--color-muted) hover:text-white"
                      >
                        {it.date} →
                      </Link>
                    ) : (
                      <span className="font-mono text-[0.7rem] text-(--color-muted)">
                        {it.date}
                      </span>
                    ))}
                </div>
                <div className="mt-1 text-sm text-(--color-text)/85">{it.description}</div>
                {it.ruleRef && (
                  <div className="mt-1 text-[0.65rem] uppercase tracking-wider text-(--color-muted)">
                    {it.ruleRef}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SummaryPill({ severity, count }: { severity: Severity; count: number }) {
  const s = SEVERITY_STYLES[severity];
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-semibold uppercase tracking-wider ${s.chip}`}
    >
      {count} {s.label}
      {count === 1 ? '' : severity === 'breach' ? 'es' : 's'}
    </span>
  );
}

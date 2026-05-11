import { useMemo } from 'react';
import {
  computeDayDetail,
  formatClock,
  formatHours,
  Thresholds,
  type ActivitySegment,
  type DailyRecord,
  type DrivingSession,
  type WorkType,
} from './activity';

type Props = {
  record: DailyRecord;
  onClose?: () => void;
};

const SEGMENT_COLORS: Record<WorkType, string> = {
  0: 'var(--color-rest)',
  1: 'var(--color-available)',
  2: 'var(--color-work)',
  3: 'var(--color-driving)',
};

const WORK_TYPE_LABELS: Record<WorkType, string> = {
  0: 'Rest',
  1: 'Available',
  2: 'Work',
  3: 'Driving',
};

const NO_CARD_COLOR = 'oklch(0.45 0.02 250 / 0.45)';
const MINUTES_IN_DAY = 1440;

function Timeline({ segments }: { segments: ActivitySegment[] }) {
  // Hour-tick positions (every 3h to keep it readable).
  const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21, 24];

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${MINUTES_IN_DAY} 36`}
        preserveAspectRatio="none"
        className="h-9 w-full rounded-md bg-white/5"
        role="img"
        aria-label="24-hour activity timeline"
      >
        {segments.map((seg, i) => (
          <rect
            key={i}
            x={seg.startMin}
            y={0}
            width={Math.max(1, seg.endMin - seg.startMin)}
            height={36}
            fill={seg.cardPresent ? SEGMENT_COLORS[seg.workType] : NO_CARD_COLOR}
          >
            <title>
              {formatClock(seg.startMin)}–{formatClock(seg.endMin)} · {WORK_TYPE_LABELS[seg.workType]}
              {seg.cardPresent ? '' : ' (card not inserted)'}
            </title>
          </rect>
        ))}
      </svg>
      <div className="relative h-3 w-full text-[0.6rem] text-(--color-muted)">
        {hourTicks.map((h) => (
          <span
            key={h}
            className="absolute -translate-x-1/2 tabular-nums"
            style={{ left: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, '0')}:00
          </span>
        ))}
      </div>
    </div>
  );
}

function DrivingSessions({ sessions }: { sessions: DrivingSession[] }) {
  if (sessions.length === 0) {
    return <div className="text-sm text-(--color-muted)">No driving recorded for this day.</div>;
  }
  return (
    <div className="overflow-hidden rounded-md border border-(--color-border)">
      <div
        className="grid bg-black/15 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-(--color-muted)"
        style={{ gridTemplateColumns: '110px 90px 110px 1fr' }}
      >
        <div>When</div>
        <div className="text-right">Driving</div>
        <div className="text-right">Break after</div>
        <div className="pl-4">Compliance</div>
      </div>
      {sessions.map((s, i) => {
        const isSplit = s.firstBreakMin != null && s.secondBreakMin != null;
        return (
          <div
            key={i}
            className="grid items-center border-t border-(--color-border) px-3 py-1.5 text-sm tabular-nums"
            style={{ gridTemplateColumns: '110px 90px 110px 1fr' }}
          >
            <div className="font-mono text-xs">
              {formatClock(s.startMin)}–{formatClock(s.endMin)}
            </div>
            <div className="text-right">{formatHours(s.drivingMin)}</div>
            <div className="text-right">
              {s.followingBreakMin > 0 ? (
                isSplit ? (
                  <span title={`${s.firstBreakMin}m + ${s.secondBreakMin}m split`}>
                    {s.firstBreakMin}+{s.secondBreakMin}m
                  </span>
                ) : (
                  formatHours(s.followingBreakMin)
                )
              ) : (
                '—'
              )}
            </div>
            <div className="pl-4">
              {s.breachedContinuous ? (
                <span className="text-(--color-warn)">
                  ! Over 4h 30m driving before a qualifying break
                </span>
              ) : isSplit ? (
                <span className="text-(--color-muted)">OK (split break)</span>
              ) : s.drivingMin >= Thresholds.CONTINUOUS_DRIVING_MAX_MIN ? (
                <span className="text-(--color-muted)">At limit, break observed</span>
              ) : (
                <span className="text-(--color-muted)">OK</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Segments({ segments }: { segments: ActivitySegment[] }) {
  // Only show meaningful events (durations >= 1 min) to keep the list short.
  const filtered = segments.filter((s) => s.durationMin >= 1);
  if (filtered.length === 0) return null;

  return (
    <details className="rounded-md border border-(--color-border) bg-black/10 open:bg-black/20">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs text-(--color-muted)">
        All segments ({filtered.length})
      </summary>
      <div className="max-h-56 overflow-auto px-3 py-2">
        <div
          className="grid text-[0.7rem] tabular-nums"
          style={{ gridTemplateColumns: '90px 80px 100px 1fr' }}
        >
          {filtered.map((s, i) => (
            <div key={i} className="contents">
              <div className="py-0.5 font-mono">
                {formatClock(s.startMin)}–{formatClock(s.endMin)}
              </div>
              <div className="py-0.5 text-right">{formatHours(s.durationMin)}</div>
              <div className="py-0.5">
                <span
                  className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
                  style={{
                    background: s.cardPresent
                      ? SEGMENT_COLORS[s.workType]
                      : NO_CARD_COLOR,
                  }}
                />
                {WORK_TYPE_LABELS[s.workType]}
              </div>
              <div className="py-0.5 text-(--color-muted)">
                {s.cardPresent ? '' : 'card not inserted'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export function DayDetail({ record, onClose }: Props) {
  const detail = useMemo(() => computeDayDetail(record), [record]);

  return (
    <section className="rounded-lg border border-(--color-border) bg-(--color-surface) p-4">
      <header className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Detail · {detail.date}</h3>
          {detail.hasBreakBreach && (
            <span className="rounded-full bg-(--color-warn)/25 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-(--color-warn)">
              Break breach
            </span>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="h-7 rounded-md border border-(--color-border) bg-white/5 px-2 text-xs hover:bg-white/10"
          >
            Close
          </button>
        )}
      </header>

      <div className="mb-4">
        <Timeline segments={detail.segments} />
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-(--color-muted)">
          Driving sessions
        </div>
        <DrivingSessions sessions={detail.drivingSessions} />
      </div>

      <Segments segments={detail.segments} />
    </section>
  );
}

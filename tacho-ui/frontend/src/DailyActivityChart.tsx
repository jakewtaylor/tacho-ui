import { useMemo } from 'react';
import { ParentSize } from '@visx/responsive';
import { scaleBand, scaleLinear } from '@visx/scale';
import { BarStack } from '@visx/shape';
import { Group } from '@visx/group';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import type { DailyStats } from './activity';

type Props = {
  days: DailyStats[]; // expected: newest first
  height?: number;
};

const keys = ['drivingH', 'workH', 'availableH'] as const;
type Key = (typeof keys)[number];

const colors: Record<Key, string> = {
  drivingH: 'var(--color-driving)',
  workH: 'var(--color-work)',
  availableH: 'var(--color-available)',
};

const margin = { top: 16, right: 8, bottom: 28, left: 32 };
const Y_MAX_HOURS = 16;
const DAILY_LIMIT_HOURS = 9;
const AXIS_COLOR = 'oklch(0.72 0.02 250)';
const GRID_COLOR = 'oklch(0.35 0.02 250 / 0.4)';

export function DailyActivityChart({ days, height = 220 }: Props) {
  // Reverse so the chart reads left-to-right oldest → newest.
  const chartData = useMemo(
    () =>
      [...days].reverse().map((d) => ({
        date: d.date,
        drivingH: d.drivingMin / 60,
        workH: d.workMin / 60,
        availableH: d.availableMin / 60,
        overLimit: d.overDailyLimit,
      })),
    [days]
  );

  if (chartData.length === 0) return null;

  return (
    <div style={{ height }}>
      <ParentSize>
        {({ width }) => {
          if (width < 80) return null;
          const innerWidth = Math.max(0, width - margin.left - margin.right);
          const innerHeight = Math.max(0, height - margin.top - margin.bottom);

          const xScale = scaleBand<string>({
            domain: chartData.map((d) => d.date),
            range: [0, innerWidth],
            padding: 0.25,
          });
          const yScale = scaleLinear<number>({
            domain: [0, Y_MAX_HOURS],
            range: [innerHeight, 0],
            nice: true,
          });

          const limitY = yScale(DAILY_LIMIT_HOURS);

          return (
            <svg width={width} height={height} role="img" aria-label="Daily activity bar chart">
              <Group left={margin.left} top={margin.top}>
                <GridRows
                  scale={yScale}
                  width={innerWidth}
                  numTicks={4}
                  stroke={GRID_COLOR}
                  strokeDasharray="2,3"
                />
                <BarStack
                  data={chartData}
                  keys={keys as unknown as Key[]}
                  x={(d) => d.date}
                  xScale={xScale}
                  yScale={yScale}
                  color={(k) => colors[k as Key]}
                >
                  {(stacks) =>
                    stacks.map((stack) =>
                      stack.bars.map((bar) => (
                        <rect
                          key={`bar-${stack.index}-${bar.index}`}
                          x={bar.x}
                          y={bar.y}
                          width={bar.width}
                          height={bar.height}
                          fill={bar.color}
                          rx={1}
                        >
                          <title>
                            {bar.bar.data.date} · {labelForKey(stack.key as Key)}: {bar.bar.data[stack.key as Key].toFixed(1)}h
                          </title>
                        </rect>
                      ))
                    )
                  }
                </BarStack>

                {/* 9h daily-limit reference line */}
                <line
                  x1={0}
                  x2={innerWidth}
                  y1={limitY}
                  y2={limitY}
                  stroke="var(--destructive)"
                  strokeWidth={1}
                  strokeDasharray="4,3"
                  opacity={0.7}
                />

                <AxisBottom
                  top={innerHeight}
                  scale={xScale}
                  tickFormat={(d) => formatTickDate(String(d), chartData.length)}
                  numTicks={Math.min(chartData.length, 7)}
                  stroke={AXIS_COLOR}
                  tickStroke={AXIS_COLOR}
                  tickLabelProps={() => ({
                    fill: AXIS_COLOR,
                    fontSize: 10,
                    textAnchor: 'middle',
                  })}
                />
                <AxisLeft
                  scale={yScale}
                  numTicks={4}
                  stroke={AXIS_COLOR}
                  tickStroke={AXIS_COLOR}
                  tickFormat={(v) => `${v}h`}
                  tickLabelProps={() => ({
                    fill: AXIS_COLOR,
                    fontSize: 10,
                    textAnchor: 'end',
                    dx: -4,
                    dy: 3,
                  })}
                />
              </Group>
            </svg>
          );
        }}
      </ParentSize>
    </div>
  );
}

function labelForKey(k: Key): string {
  switch (k) {
    case 'drivingH':
      return 'Driving';
    case 'workH':
      return 'Work';
    case 'availableH':
      return 'Available';
  }
}

function formatTickDate(iso: string, total: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Long range: show "MMM d". Short range: show day-of-month only.
  if (total > 14) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return String(d.getDate());
}

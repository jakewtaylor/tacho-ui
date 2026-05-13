import type { MockDay } from "../_content/mock-week";

/**
 * Static SVG stacked-bar chart mirroring the look of
 * apps/desktop/frontend/src/DailyActivityChart.tsx (visx-based on the
 * desktop). Authored by hand here so the marketing site doesn't pull in
 * @visx for a single mini chart.
 */
export function DailyActivityChart({
  days,
  width = 560,
  height = 150,
  limit = 9,
  yMax = 12,
}: {
  days: MockDay[];
  width?: number;
  height?: number;
  limit?: number;
  yMax?: number;
}) {
  const margin = { left: 28, right: 8, top: 10, bottom: 22 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const barWidth = innerW / days.length;
  const yScale = (h: number) => (h / yMax) * innerH;
  const limitY = margin.top + innerH - yScale(limit);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full h-auto"
      role="img"
      aria-label="Daily driving stacked across the week with a 9-hour limit reference"
    >
      {[0, 4, 8, 12].map((tick) => {
        const y = margin.top + innerH - yScale(tick);
        return (
          <g key={tick}>
            <line
              x1={margin.left}
              x2={width - margin.right}
              y1={y}
              y2={y}
              stroke="var(--hairline)"
              strokeDasharray="2 3"
            />
            <text
              x={margin.left - 6}
              y={y + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--ink-3)"
              className="font-mono"
            >
              {tick}h
            </text>
          </g>
        );
      })}

      {days.map((d, i) => {
        const x = margin.left + i * barWidth + barWidth * 0.18;
        const w = barWidth * 0.64;
        const dH = yScale(d.driving);
        const wH = yScale(d.work);
        const aH = yScale(d.available);
        const baseY = margin.top + innerH;
        return (
          <g key={i}>
            <rect
              x={x}
              y={baseY - dH}
              width={w}
              height={dH}
              fill="var(--driving)"
              rx="1"
            />
            <rect
              x={x}
              y={baseY - dH - wH}
              width={w}
              height={wH}
              fill="var(--work)"
              rx="1"
            />
            <rect
              x={x}
              y={baseY - dH - wH - aH}
              width={w}
              height={aH}
              fill="var(--available)"
              rx="1"
            />
            {d.breach && (
              <rect
                x={x - 1.5}
                y={baseY - dH - wH - aH - 6}
                width={w + 3}
                height="3"
                fill="var(--breach)"
                rx="1.5"
              />
            )}
            <text
              x={x + w / 2}
              y={height - 6}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ink-3)"
            >
              {d.day}
            </text>
          </g>
        );
      })}

      <line
        x1={margin.left}
        x2={width - margin.right}
        y1={limitY}
        y2={limitY}
        stroke="var(--breach)"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.8"
      />
      <text
        x={width - margin.right - 4}
        y={limitY - 4}
        textAnchor="end"
        fontSize="9"
        fill="var(--breach)"
        className="font-mono"
      >
        9h limit
      </text>
    </svg>
  );
}

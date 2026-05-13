/**
 * Sample data for the marketing-site hero. Mirrors what
 * apps/desktop/frontend/src/activity.ts computes per day, compressed
 * to hours for the chart.
 */

export type MockDay = {
  day: string;
  date: string;
  driving: number;
  work: number;
  available: number;
  rest: number;
  ext: boolean;
  breach: boolean;
};

/** 28-day driving series for the rules-engine sparkline (hours per day). */
export const monthSeries: number[] = [
  3.2, 4.1, 8.6, 9.1, 7.4, 6.8, 0.4, 5.9, 8.8, 9.6, 7.2, 4.4, 2.1, 0.0, 8.2,
  9.4, 4.6, 9.9, 4.7, 2.1, 0.0, 6.1, 7.5, 8.2, 9.3, 6.6, 3.4, 0.5,
];

/**
 * 28-day stacked series used by the hero's Daily-activity chart, mirroring
 * what the desktop's Overview page shows in ActivityPanel. Each row's driving
 * value comes from monthSeries; work/available/rest are plausible companions.
 * MockDay.ext and .breach are used only by other marketing components.
 */
export const mockMonth: MockDay[] = monthSeries.map((driving, i) => {
  const work = driving === 0 ? 0 : Math.min(2.5, 0.6 + (i % 5) * 0.35);
  const available = driving === 0 ? 0 : 0.2 + ((i % 3) * 0.15);
  const active = driving + work + available;
  const rest = Math.max(0, 24 - active);
  const start = new Date(Date.UTC(2026, 3, 16)); // 2026-04-16
  start.setUTCDate(start.getUTCDate() + i);
  return {
    day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][start.getUTCDay()]!,
    date: start.toISOString().slice(0, 10),
    driving: Number(driving.toFixed(1)),
    work: Number(work.toFixed(1)),
    available: Number(available.toFixed(1)),
    rest: Number(rest.toFixed(1)),
    ext: driving > 9,
    breach: driving > 10,
  };
});

/** Mini route polyline + stops for the GNSS card. Coords are canvas units. */
export const routePoints: ReadonlyArray<readonly [number, number]> = [
  [12, 70],
  [22, 64],
  [30, 58],
  [38, 55],
  [44, 52],
  [50, 49],
  [56, 44],
  [60, 39],
  [63, 33],
  [66, 28],
  [70, 23],
  [75, 19],
  [82, 16],
  [88, 14],
];

export const routeStops: ReadonlyArray<{
  x: number;
  y: number;
  label: string;
}> = [
  { x: 22, y: 64, label: "Calais" },
  { x: 44, y: 52, label: "Köln" },
  { x: 63, y: 33, label: "Wrocław" },
  { x: 88, y: 14, label: "Warszawa" },
];

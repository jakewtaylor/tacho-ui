/**
 * Sample week data for the marketing-site hero. Shape mirrors what
 * apps/desktop/frontend/src/activity.ts computes per day, compressed to
 * hours for the chart.
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

export const mockWeek: MockDay[] = [
  {
    day: "Mon",
    date: "10 May",
    driving: 8.2,
    work: 1.1,
    available: 0.4,
    rest: 14.3,
    ext: false,
    breach: false,
  },
  {
    day: "Tue",
    date: "11 May",
    driving: 9.4,
    work: 1.7,
    available: 0.3,
    rest: 11.4,
    ext: true,
    breach: false,
  },
  {
    day: "Wed",
    date: "12 May",
    driving: 4.6,
    work: 2.1,
    available: 0.2,
    rest: 17.1,
    ext: false,
    breach: false,
  },
  {
    day: "Thu",
    date: "13 May",
    driving: 9.9,
    work: 1.4,
    available: 0.8,
    rest: 10.2,
    ext: true,
    breach: false,
  },
  {
    day: "Fri",
    date: "14 May",
    driving: 4.7,
    work: 2.6,
    available: 0.4,
    rest: 9.7,
    ext: false,
    breach: true,
  },
  {
    day: "Sat",
    date: "15 May",
    driving: 2.1,
    work: 0.9,
    available: 0.2,
    rest: 20.8,
    ext: false,
    breach: false,
  },
  {
    day: "Sun",
    date: "16 May",
    driving: 0.0,
    work: 0.0,
    available: 0.0,
    rest: 24.0,
    ext: false,
    breach: false,
  },
];

export type MockInfringement = {
  code: string;
  severity: "breach" | "info";
  title: string;
  desc: string;
  rule: string;
};

export const mockInfringements: MockInfringement[] = [
  {
    code: "DAILY_REST_INSUFFICIENT",
    severity: "breach",
    title: "Daily rest below 9 h",
    desc: "Rest period 9 h 42 m measured before 14 May shift — below the 11 h daily rest required by EU 561/2006 Art. 8(2).",
    rule: "EU 561/2006 · Art. 8(2)",
  },
  {
    code: "EXTENSION_USED",
    severity: "info",
    title: "2 extension days used this week",
    desc: "Driving extended to 9–10 h on Tue 11 May and Thu 13 May — the regulation permits two such days per week.",
    rule: "EU 561/2006 · Art. 6(1)",
  },
];

/** 28-day driving series for the rules-engine sparkline (hours per day). */
export const monthSeries: number[] = [
  3.2, 4.1, 8.6, 9.1, 7.4, 6.8, 0.4, 5.9, 8.8, 9.6, 7.2, 4.4, 2.1, 0.0, 8.2,
  9.4, 4.6, 9.9, 4.7, 2.1, 0.0, 6.1, 7.5, 8.2, 9.3, 6.6, 3.4, 0.5,
];

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

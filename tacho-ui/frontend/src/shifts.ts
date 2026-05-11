// Work-period / shift derivation from card_place_daily_work_period records.
//
// EU 2016/799 Annex IC: each record has entry_type_daily_work_period:
//   0 = begin, related to time-of-state (automatic)
//   1 = end,   related to time-of-state (automatic)
//   2 = begin, manual entry
//   3 = end,   manual entry
//
// Records are paired begin → end to form a shift.

export type PlaceRecord = {
  entry_time: string;
  entry_type_daily_work_period: number;
  daily_work_period_country: number;
  daily_work_period_region: number;
  vehicle_odometer_value: number;
};

export type Shift = {
  date: string; // yyyy-mm-dd of the begin event
  startTime: string;
  endTime: string | null;
  startCountry: number;
  endCountry: number | null;
  startOdometer: number;
  endOdometer: number | null;
  distanceKm: number | null;
  // Filled in by annotateRest: minutes of rest between previous shift's end and
  // this shift's start. Null for the oldest shift in the window.
  restBeforeMin: number | null;
  // True if restBeforeMin is below the 11h EU daily-rest threshold.
  shortRest: boolean;
};

export const DAILY_REST_MIN = 11 * 60;

const BEGIN_TYPES = new Set([0, 2]);
const END_TYPES = new Set([1, 3]);

export function extractPlaceRecords(data: any): PlaceRecord[] {
  const g1 = data?.card_place_daily_work_period_1?.place_records;
  if (Array.isArray(g1) && g1.length > 0) return g1 as PlaceRecord[];
  const g2 = data?.card_place_daily_work_period_2?.place_records;
  if (Array.isArray(g2)) return g2 as PlaceRecord[];
  return [];
}

export function deriveShifts(records: PlaceRecord[]): Shift[] {
  // Sort ascending by entry_time, but ignore zero / placeholder entries.
  const sorted = records
    .filter((r) => r && r.entry_time && !r.entry_time.startsWith('0001'))
    .slice()
    .sort((a, b) => a.entry_time.localeCompare(b.entry_time));

  const shifts: Shift[] = [];
  let openBegin: PlaceRecord | null = null;

  for (const r of sorted) {
    const t = r.entry_type_daily_work_period;
    if (BEGIN_TYPES.has(t)) {
      if (openBegin) {
        // Begin without a matching end — emit an open shift, then start fresh.
        shifts.push({
          date: openBegin.entry_time.slice(0, 10),
          startTime: openBegin.entry_time,
          endTime: null,
          startCountry: openBegin.daily_work_period_country,
          endCountry: null,
          startOdometer: openBegin.vehicle_odometer_value,
          endOdometer: null,
          distanceKm: null,
          restBeforeMin: null,
          shortRest: false,
        });
      }
      openBegin = r;
    } else if (END_TYPES.has(t)) {
      if (openBegin) {
        const dist = r.vehicle_odometer_value - openBegin.vehicle_odometer_value;
        shifts.push({
          date: openBegin.entry_time.slice(0, 10),
          startTime: openBegin.entry_time,
          endTime: r.entry_time,
          startCountry: openBegin.daily_work_period_country,
          endCountry: r.daily_work_period_country,
          startOdometer: openBegin.vehicle_odometer_value,
          endOdometer: r.vehicle_odometer_value,
          distanceKm: dist >= 0 ? dist : null,
          restBeforeMin: null,
          shortRest: false,
        });
        openBegin = null;
      }
      // End without a preceding begin: skip.
    }
  }
  if (openBegin) {
    shifts.push({
      date: openBegin.entry_time.slice(0, 10),
      startTime: openBegin.entry_time,
      endTime: null,
      startCountry: openBegin.daily_work_period_country,
      endCountry: null,
      startOdometer: openBegin.vehicle_odometer_value,
      endOdometer: null,
      distanceKm: null,
      restBeforeMin: null,
      shortRest: false,
    });
  }

  // Annotate rest-before in chronological order, then reverse for newest-first.
  for (let i = 1; i < shifts.length; i++) {
    const prev = shifts[i - 1];
    const cur = shifts[i];
    if (!prev.endTime) continue;
    const prevEnd = new Date(prev.endTime).getTime();
    const curStart = new Date(cur.startTime).getTime();
    if (Number.isNaN(prevEnd) || Number.isNaN(curStart)) continue;
    const minutes = Math.round((curStart - prevEnd) / 60000);
    if (minutes < 0) continue;
    cur.restBeforeMin = minutes;
    cur.shortRest = minutes < DAILY_REST_MIN;
  }

  return shifts.reverse();
}

export function formatTimeOfDay(isoTime: string): string {
  const d = new Date(isoTime);
  if (Number.isNaN(d.getTime())) return isoTime;
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

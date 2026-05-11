// EU tachograph work_type encoding (Annex 1B / Annex 1C ActivityChangeInfo):
//   0 = break/rest
//   1 = availability
//   2 = work (not driving)
//   3 = driving
export type WorkType = 0 | 1 | 2 | 3;

export type ActivityChange = {
  driver: boolean;
  team: boolean;
  card_present: boolean;
  work_type: WorkType;
  minutes: number; // minutes since midnight
};

export type DailyRecord = {
  activity_record_date: string;
  activity_day_distance: number;
  activity_change_info: ActivityChange[];
};

export type DailyStats = {
  date: string; // ISO date (yyyy-mm-dd)
  distanceKm: number;
  drivingMin: number;
  workMin: number;
  availableMin: number;
  restMin: number;
  cardNotInsertedMin: number;
  overDailyLimit: boolean; // > 9 hours driving
  wayOverDailyLimit: boolean; // > 10 hours driving
};

const MINUTES_IN_DAY = 1440;
const DAILY_DRIVING_LIMIT_MIN = 9 * 60;
const DAILY_DRIVING_HARD_LIMIT_MIN = 10 * 60;

export function computeDailyStats(record: DailyRecord): DailyStats {
  const date = record.activity_record_date.slice(0, 10);
  const events = [...record.activity_change_info].sort((a, b) => a.minutes - b.minutes);

  let drivingMin = 0;
  let workMin = 0;
  let availableMin = 0;
  let restMin = 0;
  let cardNotInsertedMin = 0;

  for (let i = 0; i < events.length; i++) {
    const cur = events[i];
    const nextMin = i + 1 < events.length ? events[i + 1].minutes : MINUTES_IN_DAY;
    const duration = Math.max(0, nextMin - cur.minutes);

    if (!cur.card_present) {
      cardNotInsertedMin += duration;
      continue;
    }
    switch (cur.work_type) {
      case 3:
        drivingMin += duration;
        break;
      case 2:
        workMin += duration;
        break;
      case 1:
        availableMin += duration;
        break;
      case 0:
      default:
        restMin += duration;
        break;
    }
  }

  return {
    date,
    distanceKm: record.activity_day_distance,
    drivingMin,
    workMin,
    availableMin,
    restMin,
    cardNotInsertedMin,
    overDailyLimit: drivingMin > DAILY_DRIVING_LIMIT_MIN,
    wayOverDailyLimit: drivingMin > DAILY_DRIVING_HARD_LIMIT_MIN,
  };
}

export type ActivityRollup = {
  days: number;
  daysWithDriving: number;
  totalDrivingMin: number;
  totalWorkMin: number;
  totalRestMin: number;
  totalDistanceKm: number;
  daysOverLimit: number;
};

export function rollup(stats: DailyStats[]): ActivityRollup {
  const r: ActivityRollup = {
    days: stats.length,
    daysWithDriving: 0,
    totalDrivingMin: 0,
    totalWorkMin: 0,
    totalRestMin: 0,
    totalDistanceKm: 0,
    daysOverLimit: 0,
  };
  for (const d of stats) {
    if (d.drivingMin > 0) r.daysWithDriving++;
    r.totalDrivingMin += d.drivingMin;
    r.totalWorkMin += d.workMin;
    r.totalRestMin += d.restMin;
    r.totalDistanceKm += d.distanceKm;
    if (d.overDailyLimit) r.daysOverLimit++;
  }
  return r;
}

export function formatHours(minutes: number): string {
  if (minutes <= 0) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function extractDailyRecords(data: any): DailyRecord[] {
  // Prefer Gen1 record (longer history on this sample), fall back to Gen2.
  const g1 = data?.card_driver_activity_1?.decoded_activity_daily_records;
  if (Array.isArray(g1) && g1.length > 0) return g1 as DailyRecord[];
  const g2 = data?.card_driver_activity_2?.decoded_activity_daily_records;
  if (Array.isArray(g2)) return g2 as DailyRecord[];
  return [];
}

export function formatClock(minutes: number): string {
  const m = Math.max(0, Math.min(MINUTES_IN_DAY, Math.round(minutes)));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// EU 561/2006 Art. 7 break thresholds.
// The 45-min break may be replaced by a break of at least 15 minutes
// FOLLOWED BY a break of at least 30 minutes, distributed over the 4h30m
// driving period. Order is significant per the regulation text — 15 first,
// then 30 — and intermediate driving/work/availability does not invalidate
// a recorded first break.
const CONTINUOUS_DRIVING_MAX_MIN = 4 * 60 + 30; // 4h 30m
const QUALIFYING_BREAK_MIN = 45;
const SPLIT_FIRST_MIN = 15;
const SPLIT_SECOND_MIN = 30;
// Backwards-compat alias used elsewhere.
const QUALIFYING_PARTIAL_BREAK_MIN = SPLIT_FIRST_MIN;

export type ActivitySegment = {
  startMin: number;
  endMin: number;
  durationMin: number;
  workType: WorkType;
  cardPresent: boolean;
};

export type DrivingSession = {
  startMin: number;
  endMin: number;
  drivingMin: number; // pure driving time inside the session (excludes short interruptions)
  // Total qualifying break that closed this session (single ≥45, or 15+30
  // split). 0 when the session never closed (e.g. ended at day boundary).
  followingBreakMin: number;
  // When the closing break was a 15+30 split, these are the two parts in order.
  firstBreakMin: number | null;
  secondBreakMin: number | null;
  // True if cumulative driving exceeded 4h30m before a qualifying break
  // (single OR split) was completed during this session.
  breachedContinuous: boolean;
};

export type DayDetail = {
  date: string;
  segments: ActivitySegment[];
  drivingSessions: DrivingSession[];
  hasBreakBreach: boolean;
};

export function computeDayDetail(record: DailyRecord): DayDetail {
  const date = record.activity_record_date.slice(0, 10);
  const events = [...record.activity_change_info].sort((a, b) => a.minutes - b.minutes);

  // Build segments first.
  const segments: ActivitySegment[] = [];
  for (let i = 0; i < events.length; i++) {
    const cur = events[i];
    const nextMin = i + 1 < events.length ? events[i + 1].minutes : MINUTES_IN_DAY;
    const duration = Math.max(0, nextMin - cur.minutes);
    if (duration === 0) continue;
    segments.push({
      startMin: cur.minutes,
      endMin: nextMin,
      durationMin: duration,
      workType: cur.work_type,
      cardPresent: cur.card_present,
    });
  }

  // Identify driving sessions under EU 561/2006 Art. 7:
  //   - "Rest" here means work_type 0 only (availability does not qualify
  //     as a break).
  //   - A single contiguous rest of ≥45 min closes the session.
  //   - Otherwise, the first contiguous rest of ≥15 min during the session is
  //     held as the "first break" of a split. A subsequent contiguous rest
  //     of ≥30 min completes the split and closes the session. Order is
  //     significant per the regulation — 15 first, then 30.
  //   - Driving, work, availability, and card-not-inserted segments between
  //     the two halves of a split do NOT invalidate the first break; they
  //     simply do not contribute to break time. Only a rest segment is a
  //     break.
  //   - A session is flagged `breachedContinuous` when cumulative driving
  //     exceeds 4h30m before a qualifying break sequence completes (single
  //     ≥45 OR 15+30 split).
  const drivingSessions: DrivingSession[] = [];
  let session: DrivingSession | null = null;
  let pendingRest = 0; // duration of the current contiguous rest segment
  let firstBreak: number | null = null; // first ≥15min break observed in this session

  const closeSession = (closingBreak: number, second: number | null) => {
    if (!session) return;
    session.followingBreakMin = closingBreak;
    if (second != null && firstBreak != null) {
      session.firstBreakMin = firstBreak;
      session.secondBreakMin = second;
    }
    drivingSessions.push(session);
    session = null;
    firstBreak = null;
    pendingRest = 0;
  };

  const flushRestPeriod = () => {
    if (pendingRest <= 0 || !session) {
      pendingRest = 0;
      return;
    }
    if (pendingRest >= QUALIFYING_BREAK_MIN) {
      // Single qualifying break closes the session.
      closeSession(pendingRest, null);
      return;
    }
    if (firstBreak == null) {
      if (pendingRest >= SPLIT_FIRST_MIN) {
        firstBreak = pendingRest;
      }
    } else if (pendingRest >= SPLIT_SECOND_MIN) {
      closeSession(firstBreak + pendingRest, pendingRest);
      return;
    }
    pendingRest = 0;
  };

  for (const seg of segments) {
    const isDriving = seg.cardPresent && seg.workType === 3;
    const isRest = seg.cardPresent && seg.workType === 0;

    if (isRest) {
      pendingRest += seg.durationMin;
      continue;
    }

    // Non-rest segment — a contiguous rest period (if any) just ended.
    flushRestPeriod();

    if (isDriving) {
      if (!session) {
        session = {
          startMin: seg.startMin,
          endMin: seg.endMin,
          drivingMin: 0,
          followingBreakMin: 0,
          firstBreakMin: null,
          secondBreakMin: null,
          breachedContinuous: false,
        };
      }
      session.drivingMin += seg.durationMin;
      session.endMin = seg.endMin;
      if (session.drivingMin > CONTINUOUS_DRIVING_MAX_MIN) {
        session.breachedContinuous = true;
      }
    }
    // Work, availability, card-not-inserted: neither drive nor rest.
    // Does not contribute, does not invalidate the first break.
  }

  // End of day — flush any trailing rest, then push the open session (if any).
  flushRestPeriod();
  if (session) {
    session.followingBreakMin = 0;
    drivingSessions.push(session);
  }

  const hasBreakBreach = drivingSessions.some((s) => s.breachedContinuous);

  return { date, segments, drivingSessions, hasBreakBreach };
}

// Exported for tests / external use.
export const Thresholds = {
  CONTINUOUS_DRIVING_MAX_MIN,
  QUALIFYING_BREAK_MIN,
  QUALIFYING_PARTIAL_BREAK_MIN,
  SPLIT_FIRST_MIN,
  SPLIT_SECOND_MIN,
};

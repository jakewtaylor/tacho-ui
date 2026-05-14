// Border-crossing derivation. The raw EF_Border_Crossings rows
// (2021/1228 §2.11b CardBorderCrossingRecord) emit two records around
// every period where the VU couldn't place the vehicle on its onboard
// digital map — country code 0xFF "Rest of the World". That includes
// both real off-map transit (a channel ferry: UK → ROW → FR) and
// phantom dropouts at a port where the GPS or map briefly hiccupped
// (UK → ROW → UK at the same coords minutes later).
//
// This module pairs adjacent ROW entries chronologically and classifies
// each pair so the UI can present *one* row per logical event and hide
// phantom dropouts behind a toggle.

import type { db } from "../wailsjs/go/models";

export const ROW_CODE = 0xff;

export type SimpleCrossing = {
  kind: "crossing";
  at: string;
  from: number;
  to: number;
  latitude: number;
  longitude: number;
  authenticationStatus?: string;
  odometer: number;
};

export type OffMapTransit = {
  kind: "offmap";
  // "ferry" = vehicle entered ROW in country X and exited in country Y;
  // "dropout" = entered and exited in the same country (phantom).
  classification: "ferry" | "dropout";
  leftAt: string;
  rejoinedAt: string;
  from: number;
  to: number;
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  authenticationStatus?: string; // worst-case of the pair
  odometer: number; // odometer at rejoin
  kmTravelled: number; // delta between the two odometer readings
};

export type Orphan = {
  kind: "orphan";
  at: string;
  from: number;
  to: number;
  latitude: number;
  longitude: number;
  authenticationStatus?: string;
  odometer: number;
};

export type BorderTrip = SimpleCrossing | OffMapTransit | Orphan;

/**
 * deriveBorderTrips groups raw border-crossing rows into displayable
 * events. Output is chronologically ascending. Pure function; safe for
 * useMemo.
 *
 * Pairing rule: a "X → ROW" record is paired with the next "ROW → Y"
 * record by the same driver. If X == Y the pair is classified as a
 * `dropout` (phantom round-trip in one place); otherwise as a `ferry`
 * (real off-map transit between countries). Unmatched halves are
 * emitted as `orphan` so we never silently swallow data.
 */
export function deriveBorderTrips(raw: db.BorderCrossing[]): BorderTrip[] {
  const sorted = [...raw].sort((a, b) => a.crossedAt.localeCompare(b.crossedAt));
  const out: BorderTrip[] = [];

  // pendingEntry holds an unmatched "X → ROW" record; the next "ROW → Y"
  // we encounter will pair with it. Plain non-ROW crossings flush past
  // it unchanged.
  let pendingEntry: db.BorderCrossing | null = null;

  for (const r of sorted) {
    const enteringRow = r.countryEntered === ROW_CODE;
    const leavingRow = r.countryLeft === ROW_CODE;

    if (enteringRow && !leavingRow) {
      // X → ROW. If we already have a pending entry, the previous one
      // never closed — emit it as an orphan and replace.
      if (pendingEntry) out.push(orphanFrom(pendingEntry));
      pendingEntry = r;
      continue;
    }

    if (leavingRow && !enteringRow) {
      // ROW → Y. Pair with the pending entry if any.
      if (pendingEntry) {
        out.push(buildOffMap(pendingEntry, r));
        pendingEntry = null;
      } else {
        out.push(orphanFrom(r));
      }
      continue;
    }

    if (enteringRow && leavingRow) {
      // ROW → ROW. Rare; the VU stayed off-map across a recording. Treat
      // as orphan — no enough info to pair meaningfully.
      out.push(orphanFrom(r));
      continue;
    }

    // Neither side is ROW: a simple country-to-country crossing.
    out.push({
      kind: "crossing",
      at: r.crossedAt,
      from: r.countryLeft,
      to: r.countryEntered,
      latitude: r.latitude,
      longitude: r.longitude,
      authenticationStatus: r.authenticationStatus,
      odometer: r.odometer,
    });
  }

  // Trailing unmatched entry (vehicle was at sea / off-map when the
  // buffer ended). Surface it rather than dropping it.
  if (pendingEntry) out.push(orphanFrom(pendingEntry));

  return out;
}

// Longest realistic off-map driving segment. The longest scheduled
// ferry in the Channel/North Sea region (Hull → Zeebrugge etc.) is
// ~330 km. Treating anything over 1000 km as a "no-data" sentinel
// catches the bogus 16 777 215 km readings without throwing away
// genuine ferry runs.
const MAX_OFFMAP_KM = 1_000;

function buildOffMap(
  entry: db.BorderCrossing,
  exit: db.BorderCrossing,
): OffMapTransit {
  const from = entry.countryLeft;
  const to = exit.countryEntered;
  // Worst-case auth: if either half is "not_authenticated" the trip's
  // verification is suspect; if either is missing we report missing.
  const authPair = [entry.authenticationStatus, exit.authenticationStatus];
  let auth: string | undefined;
  if (authPair.some((a) => a === "not_authenticated")) {
    auth = "not_authenticated";
  } else if (authPair.every((a) => a === "authenticated")) {
    auth = "authenticated";
  } else {
    auth = undefined;
  }
  const rawKm = exit.odometer - entry.odometer;
  const km = rawKm < 0 || rawKm > MAX_OFFMAP_KM ? 0 : rawKm;
  return {
    kind: "offmap",
    classification: from === to ? "dropout" : "ferry",
    leftAt: entry.crossedAt,
    rejoinedAt: exit.crossedAt,
    from,
    to,
    fromLatitude: entry.latitude,
    fromLongitude: entry.longitude,
    toLatitude: exit.latitude,
    toLongitude: exit.longitude,
    authenticationStatus: auth,
    odometer: exit.odometer,
    kmTravelled: km,
  };
}

function orphanFrom(r: db.BorderCrossing): Orphan {
  return {
    kind: "orphan",
    at: r.crossedAt,
    from: r.countryLeft,
    to: r.countryEntered,
    latitude: r.latitude,
    longitude: r.longitude,
    authenticationStatus: r.authenticationStatus,
    odometer: r.odometer,
  };
}

/**
 * Convenience predicate for filtering dropouts out of the main list.
 */
export function isPhantomDropout(t: BorderTrip): boolean {
  return t.kind === "offmap" && t.classification === "dropout";
}

/**
 * isNoInfoEvent reports whether a derived trip is really a "no
 * information available" marker rather than a real border crossing.
 * The VU emits these on card insertion when it doesn't yet know what
 * country the vehicle is in (NationNumeric 0 = "No information
 * available", per Reg. 1360/2002 §2.72). They typically pair with the
 * subsequent ROW→X event when GPS locks on, producing a phantom
 * "0 → X" journey that's neither a ferry nor a real crossing.
 */
export function isNoInfoEvent(t: BorderTrip): boolean {
  return t.from === 0 || t.to === 0;
}

// --- Journey grouping ---------------------------------------------------
//
// A *journey* is a sequence of consecutive border crossings without a
// long rest between them — the natural unit for "trip from A to B via
// C and D". Anything with a gap larger than the threshold below
// (defaults to 6 hours, well above any plausible mid-day break but
// shorter than an EU-minimum 11h overnight rest) starts a new journey.

export type Journey = {
  startAt: string;
  endAt: string;
  from: number; // first country of the first leg
  to: number; // last country of the last leg
  via: number[]; // intermediate countries (in order, deduplicated, excluding from/to)
  legCount: number;
  hasOffmap: boolean; // any leg was an off-map transit (ferry / unmapped road)
  totalKm: number; // sum of km across all legs (best-effort from odometer deltas)
  durationMinutes: number; // start of first leg → end of last leg
  legs: BorderTrip[]; // underlying derived trips, in chronological order
};

export const DEFAULT_JOURNEY_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * groupIntoJourneys folds chronologically-ordered BorderTrips into
 * journeys. Phantom GPS dropouts and orphan halves are skipped — they're
 * noise at the journey level. Output is chronologically ascending.
 *
 * Gap rule: if `nextStart - prevEnd > gapMs`, start a new journey.
 * `prevEnd` is the trip's exit timestamp (rejoinedAt for offmap, `at`
 * for simple crossings).
 */
export function groupIntoJourneys(
  trips: BorderTrip[],
  opts: { gapMs?: number } = {},
): Journey[] {
  const gapMs = opts.gapMs ?? DEFAULT_JOURNEY_GAP_MS;
  const usable = trips.filter(
    (t) =>
      t.kind !== "orphan" && !isPhantomDropout(t) && !isNoInfoEvent(t),
  );
  if (usable.length === 0) return [];

  const out: Journey[] = [];
  let bucket: BorderTrip[] = [usable[0]];

  for (let i = 1; i < usable.length; i++) {
    const prevEnd = Date.parse(tripEndIso(bucket[bucket.length - 1]));
    const thisStart = Date.parse(tripStartIso(usable[i]));
    if (thisStart - prevEnd > gapMs) {
      out.push(buildJourney(bucket));
      bucket = [usable[i]];
    } else {
      bucket.push(usable[i]);
    }
  }
  out.push(buildJourney(bucket));
  return out;
}

function tripStartIso(t: BorderTrip): string {
  return t.kind === "offmap" ? t.leftAt : t.at;
}
function tripEndIso(t: BorderTrip): string {
  return t.kind === "offmap" ? t.rejoinedAt : t.at;
}
function tripFrom(t: BorderTrip): number {
  return t.from;
}
function tripTo(t: BorderTrip): number {
  return t.to;
}
// For odometer accounting: a SimpleCrossing is instantaneous so start
// and end are the same value. An OffMapTransit's `odometer` is the
// reading at the *exit* (rejoin) point — back out `kmTravelled` to get
// the entry-side reading.
function tripStartOdo(t: BorderTrip): number {
  if (t.kind === "offmap") return Math.max(0, t.odometer - t.kmTravelled);
  return t.odometer;
}
function tripEndOdo(t: BorderTrip): number {
  return t.odometer;
}

// The spec's operational range for OdometerShort is 0..9 999 999 km
// (App. 1 §2.113). 10 000 km in a single journey is impossible — a
// non-stop truck would take ~5 days at motorway speed. So if the
// computed totalKm sits outside [0, 10000] we treat one of the endpoint
// readings as a "no data" sentinel and report 0 (the UI renders "—").
const MAX_PLAUSIBLE_JOURNEY_KM = 10_000;

function buildJourney(legs: BorderTrip[]): Journey {
  const first = legs[0];
  const last = legs[legs.length - 1];
  const startAt = tripStartIso(first);
  const endAt = tripEndIso(last);
  const startOdo = tripStartOdo(first);
  const endOdo = tripEndOdo(last);
  const rawKm = endOdo - startOdo;
  const totalKm =
    rawKm < 0 || rawKm > MAX_PLAUSIBLE_JOURNEY_KM ? 0 : rawKm;

  // Build the country chain. Each leg contributes (from, to). Adjacent
  // legs typically agree on their shared country, so collapse repeats.
  const chain: number[] = [];
  for (const l of legs) {
    if (chain.length === 0) chain.push(tripFrom(l));
    if (chain[chain.length - 1] !== tripFrom(l)) {
      // Gap in continuity (the driver entered a new country without a
      // recorded crossing — possible if the prior leg's `to` was lost).
      chain.push(tripFrom(l));
    }
    chain.push(tripTo(l));
  }
  const from = chain[0];
  const to = chain[chain.length - 1];
  // `via` = intermediate countries in order, deduplicating consecutive
  // repeats and stripping the endpoints.
  const via: number[] = [];
  for (let i = 1; i < chain.length - 1; i++) {
    if (chain[i] !== chain[i - 1] && (via.length === 0 || via[via.length - 1] !== chain[i])) {
      via.push(chain[i]);
    }
  }

  const durationMinutes = Math.max(
    0,
    Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000),
  );

  return {
    startAt,
    endAt,
    from,
    to,
    via,
    legCount: legs.length,
    hasOffmap: legs.some((l) => l.kind === "offmap"),
    totalKm,
    durationMinutes,
    legs,
  };
}

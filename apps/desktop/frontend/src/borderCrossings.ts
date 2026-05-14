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
  const km = Math.max(0, exit.odometer - entry.odometer);
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

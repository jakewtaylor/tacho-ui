import { describe, expect, it } from "vitest";

import {
  deriveBorderTrips,
  groupIntoJourneys,
  isPhantomDropout,
  ROW_CODE,
} from "./borderCrossings";
import type { db } from "../wailsjs/go/models";

function bc(
  crossedAt: string,
  from: number,
  to: number,
  opts: Partial<db.BorderCrossing> = {},
): db.BorderCrossing {
  return {
    crossedAt,
    countryLeft: from,
    countryEntered: to,
    latitude: opts.latitude ?? 0,
    longitude: opts.longitude ?? 0,
    authenticationStatus: opts.authenticationStatus,
    odometer: opts.odometer ?? 0,
  } as db.BorderCrossing;
}

describe("deriveBorderTrips", () => {
  const UK = 21;
  const FR = 17;
  const DE = 13;

  it("passes through simple country-to-country crossings", () => {
    const trips = deriveBorderTrips([bc("2026-04-01T10:00:00Z", FR, DE)]);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({ kind: "crossing", from: FR, to: DE });
  });

  it("pairs X → ROW → Y as an offmap ferry", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T17:53:00Z", UK, ROW_CODE, {
        latitude: 51.13,
        longitude: 1.33,
        odometer: 1000,
      }),
      bc("2026-04-01T19:46:00Z", ROW_CODE, FR, {
        latitude: 50.97,
        longitude: 1.88,
        odometer: 1001,
      }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      kind: "offmap",
      classification: "ferry",
      from: UK,
      to: FR,
      kmTravelled: 1,
    });
  });

  it("classifies same-country pairs as phantom dropouts", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-02T15:53:00Z", UK, ROW_CODE, {
        latitude: 50.89,
        longitude: -1.4,
        odometer: 5000,
      }),
      bc("2026-04-02T16:46:00Z", ROW_CODE, UK, {
        latitude: 50.89,
        longitude: -1.4,
        odometer: 5001,
      }),
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0]).toMatchObject({
      kind: "offmap",
      classification: "dropout",
      from: UK,
      to: UK,
    });
    expect(isPhantomDropout(trips[0])).toBe(true);
  });

  it("emits orphan entries when a ROW segment is half-recorded", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-03T17:53:00Z", UK, ROW_CODE),
      // No matching ROW → Y; vehicle was at sea when the buffer ended.
    ]);
    expect(trips).toHaveLength(1);
    expect(trips[0].kind).toBe("orphan");

    const trips2 = deriveBorderTrips([
      bc("2026-04-03T19:46:00Z", ROW_CODE, FR),
      // No matching X → ROW; first record after card insert.
    ]);
    expect(trips2[0].kind).toBe("orphan");
  });

  it("preserves chronological ordering across pairs and simple rows", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T10:00:00Z", FR, DE),
      bc("2026-04-02T17:53:00Z", UK, ROW_CODE, { odometer: 1000 }),
      bc("2026-04-02T19:46:00Z", ROW_CODE, FR, { odometer: 1001 }),
      bc("2026-04-03T08:00:00Z", FR, DE),
    ]);
    expect(trips.map((t) => t.kind)).toEqual([
      "crossing",
      "offmap",
      "crossing",
    ]);
  });

  it("propagates authentication status worst-case from the pair", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T17:53:00Z", UK, ROW_CODE, {
        authenticationStatus: "authenticated",
        odometer: 1,
      }),
      bc("2026-04-01T19:46:00Z", ROW_CODE, FR, {
        authenticationStatus: "not_authenticated",
        odometer: 2,
      }),
    ]);
    expect(trips[0]).toMatchObject({
      kind: "offmap",
      authenticationStatus: "not_authenticated",
    });
  });
});

describe("groupIntoJourneys", () => {
  const UK = 21;
  const FR = 17;
  const BE = 6;
  const DE = 13;
  const NL = 38;

  it("groups same-day crossings into one journey", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T10:00:00Z", UK, ROW_CODE, { odometer: 100 }),
      bc("2026-04-01T12:00:00Z", ROW_CODE, FR, { odometer: 101 }),
      bc("2026-04-01T14:30:00Z", FR, BE, { odometer: 280 }),
      bc("2026-04-01T16:00:00Z", BE, DE, { odometer: 450 }),
    ]);
    const journeys = groupIntoJourneys(trips);
    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({
      from: UK,
      to: DE,
      via: [FR, BE],
      legCount: 3,
      hasOffmap: true,
      totalKm: 350,
    });
  });

  it("splits journeys on a long gap (>6h by default)", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T10:00:00Z", UK, FR, { odometer: 100 }),
      // 12h gap → new journey
      bc("2026-04-01T22:30:00Z", FR, BE, { odometer: 300 }),
    ]);
    const journeys = groupIntoJourneys(trips);
    expect(journeys).toHaveLength(2);
    expect(journeys[0].to).toBe(FR);
    expect(journeys[1].from).toBe(FR);
    expect(journeys[1].to).toBe(BE);
  });

  it("respects an overridden gap threshold", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T10:00:00Z", UK, FR),
      bc("2026-04-01T15:00:00Z", FR, BE),
    ]);
    // Default would group (5h < 6h); a 4h threshold splits them.
    const tight = groupIntoJourneys(trips, { gapMs: 4 * 3600 * 1000 });
    expect(tight).toHaveLength(2);
  });

  it("filters dropouts and orphans before grouping", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T10:00:00Z", UK, FR, { odometer: 100 }),
      // GPS dropout pair — should not split the journey or appear in it
      bc("2026-04-01T11:00:00Z", FR, ROW_CODE, {
        odometer: 101,
        latitude: 50,
        longitude: 2,
      }),
      bc("2026-04-01T11:30:00Z", ROW_CODE, FR, {
        odometer: 101,
        latitude: 50,
        longitude: 2,
      }),
      bc("2026-04-01T14:00:00Z", FR, DE, { odometer: 400 }),
    ]);
    const journeys = groupIntoJourneys(trips);
    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({ from: UK, to: DE, via: [FR] });
  });

  it("handles single-crossing journeys", () => {
    const trips = deriveBorderTrips([bc("2026-04-01T10:00:00Z", UK, FR)]);
    const journeys = groupIntoJourneys(trips);
    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({
      from: UK,
      to: FR,
      via: [],
      legCount: 1,
    });
  });

  it("handles round-trips (X → Y → X) as one journey", () => {
    const trips = deriveBorderTrips([
      bc("2026-04-01T08:00:00Z", NL, DE, { odometer: 100 }),
      bc("2026-04-01T13:00:00Z", DE, NL, { odometer: 200 }),
    ]);
    const journeys = groupIntoJourneys(trips);
    expect(journeys).toHaveLength(1);
    expect(journeys[0]).toMatchObject({
      from: NL,
      to: NL,
      via: [DE],
      totalKm: 100,
    });
  });

  it("returns empty for empty input", () => {
    expect(groupIntoJourneys([])).toEqual([]);
  });
});

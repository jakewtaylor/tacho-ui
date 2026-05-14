import { describe, expect, it } from "vitest";

import {
  deriveBorderTrips,
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

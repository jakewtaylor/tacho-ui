import { useCallback, useEffect, useState } from 'react';
import {
  GetDailyRecords,
  GetDriverProfile,
  GetDriverVehicles,
  GetEventsAndFaults,
  GetGnssPoints,
  GetPlaceRecords,
} from '../wailsjs/go/main/App';
import type { db } from '../wailsjs/go/models';

export type DriverData = {
  profile: db.DriverProfile;
  dailyRecords: db.DailyRecord[];
  placeRecords: db.PlaceRecord[];
  gnssPoints: db.GnssPoint[];
  events: db.CardEvent[];
  vehicles: db.DriverVehicle[];
};

export type DriverDataState = {
  loading: boolean;
  error: string | null;
  data: DriverData | null;
  reload: () => void;
};

/**
 * Loads everything we need to render a driver's pages in parallel from the
 * SQLite backend. Returns null until the driver is known to exist; throws to
 * `error` if any of the binding calls fails.
 */
export function useDriverData(cardNumber: string | null | undefined): DriverDataState {
  const [loading, setLoading] = useState<boolean>(!!cardNumber);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DriverData | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!cardNumber) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      GetDriverProfile(cardNumber),
      GetDailyRecords(cardNumber),
      GetPlaceRecords(cardNumber),
      GetGnssPoints(cardNumber),
      GetEventsAndFaults(cardNumber),
      GetDriverVehicles(cardNumber),
    ])
      .then(([profile, daily, places, gnss, events, vehicles]) => {
        if (cancelled) return;
        if (!profile) {
          setData(null);
          setError(`No driver found for card ${cardNumber}.`);
        } else {
          setData({
            profile,
            dailyRecords: daily ?? [],
            placeRecords: places ?? [],
            gnssPoints: gnss ?? [],
            events: events ?? [],
            vehicles: vehicles ?? [],
          });
        }
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(String((e as Error)?.message ?? e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cardNumber, tick]);

  return { loading, error, data, reload };
}

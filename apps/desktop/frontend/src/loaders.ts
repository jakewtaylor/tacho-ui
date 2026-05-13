import type { LoaderFunctionArgs } from "react-router-dom";

import {
  GetDailyRecords,
  GetDriverProfile,
  GetDriverVehicles,
  GetEventsAndFaults,
  GetGnssPoints,
  GetPlaceRecords,
  LicenseStatus,
  ListDrivers,
} from "../wailsjs/go/main/App";
import type { db, license } from "../wailsjs/go/models";

export type LayoutLoaderData = {
  drivers: db.DriverSummary[];
  licenseStatus: license.Status;
};

export async function layoutLoader(): Promise<LayoutLoaderData> {
  const [drivers, licenseStatus] = await Promise.all([
    ListDrivers(),
    LicenseStatus(),
  ]);
  return { drivers: drivers ?? [], licenseStatus };
}

export type DriverLoaderData = {
  cardNumber: string;
  profile: db.DriverProfile;
  dailyRecords: db.DailyRecord[];
  placeRecords: db.PlaceRecord[];
  gnssPoints: db.GnssPoint[];
  events: db.CardEvent[];
  vehicles: db.DriverVehicle[];
};

export async function driverLoader({
  params,
}: LoaderFunctionArgs): Promise<DriverLoaderData> {
  const cardNumber = params.cardNumber;
  if (!cardNumber) {
    throw new Response("Missing card number", { status: 400 });
  }

  const [profile, dailyRecords, placeRecords, gnssPoints, events, vehicles] =
    await Promise.all([
      GetDriverProfile(cardNumber),
      GetDailyRecords(cardNumber),
      GetPlaceRecords(cardNumber),
      GetGnssPoints(cardNumber),
      GetEventsAndFaults(cardNumber),
      GetDriverVehicles(cardNumber),
    ]);

  if (!profile) {
    throw new Response(`No driver found for card ${cardNumber}.`, {
      status: 404,
    });
  }

  // `?? []` is load-bearing: a Go nil slice marshals to JSON `null`, so the
  // Wails-generated TS types are `T[] | null`. We always hand consumers a real
  // array.
  return {
    cardNumber,
    profile,
    dailyRecords: dailyRecords ?? [],
    placeRecords: placeRecords ?? [],
    gnssPoints: gnssPoints ?? [],
    events: events ?? [],
    vehicles: vehicles ?? [],
  };
}

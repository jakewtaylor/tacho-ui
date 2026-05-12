import { useMemo } from "react";
import { useRouteLoaderData } from "react-router-dom";

import {
  ActivityPanel,
  DriverSummaryPanel,
  EventsPanel,
  ShiftsPanel,
  driverSummaryFromProfile,
} from "../panels";
import { MapPanel } from "../MapPanel";
import { pageTitle, useDocumentTitle } from "../useDocumentTitle";
import type { DriverLoaderData } from "../loaders";

export function Overview() {
  const data = useRouteLoaderData("driver") as DriverLoaderData;
  const summary = useMemo(() => driverSummaryFromProfile(data.profile), [data.profile]);
  const driverName = useMemo(() => {
    const p = data.profile;
    return [p.firstNames, p.surname].filter(Boolean).join(" ") || p.cardNumber;
  }, [data.profile]);
  useDocumentTitle(pageTitle(driverName));

  return (
    <div className="flex flex-col gap-6">
      <DriverSummaryPanel summary={summary} />
      <ActivityPanel cardNumber={data.cardNumber} records={data.dailyRecords} />
      <MapPanel points={data.gnssPoints} />
      <ShiftsPanel
        cardNumber={data.cardNumber}
        placeRecords={data.placeRecords}
        vehicles={data.vehicles}
      />
      <EventsPanel events={data.events} />
    </div>
  );
}

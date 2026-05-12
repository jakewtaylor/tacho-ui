import { useEffect, useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ActivityPanel,
  DriverSummaryPanel,
  EventsPanel,
  ShiftsPanel,
  driverSummaryFromProfile,
} from "../panels";
import { MapPanel } from "../MapPanel";
import { pageTitle, useDocumentTitle } from "../useDocumentTitle";
import { useDriverData } from "../useDriverData";
import { useLayoutCtx } from "../layouts/app-layout";

export function Overview() {
  const { cardNumber } = useParams<{ cardNumber: string }>();
  const { importTick } = useLayoutCtx();
  const { data, loading, error, reload } = useDriverData(cardNumber);

  useEffect(() => {
    if (importTick > 0) reload();
  }, [importTick, reload]);

  const summary = useMemo(
    () => driverSummaryFromProfile(data?.profile ?? null),
    [data?.profile],
  );

  const driverName = useMemo(() => {
    const p = data?.profile;
    if (!p) return null;
    return [p.firstNames, p.surname].filter(Boolean).join(" ") || p.cardNumber;
  }, [data?.profile]);
  useDocumentTitle(pageTitle(driverName));

  if (!cardNumber) return <Navigate to="/" replace />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Failed to load driver</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading driver…</CardTitle>
          </CardHeader>
        </Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DriverSummaryPanel summary={summary} />
      <ActivityPanel cardNumber={cardNumber} records={data.dailyRecords} />
      <MapPanel points={data.gnssPoints} />
      <ShiftsPanel
        cardNumber={cardNumber}
        placeRecords={data.placeRecords}
        vehicles={data.vehicles}
      />
      <EventsPanel events={data.events} />
    </div>
  );
}

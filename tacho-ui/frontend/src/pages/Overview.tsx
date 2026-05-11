import { useMemo } from 'react';
import { Navigate, useOutletContext, useParams } from 'react-router-dom';
import {
  ActivityPanel,
  DriverSummaryPanel,
  EventsPanel,
  ShiftsPanel,
  driverSummaryFromProfile,
} from '../panels';
import { MapPanel } from '../MapPanel';
import { pageTitle, useDocumentTitle } from '../useDocumentTitle';
import { useDriverData } from '../useDriverData';
import type { AppCtx } from '../App';

export type { AppCtx } from '../App';

export function Overview() {
  const { cardNumber } = useParams<{ cardNumber: string }>();
  const { importTick } = useOutletContext<AppCtx>();
  const { data, loading, error } = useDriverData(cardNumber);

  // Refetch when the import counter ticks (e.g. user dropped another file
  // while looking at this driver).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => {}, [importTick]);

  const summary = useMemo(
    () => driverSummaryFromProfile(data?.profile ?? null),
    [data?.profile]
  );

  const driverName = useMemo(() => {
    const p = data?.profile;
    if (!p) return null;
    return [p.firstNames, p.surname].filter(Boolean).join(' ') || p.cardNumber;
  }, [data?.profile]);
  useDocumentTitle(pageTitle(driverName));

  if (!cardNumber) return <Navigate to="/" replace />;

  if (error) {
    return (
      <div className="rounded-md border border-(--color-warn)/60 bg-(--color-warn)/10 px-3 py-2 font-mono text-xs">
        {error}
      </div>
    );
  }

  if (loading || !data) {
    return <div className="mt-16 text-center text-(--color-muted)">Loading driver…</div>;
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

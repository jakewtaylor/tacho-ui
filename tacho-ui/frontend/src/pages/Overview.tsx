import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { main } from '../../wailsjs/go/models';
import {
  ActivityPanel,
  DriverSummaryPanel,
  EventsPanel,
  ShiftsPanel,
  extractDriverSummary,
} from '../panels';
import { MapPanel } from '../MapPanel';
import { RawJSON } from '../RawJSON';
import { pageTitle, useDocumentTitle } from '../useDocumentTitle';

export type AppCtx = {
  result: main.ParseResult | null;
  parsedData: any;
  error: string | null;
  loading: boolean;
};

export function Overview() {
  const { result, parsedData, error, loading } = useOutletContext<AppCtx>();

  const summary = useMemo(() => {
    if (!result || !parsedData) return [];
    return extractDriverSummary(result.fileType, parsedData);
  }, [result, parsedData]);

  const driver = summary.find((s) => s.label === 'Driver')?.value;
  useDocumentTitle(pageTitle(driver ?? result?.filename ?? null));

  if (error) {
    return (
      <div className="rounded-md border border-(--color-warn)/60 bg-(--color-warn)/10 px-3 py-2 font-mono text-xs">
        {error}
      </div>
    );
  }

  if (!result || !parsedData) {
    if (loading) {
      return <div className="mt-16 text-center text-(--color-muted)">Parsing…</div>;
    }
    return (
      <div className="mt-16 text-center text-(--color-muted)">
        Open or drag in a{' '}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.ddd</code> file to view its contents.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="break-all font-mono text-sm text-(--color-muted)">{result.filename}</div>
        <span
          className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider ${
            result.fileType === 'card'
              ? 'bg-sky-500/25 text-sky-200'
              : 'bg-amber-500/25 text-amber-200'
          }`}
        >
          {result.fileType}
        </span>
      </div>

      <DriverSummaryPanel summary={summary} />

      {result.fileType === 'card' && <ActivityPanel data={parsedData} />}
      {result.fileType === 'card' && <MapPanel data={parsedData} />}
      {result.fileType === 'card' && <ShiftsPanel data={parsedData} />}
      {result.fileType === 'card' && <EventsPanel data={parsedData} />}

      <RawJSON json={result.json} />
    </div>
  );
}

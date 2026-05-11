import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ListDrivers, WipeDatabase } from '../../wailsjs/go/main/App';
import type { db } from '../../wailsjs/go/models';
import { nationName } from '../nations';
import { pageTitle, useDocumentTitle } from '../useDocumentTitle';
import type { AppCtx } from '../App';

export function Home() {
  const { importTick, triggerImport } = useOutletContext<AppCtx>();
  const [drivers, setDrivers] = useState<db.DriverSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wiping, setWiping] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  useDocumentTitle(pageTitle('Drivers'));

  useEffect(() => {
    let cancelled = false;
    setError(null);
    ListDrivers()
      .then((d) => {
        if (!cancelled) setDrivers(d ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String((e as Error)?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [importTick, reloadTick]);

  async function handleWipe() {
    const driverCount = drivers?.length ?? 0;
    if (driverCount === 0) {
      // Empty DB — wipe is a no-op but still confirm in case something is mid-import.
      if (!window.confirm('The database is already empty. Wipe anyway?')) return;
    } else {
      const totalDays = drivers!.reduce((sum, d) => sum + d.dailyRecordCount, 0);
      const totalImports = drivers!.reduce((sum, d) => sum + d.importCount, 0);
      const msg =
        `Wipe the database?\n\n` +
        `This will permanently delete:\n` +
        `  • ${driverCount} driver${driverCount === 1 ? '' : 's'}\n` +
        `  • ${totalImports} import${totalImports === 1 ? '' : 's'}\n` +
        `  • ${totalDays.toLocaleString()} daily record${totalDays === 1 ? '' : 's'}\n` +
        `  • all associated shifts, GNSS points, and events\n\n` +
        `This cannot be undone.`;
      // if (!window.confirm(msg)) return;
    }
    setWiping(true);
    setError(null);
    try {
      await WipeDatabase();
      setReloadTick((t) => t + 1);
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setWiping(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-md border border-(--color-warn)/60 bg-(--color-warn)/10 px-3 py-2 font-mono text-xs">
        {error}
      </div>
    );
  }

  if (drivers === null) {
    return <div className="mt-16 text-center text-(--color-muted)">Loading…</div>;
  }

  if (drivers.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center gap-4 text-center">
        <div className="text-lg font-semibold">No drivers yet</div>
        <p className="max-w-md text-sm text-(--color-muted)">
          Import a driver-card{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">.ddd</code> file to get
          started. Drag-and-drop also works.
        </p>
        <button
          onClick={triggerImport}
          className="h-9 rounded-md border border-(--color-border) bg-white/5 px-4 text-sm hover:bg-white/10"
        >
          Import .ddd file
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-base font-semibold">
          {drivers.length} driver{drivers.length === 1 ? '' : 's'}
        </h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-(--color-muted)">
            Click a driver to view their activity, weekly summary, and infringements.
          </p>
          <button
            onClick={handleWipe}
            disabled={wiping}
            className="rounded-md border border-(--color-warn)/40 bg-(--color-warn)/10 px-3 py-1 text-xs text-(--color-warn) hover:bg-(--color-warn)/20 disabled:cursor-progress disabled:opacity-50"
            title="Delete every imported driver, import, and record (for testing)"
          >
            {wiping ? 'Wiping…' : 'Wipe database'}
          </button>
        </div>
      </header>
      <div className="overflow-hidden rounded-lg border border-(--color-border) bg-(--color-surface)">
        <div
          className="grid gap-x-3 bg-black/15 px-4 py-2 text-[0.65rem] font-semibold uppercase tracking-wider text-(--color-muted)"
          style={{ gridTemplateColumns: '1fr 180px 160px 100px 100px' }}
        >
          <div>Driver</div>
          <div>Card number</div>
          <div>Data range</div>
          <div className="text-right">Days</div>
          <div className="text-right">Imports</div>
        </div>
        {drivers.map((d) => {
          const name = [d.firstNames, d.surname].filter(Boolean).join(' ') || '(unknown)';
          return (
            <Link
              key={d.cardNumber}
              to={`/driver/${d.cardNumber}`}
              className="grid items-center gap-x-3 border-t border-(--color-border) px-4 py-2 text-sm tabular-nums first:border-t-0 hover:bg-white/5"
              style={{ gridTemplateColumns: '1fr 180px 160px 100px 100px' }}
            >
              <div>
                <div className="font-medium">{name}</div>
                {d.issuingState ? (
                  <div className="text-[0.65rem] text-(--color-muted)">
                    {nationName(d.issuingState)}
                  </div>
                ) : null}
              </div>
              <div className="font-mono text-xs">{d.cardNumber}</div>
              <div className="font-mono text-xs text-(--color-muted)">
                {d.firstDate && d.lastDate ? `${d.firstDate} → ${d.lastDate}` : '—'}
              </div>
              <div className="text-right">{d.dailyRecordCount.toLocaleString()}</div>
              <div className="text-right">{d.importCount}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

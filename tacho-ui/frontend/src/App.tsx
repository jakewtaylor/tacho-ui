import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ImportDDDDialog, ImportDDDFromPath } from '../wailsjs/go/main/App';
import type { db } from '../wailsjs/go/models';

declare global {
  interface Window {
    runtime?: {
      OnFileDrop: (
        cb: (x: number, y: number, paths: string[]) => void,
        useDropTarget?: boolean
      ) => void;
      OnFileDropOff: () => void;
    };
  }
}

export type ImportNotice = {
  result: db.ImportResult;
  timestamp: number;
};

export type AppCtx = {
  notice: ImportNotice | null;
  triggerImport: () => Promise<void>;
  /** Bumps each time an import finishes — pages use it as a refetch signal. */
  importTick: number;
};

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ cardNumber?: string }>();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<ImportNotice | null>(null);
  const [importTick, setImportTick] = useState(0);

  const onImportSuccess = useCallback(
    (result: db.ImportResult) => {
      setNotice({ result, timestamp: Date.now() });
      setImportTick((t) => t + 1);
      if (result.driverCardNumber) {
        navigate(`/driver/${result.driverCardNumber}`);
      }
    },
    [navigate]
  );

  const triggerImport = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await ImportDDDDialog();
      if (r) onImportSuccess(r);
    } catch (e: unknown) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [onImportSuccess]);

  const importByPath = useCallback(
    async (path: string) => {
      setError(null);
      setLoading(true);
      try {
        const r = await ImportDDDFromPath(path);
        if (r) onImportSuccess(r);
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [onImportSuccess]
  );

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if ((e as any).relatedTarget) return;
      setDragging(false);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    if (window.runtime?.OnFileDrop) {
      window.runtime.OnFileDrop((_x, _y, paths) => {
        setDragging(false);
        if (paths && paths.length > 0) importByPath(paths[0]);
      }, false);
    }
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.runtime?.OnFileDropOff?.();
    };
  }, [importByPath]);

  const isPrintRoute = location.pathname.startsWith('/print');
  if (isPrintRoute) {
    return <Outlet context={{ notice, triggerImport, importTick } satisfies AppCtx} />;
  }

  const currentDriver = params.cardNumber ?? null;

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 pb-12 pt-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-(--color-border) pb-4">
        <div className="flex flex-wrap items-baseline gap-5">
          <h1 className="m-0 text-xl font-semibold">Tachograph Viewer</h1>
          <nav className="flex items-center gap-3 text-sm">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `transition-colors ${
                  isActive ? 'text-white font-medium' : 'text-(--color-muted) hover:text-white'
                }`
              }
            >
              Drivers
            </NavLink>
            {currentDriver && (
              <>
                <span className="text-(--color-muted)">/</span>
                <NavLink
                  to={`/driver/${currentDriver}`}
                  end
                  className={({ isActive }) =>
                    `transition-colors ${
                      isActive ? 'text-white font-medium' : 'text-(--color-muted) hover:text-white'
                    }`
                  }
                >
                  Overview
                </NavLink>
                <NavLink
                  to={`/driver/${currentDriver}/weeks`}
                  className={({ isActive }) =>
                    `transition-colors ${
                      isActive ? 'text-white font-medium' : 'text-(--color-muted) hover:text-white'
                    }`
                  }
                >
                  Weeks
                </NavLink>
              </>
            )}
          </nav>
        </div>
        <button
          onClick={triggerImport}
          disabled={loading}
          className="h-9 rounded-md border border-(--color-border) bg-white/5 px-4 text-sm hover:bg-white/10 disabled:cursor-progress disabled:opacity-50"
        >
          {loading ? 'Importing…' : 'Import .ddd file'}
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-(--color-warn)/60 bg-(--color-warn)/10 px-3 py-2 font-mono text-xs">
          {error}
        </div>
      )}
      {notice && (
        <ImportToast
          notice={notice}
          onDismiss={() => setNotice(null)}
        />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-(--color-bg)/85 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-(--color-driving) bg-(--color-surface)/95 px-10 py-8 text-center">
            <div className="text-lg font-semibold">Drop the .ddd file to import</div>
            <div className="mt-1 text-sm text-(--color-muted)">Release to add it to the database</div>
          </div>
        </div>
      )}

      <Outlet context={{ notice, triggerImport, importTick } satisfies AppCtx} />
    </div>
  );
}

function ImportToast({ notice, onDismiss }: { notice: ImportNotice; onDismiss: () => void }) {
  // Auto-dismiss after a few seconds.
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(t);
  }, [notice, onDismiss]);

  const r = notice.result;
  const verb = r.alreadyImported ? 'Already imported' : 'Imported';
  const counts = r.counts ?? {};
  const summary = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
    .join(' · ');

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
      <div>
        <span className="font-semibold text-emerald-200">{verb}:</span>{' '}
        <span className="font-mono">{r.filename}</span>
        {summary && <span className="text-(--color-muted)"> — {summary}</span>}
      </div>
      <button
        onClick={onDismiss}
        className="text-xs text-(--color-muted) hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}

export default App;

import { useState, useMemo, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { OpenAndParseDDD, ParseDDDFromPath } from '../wailsjs/go/main/App';
import { main } from '../wailsjs/go/models';

// Wails runtime declarations (loaded from window at runtime).
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

function App() {
  const [result, setResult] = useState<main.ParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const parsedData = useMemo(() => {
    if (!result?.json) return null;
    try {
      return JSON.parse(result.json);
    } catch {
      return null;
    }
  }, [result]);

  async function openFile() {
    setError(null);
    setLoading(true);
    try {
      const r = await OpenAndParseDDD();
      if (r) setResult(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const parseByPath = useCallback(async (path: string) => {
    setError(null);
    setLoading(true);
    try {
      const r = await ParseDDDFromPath(path);
      if (r) setResult(r);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

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
        if (paths && paths.length > 0) parseByPath(paths[0]);
      }, false);
    }

    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.runtime?.OnFileDropOff?.();
    };
  }, [parseByPath]);

  const isPrintRoute = useLocation().pathname.startsWith('/print');
  if (isPrintRoute) {
    return <Outlet context={{ result, parsedData, error, loading }} />;
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-6 pb-12 pt-6">
      <header className="mb-6 flex items-center justify-between gap-4 border-b border-(--color-border) pb-4">
        <div className="flex items-baseline gap-5">
          <h1 className="m-0 text-xl font-semibold">Tachograph Viewer</h1>
          {result?.fileType === 'card' && (
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
                Overview
              </NavLink>
              <NavLink
                to="/weeks"
                className={({ isActive }) =>
                  `transition-colors ${
                    isActive ? 'text-white font-medium' : 'text-(--color-muted) hover:text-white'
                  }`
                }
              >
                Weeks
              </NavLink>
            </nav>
          )}
        </div>
        <button
          onClick={openFile}
          disabled={loading}
          className="h-9 rounded-md border border-(--color-border) bg-white/5 px-4 text-sm hover:bg-white/10 disabled:cursor-progress disabled:opacity-50"
        >
          {loading ? 'Parsing…' : 'Open .ddd file'}
        </button>
      </header>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-(--color-bg)/85 backdrop-blur-sm">
          <div className="rounded-xl border-2 border-dashed border-(--color-driving) bg-(--color-surface)/95 px-10 py-8 text-center">
            <div className="text-lg font-semibold">Drop the .ddd file</div>
            <div className="mt-1 text-sm text-(--color-muted)">Release to parse</div>
          </div>
        </div>
      )}

      <Outlet context={{ result, parsedData, error, loading }} />
    </div>
  );
}

export default App;

import { useCallback, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ImportDDDFromBytes } from "../wailsjs/go/main/App";
import type { db } from "../wailsjs/go/models";

export type ImportNotice = {
  result: db.ImportResult;
  timestamp: number;
};

export type AppCtx = {
  notice: ImportNotice | null;
  importByBytes: (filename: string, bytes: Uint8Array) => Promise<void>;
  importing: boolean;
  /** Bumps each time an import finishes — pages use it as a refetch signal. */
  importTick: number;
};

function App() {
  const navigate = useNavigate();

  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<ImportNotice | null>(null);
  const [importTick, setImportTick] = useState(0);

  const importByBytes = useCallback(
    async (filename: string, bytes: Uint8Array) => {
      setImporting(true);
      try {
        const base64 = uint8ArrayToBase64(bytes);
        const r = await ImportDDDFromBytes(filename, base64);
        if (r) {
          setNotice({ result: r, timestamp: Date.now() });
          setImportTick((t) => t + 1);
          if (r.driverCardNumber) {
            navigate(`/driver/${r.driverCardNumber}`);
          }
        }
      } catch (e: unknown) {
        toast.error("Import failed", { description: String((e as Error)?.message ?? e) });
      } finally {
        setImporting(false);
      }
    },
    [navigate],
  );

  const ctx: AppCtx = { notice, importByBytes, importing, importTick };

  return (
    <TooltipProvider>
      <Outlet context={ctx} />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}

// Chunked base64 encoder — passing the whole Uint8Array through
// String.fromCharCode(...) overflows the JS argument stack on MB-scale files.
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return btoa(binary);
}

export default App;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Link,
  Outlet,
  useFetcher,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useOutletContext,
  useParams,
  useRevalidator,
  useRouteLoaderData,
} from "react-router-dom";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@tacholens/ui/components/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@tacholens/ui/components/breadcrumb";
import { Card, CardDescription, CardTitle } from "@tacholens/ui/components/card";
import { Separator } from "@tacholens/ui/components/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@tacholens/ui/components/sidebar";
import { PendingFileOpens } from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime/runtime";
import type { db } from "../../wailsjs/go/models";
import type { ImportActionResult } from "../actions";
import type { LayoutLoaderData } from "../loaders";

const FILE_OPENED_EVENT = "file-opened";

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export type LayoutCtx = {
  /** Opens the OS file picker (delegates to react-dropzone). */
  openFilePicker: () => void;
};

export function useLayoutCtx() {
  return useOutletContext<LayoutCtx>();
}

/** Hook for any page nested under the layout to read the sidebar drivers list. */
export function useLayoutData(): LayoutLoaderData {
  return useRouteLoaderData("layout") as LayoutLoaderData;
}

export function AppLayout() {
  const { drivers } = useLoaderData() as LayoutLoaderData;
  const navigate = useNavigate();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const fetcher = useFetcher<ImportActionResult>();
  const importing = fetcher.state !== "idle";

  // Queue of file paths the OS handed us via file-association (double-click
  // a .ddd, `open foo.ddd`, drop on the dock icon). The head of the queue is
  // surfaced as a confirm dialog; user accepts → submit through the same
  // fetcher → loader revalidation refreshes the driver list.
  const [pendingPaths, setPendingPaths] = useState<string[]>([]);

  // Drain anything the Go side buffered before this component mounted (cold
  // launch via double-click — OnFileOpen fires before the WebView is ready).
  useEffect(() => {
    let cancelled = false;
    PendingFileOpens()
      .then((paths) => {
        if (cancelled || !paths || paths.length === 0) return;
        setPendingPaths((prev) => [...prev, ...paths]);
      })
      .catch(() => {
        /* binding may not be reachable during teardown; ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Warm-launch case: subscribe to runtime events for any file opened while
  // the app is already running.
  useEffect(() => {
    const off = EventsOn(FILE_OPENED_EVENT, (...args: unknown[]) => {
      const paths = args[0];
      if (!Array.isArray(paths)) return;
      const onlyStrings = paths.filter(
        (p): p is string => typeof p === "string" && p.length > 0,
      );
      if (onlyStrings.length === 0) return;
      setPendingPaths((prev) => [...prev, ...onlyStrings]);
    });
    return off;
  }, []);

  const currentPendingPath = pendingPaths[0] ?? null;

  const dequeueCurrent = useCallback(() => {
    setPendingPaths((prev) => prev.slice(1));
  }, []);

  const confirmPendingImport = useCallback(() => {
    if (!currentPendingPath) return;
    const formData = new FormData();
    formData.append("path", currentPendingPath);
    fetcher.submit(formData, {
      method: "post",
      action: "/import-from-path",
    });
    dequeueCurrent();
  }, [currentPendingPath, dequeueCurrent, fetcher]);

  // React to completed import actions. We fire on the state transition
  // (non-idle → idle) rather than on data identity — that makes the effect's
  // dependency on `fetcher.data` purely informational and avoids the
  // "remember the last value we handled" dance.
  const prevFetcherState = useRef(fetcher.state);
  useEffect(() => {
    const prev = prevFetcherState.current;
    prevFetcherState.current = fetcher.state;
    if (prev === "idle" || fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher.data;
    if (data.ok) {
      announceImport(data.result);
      if (data.result.driverCardNumber) {
        navigate(`/driver/${data.result.driverCardNumber}`);
      }
    } else {
      toast.error("Import failed", { description: data.message });
    }
  }, [fetcher.state, fetcher.data, navigate]);

  const submitImport = useCallback(
    (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      fetcher.submit(formData, {
        method: "post",
        action: "/import",
        encType: "multipart/form-data",
      });
    },
    [fetcher],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        const names = rejected.map((r) => r.file.name).join(", ");
        toast.error("Not a .ddd file", { description: names });
        return;
      }
      const file = accepted[0];
      if (file) submitImport(file);
    },
    [submitImport],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    accept: { "application/octet-stream": [".ddd"] },
  });

  const ctx = useMemo<LayoutCtx>(() => ({ openFilePicker: open }), [open]);

  const isLoading =
    importing ||
    navigation.state === "loading" ||
    revalidator.state === "loading";

  return (
    <div {...getRootProps({ className: "contents" })}>
      <input {...getInputProps()} />
      <SidebarProvider>
        <AppSidebar
          drivers={drivers}
          triggerImport={open}
          importing={importing}
        />
        <SidebarInset>
          <Topbar drivers={drivers} loading={isLoading} />
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <Outlet context={ctx} />
          </main>
        </SidebarInset>

        {isDragActive && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm">
            <Card className="px-10 py-8 text-center ring-2 ring-primary">
              <CardTitle className="text-lg">
                Drop the .ddd file to import
              </CardTitle>
              <CardDescription>
                Release to add it to the database
              </CardDescription>
            </Card>
          </div>
        )}

        <AlertDialog
          open={currentPendingPath !== null}
          onOpenChange={(next) => {
            if (!next) dequeueCurrent();
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import this file?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2">
                  <p>
                    TachoLens was launched with a driver-card file.
                    Import it into the database?
                  </p>
                  <p className="break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                    {currentPendingPath
                      ? basename(currentPendingPath)
                      : ""}
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmPendingImport}>
                Import
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarProvider>
    </div>
  );
}

function Topbar({
  drivers,
  loading,
}: {
  drivers: db.DriverSummary[];
  loading: boolean;
}) {
  const location = useLocation();
  const params = useParams<{ cardNumber?: string; date?: string }>();

  const crumbs = buildBreadcrumbs(location.pathname, params, drivers);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-[orientation=vertical]:h-4"
      />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="contents">
                <BreadcrumbItem>
                  {last || !c.href ? (
                    <BreadcrumbPage className="truncate max-w-[40ch]">
                      {c.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={c.href}>{c.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator />}
              </span>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      {loading && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
        >
          <div className="h-full w-1/3 animate-[loader-slide_1s_ease-in-out_infinite] bg-primary" />
        </div>
      )}
    </header>
  );
}

function buildBreadcrumbs(
  pathname: string,
  params: { cardNumber?: string; date?: string },
  drivers: db.DriverSummary[],
): { label: string; href?: string }[] {
  const out: { label: string; href?: string }[] = [
    { label: "Drivers", href: "/" },
  ];
  if (!params.cardNumber) return out;
  const driver = drivers.find((d) => d.cardNumber === params.cardNumber);
  const driverName = driver
    ? [driver.firstNames, driver.surname].filter(Boolean).join(" ") ||
      driver.cardNumber
    : params.cardNumber;

  const driverHref = `/driver/${params.cardNumber}`;
  out.push({ label: driverName, href: driverHref });

  if (pathname.endsWith("/weeks")) {
    out.push({ label: "Weeks" });
  } else if (pathname.includes("/day/") && params.date) {
    out.push({ label: "Weeks", href: `${driverHref}/weeks` });
    out.push({ label: params.date });
  }
  return out;
}

function announceImport(r: db.ImportResult) {
  const counts = r.counts ?? {};
  const summary = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
    .join(" · ");
  const verb = r.alreadyImported ? "Already imported" : "Imported";
  const description = `${r.filename}${summary ? ` — ${summary}` : ""}`;

  if (r.alreadyImported) {
    toast.message(verb, { description });
  } else {
    toast.success(verb, { description });
  }
}

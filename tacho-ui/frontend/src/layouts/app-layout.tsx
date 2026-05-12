import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Link,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
} from "react-router-dom";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ListDrivers } from "../../wailsjs/go/main/App";
import type { db } from "../../wailsjs/go/models";
import type { AppCtx } from "../App";

export type LayoutCtx = AppCtx & {
  drivers: db.DriverSummary[] | null;
  reloadDrivers: () => void;
  /** Opens the OS file picker (delegates to react-dropzone). */
  openFilePicker: () => void;
};

export function useLayoutCtx() {
  return useOutletContext<LayoutCtx>();
}

export function AppLayout() {
  const parent = useOutletContext<AppCtx>();
  const { importTick, importByBytes, importing, notice } = parent;

  const [drivers, setDrivers] = useState<db.DriverSummary[] | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length > 0) {
        const names = rejected.map((r) => r.file.name).join(", ");
        toast.error("Not a .ddd file", { description: names });
        return;
      }
      const file = accepted[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      await importByBytes(file.name, new Uint8Array(buffer));
    },
    [importByBytes],
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    multiple: false,
    noClick: true,
    noKeyboard: true,
    accept: { "application/octet-stream": [".ddd"] },
  });

  useEffect(() => {
    let cancelled = false;
    ListDrivers()
      .then((d) => {
        if (!cancelled) setDrivers(d ?? []);
      })
      .catch(() => {
        if (!cancelled) setDrivers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [importTick, reloadTick]);

  useEffect(() => {
    if (!notice) return;
    const r = notice.result;
    const counts = r.counts ?? {};
    const summary = Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
      .join(" · ");
    const verb = r.alreadyImported ? "Already imported" : "Imported";
    if (r.alreadyImported) {
      toast.message(verb, { description: `${r.filename}${summary ? ` — ${summary}` : ""}` });
    } else {
      toast.success(verb, { description: `${r.filename}${summary ? ` — ${summary}` : ""}` });
    }
  }, [notice]);

  const ctx = useMemo<LayoutCtx>(
    () => ({
      ...parent,
      drivers,
      reloadDrivers: () => setReloadTick((t) => t + 1),
      openFilePicker: open,
    }),
    [parent, drivers, open],
  );

  return (
    <div {...getRootProps({ className: "contents" })}>
      <input {...getInputProps()} />
      <SidebarProvider>
        <AppSidebar drivers={drivers} triggerImport={open} importing={importing} />
        <SidebarInset>
          <Topbar drivers={drivers} />
          <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            <Outlet context={ctx} />
          </main>
        </SidebarInset>

        {isDragActive && (
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/85 backdrop-blur-sm">
            <Card className="px-10 py-8 text-center ring-2 ring-primary">
              <CardTitle className="text-lg">Drop the .ddd file to import</CardTitle>
              <CardDescription>Release to add it to the database</CardDescription>
            </Card>
          </div>
        )}
      </SidebarProvider>
    </div>
  );
}

function Topbar({ drivers }: { drivers: db.DriverSummary[] | null }) {
  const location = useLocation();
  const params = useParams<{ cardNumber?: string; date?: string }>();

  const crumbs = buildBreadcrumbs(location.pathname, params, drivers);

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} className="contents">
                <BreadcrumbItem>
                  {last || !c.href ? (
                    <BreadcrumbPage className="truncate max-w-[40ch]">{c.label}</BreadcrumbPage>
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
    </header>
  );
}

function buildBreadcrumbs(
  pathname: string,
  params: { cardNumber?: string; date?: string },
  drivers: db.DriverSummary[] | null,
): { label: string; href?: string }[] {
  const out: { label: string; href?: string }[] = [{ label: "Drivers", href: "/" }];
  if (!params.cardNumber) return out;
  const driver = drivers?.find((d) => d.cardNumber === params.cardNumber);
  const driverName = driver
    ? [driver.firstNames, driver.surname].filter(Boolean).join(" ") || driver.cardNumber
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

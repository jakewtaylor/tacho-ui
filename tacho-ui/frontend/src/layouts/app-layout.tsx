import { useCallback, useMemo, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import {
  Link,
  Outlet,
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
import { ImportDDDFromBytes } from "../../wailsjs/go/main/App";
import type { db } from "../../wailsjs/go/models";
import type { LayoutLoaderData } from "../loaders";

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

  const [importing, setImporting] = useState(false);

  const importByBytes = useCallback(
    async (filename: string, bytes: Uint8Array) => {
      setImporting(true);
      try {
        const base64 = uint8ArrayToBase64(bytes);
        const r = await ImportDDDFromBytes(filename, base64);
        if (r) {
          announceImport(r);
          revalidator.revalidate();
          if (r.driverCardNumber) {
            navigate(`/driver/${r.driverCardNumber}`);
          }
        }
      } catch (e: unknown) {
        toast.error("Import failed", {
          description: String((e as Error)?.message ?? e),
        });
      } finally {
        setImporting(false);
      }
    },
    [navigate, revalidator],
  );

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

  const ctx = useMemo<LayoutCtx>(() => ({ openFilePicker: open }), [open]);

  const isLoading =
    navigation.state === "loading" || revalidator.state === "loading";

  return (
    <div {...getRootProps({ className: "contents" })}>
      <input {...getInputProps()} />
      <SidebarProvider>
        <AppSidebar drivers={drivers} triggerImport={open} importing={importing} />
        <SidebarInset>
          <Topbar drivers={drivers} loading={isLoading} />
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
  const out: { label: string; href?: string }[] = [{ label: "Drivers", href: "/" }];
  if (!params.cardNumber) return out;
  const driver = drivers.find((d) => d.cardNumber === params.cardNumber);
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

function announceImport(r: {
  alreadyImported: boolean;
  filename: string;
  counts?: Record<string, number>;
}) {
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

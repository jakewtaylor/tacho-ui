import { useEffect, useRef } from "react";
import { useFetcher, useNavigate } from "react-router-dom";
import { Trash2, Upload, Users } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@tacholens/ui/alert-dialog";
import { Badge } from "@tacholens/ui/badge";
import { Button } from "@tacholens/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@tacholens/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@tacholens/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@tacholens/ui/table";
import type { WipeActionResult } from "../actions";
import { useLayoutCtx, useLayoutData } from "../layouts/app-layout";
import { nationName } from "../nations";
import { pageTitle, useDocumentTitle } from "../useDocumentTitle";

export function Home() {
  const navigate = useNavigate();
  const { openFilePicker } = useLayoutCtx();
  const { drivers } = useLayoutData();
  const wipeFetcher = useFetcher<WipeActionResult>();
  const wiping = wipeFetcher.state !== "idle";
  useDocumentTitle(pageTitle("Drivers"));

  // Toast once when the wipe fetcher transitions back to idle.
  const prevWipeState = useRef(wipeFetcher.state);
  useEffect(() => {
    const prev = prevWipeState.current;
    prevWipeState.current = wipeFetcher.state;
    if (prev === "idle" || wipeFetcher.state !== "idle" || !wipeFetcher.data) {
      return;
    }
    if (wipeFetcher.data.ok) {
      toast.success("Database wiped");
    } else {
      toast.error("Wipe failed", { description: wipeFetcher.data.message });
    }
  }, [wipeFetcher.state, wipeFetcher.data]);

  function handleWipe() {
    wipeFetcher.submit(null, { method: "post", action: "/wipe" });
  }

  if (drivers.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Upload />
          </EmptyMedia>
          <EmptyTitle>No drivers yet</EmptyTitle>
          <EmptyDescription>
            Import a driver-card{" "}
            <code className="rounded bg-muted px-1">.ddd</code> file to get
            started. Drag-and-drop also works.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={openFilePicker}>
            <Upload data-icon="inline-start" />
            Import .ddd file
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const totalDays = drivers.reduce((sum, d) => sum + d.dailyRecordCount, 0);
  const totalImports = drivers.reduce((sum, d) => sum + d.importCount, 0);

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Users className="size-4" />
          {drivers.length} driver{drivers.length === 1 ? "" : "s"}
        </CardTitle>
        <CardDescription>
          Click a driver to view their activity, weekly summary, and
          infringements.
        </CardDescription>
        <CardAction>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={wiping}>
                <Trash2 data-icon="inline-start" />
                {wiping ? "Wiping…" : "Wipe database"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Wipe the database?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>This will permanently delete:</p>
                    <ul className="ml-4 list-disc">
                      <li>
                        {drivers.length} driver{drivers.length === 1 ? "" : "s"}
                      </li>
                      <li>
                        {totalImports} import{totalImports === 1 ? "" : "s"}
                      </li>
                      <li>
                        {totalDays.toLocaleString()} daily record
                        {totalDays === 1 ? "" : "s"}
                      </li>
                      <li>all associated shifts, GNSS points, and events</li>
                    </ul>
                    <p>This cannot be undone.</p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleWipe} disabled={wiping}>
                  Wipe everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Driver</TableHead>
              <TableHead>Card number</TableHead>
              <TableHead>Data range</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead className="pr-4 text-right">Imports</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((d) => {
              const name =
                [d.firstNames, d.surname].filter(Boolean).join(" ") ||
                "(unknown)";
              return (
                <TableRow
                  key={d.cardNumber}
                  className="cursor-pointer"
                  onClick={() => navigate(`/driver/${d.cardNumber}`)}
                >
                  <TableCell className="pl-4">
                    <div className="font-medium">{name}</div>
                    {d.issuingState ? (
                      <div className="text-[0.65rem] text-muted-foreground">
                        {nationName(d.issuingState)}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {d.cardNumber}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {d.firstDate && d.lastDate
                      ? `${d.firstDate} → ${d.lastDate}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.dailyRecordCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">
                    <Badge variant="secondary">{d.importCount}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@tacholens/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@tacholens/ui/components/card";
import { Input } from "@tacholens/ui/components/input";
import { Label } from "@tacholens/ui/components/label";

import type {
  ActivateLicenseActionResult,
  DeactivateLicenseActionResult,
} from "../actions";
import type { license } from "../../wailsjs/go/models";
import { useLayoutData } from "../layouts/app-layout";

const KEY_PATTERN =
  /^TLX-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

function normaliseKey(input: string): string {
  return input.replace(/\s+/g, "").toUpperCase();
}

function formatDate(value: license.Status["updateWindowExpiresAt"]): string | null {
  if (!value) return null;
  const d = new Date(value as unknown as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function LicensePage() {
  const { licenseStatus } = useLayoutData();
  const activateFetcher = useFetcher<ActivateLicenseActionResult>();
  const deactivateFetcher = useFetcher<DeactivateLicenseActionResult>();

  const [key, setKey] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const activating = activateFetcher.state !== "idle";
  const deactivating = deactivateFetcher.state !== "idle";

  // React to action completion. Track the previous state so we only fire once
  // per round-trip (same pattern app-layout uses for the import fetcher).
  const prevActivateState = useRef(activateFetcher.state);
  useEffect(() => {
    const prev = prevActivateState.current;
    prevActivateState.current = activateFetcher.state;
    if (prev === "idle" || activateFetcher.state !== "idle" || !activateFetcher.data) {
      return;
    }
    const data = activateFetcher.data;
    if (data.ok) {
      setKey("");
      setClientError(null);
      toast.success("License activated", {
        description:
          "Persistent storage is on. Anything imported during the trial session has been cleared — re-import your files to keep them.",
      });
    } else {
      toast.error("Activation failed", { description: data.message });
    }
  }, [activateFetcher.state, activateFetcher.data]);

  const prevDeactivateState = useRef(deactivateFetcher.state);
  useEffect(() => {
    const prev = prevDeactivateState.current;
    prevDeactivateState.current = deactivateFetcher.state;
    if (prev === "idle" || deactivateFetcher.state !== "idle" || !deactivateFetcher.data) {
      return;
    }
    const data = deactivateFetcher.data;
    if (data.ok) {
      toast.message("License removed", {
        description: "Back in trial mode — imports won't persist.",
      });
    } else {
      toast.error("Could not remove license", { description: data.message });
    }
  }, [deactivateFetcher.state, deactivateFetcher.data]);

  const onActivate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const candidate = normaliseKey(key);
    if (!KEY_PATTERN.test(candidate)) {
      setClientError(
        "That doesn't look like a license key. They look like TLX-XXXX-XXXX-XXXX-XXXX.",
      );
      return;
    }
    setClientError(null);
    const fd = new FormData();
    fd.append("key", candidate);
    activateFetcher.submit(fd, { method: "post", action: "/license/activate" });
  };

  const onDeactivate = () => {
    if (
      !confirm(
        "Remove the local license? You'll need to paste the key again on this machine.",
      )
    ) {
      return;
    }
    deactivateFetcher.submit(null, {
      method: "post",
      action: "/license/deactivate",
    });
  };

  const status = licenseStatus;
  const expiry = formatDate(status?.updateWindowExpiresAt);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          settings
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">License</h1>
      </div>

      {status?.licensed ? (
        <Card>
          <CardHeader>
            <CardTitle>Licensed to {status.email}</CardTitle>
            <CardDescription>
              {status.licenseKey} · machines allowed: {status.machinesAllowed}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              You can install updates released up to and including{" "}
              <strong>{expiry ?? "—"}</strong>. The current version of
              TachoLens is dated {status.buildDate}.
            </p>
            {status.lastError && (
              <p className="mt-2 text-destructive">
                Last sync error: {status.lastError}
              </p>
            )}
          </CardContent>
          <CardFooter>
            <Button
              variant="outline"
              onClick={onDeactivate}
              disabled={deactivating}
            >
              {deactivating ? "Removing…" : "Remove license from this machine"}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Enter your license key</CardTitle>
            <CardDescription>
              Paste the key from your purchase email. Format:{" "}
              <code className="font-mono">TLX-XXXX-XXXX-XXXX-XXXX</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="-mt-2 text-xs text-muted-foreground">
            Lost your key or stuck on activation? Email{" "}
            <a
              href="mailto:support@tacholens.com?subject=TachoLens%20license"
              className="underline hover:text-foreground"
            >
              support@tacholens.com
            </a>
            .
          </CardContent>
          <form onSubmit={onActivate}>
            <CardContent className="space-y-3">
              <Label htmlFor="key">License key</Label>
              <Input
                id="key"
                name="key"
                autoComplete="off"
                autoFocus
                placeholder="TLX-XXXX-XXXX-XXXX-XXXX"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                disabled={activating}
                className="font-mono"
              />
              {clientError && (
                <p className="text-sm text-destructive">{clientError}</p>
              )}
            </CardContent>
            <CardFooter className="flex items-center justify-between">
              <Button asChild variant="outline" size="sm">
                <a
                  href="https://tacholens.com/#download"
                  target="_blank"
                  rel="noreferrer"
                >
                  Buy a license
                </a>
              </Button>
              <Button type="submit" disabled={activating}>
                {activating ? "Activating…" : "Activate"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}

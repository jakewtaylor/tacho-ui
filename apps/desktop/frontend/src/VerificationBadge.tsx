// Non-blocking badge that reports whether the card's per-EF signatures
// verified against the embedded ERCA root + the card's own MSCA cert.
// The check is informational only — features are never gated by
// verification status; this is purely a compliance signal.
//
// Three states map to the underlying ddd.SignatureSummary:
//
//   verified        ChainValid && VerifiedCount > 0 && FailedCount == 0
//   warn (failed)   FailedCount > 0
//   unverified      ChainValid == false / VerifiedCount == 0
//                   (typically because no ERCA root key was embedded —
//                   see packages/go-ddd/pki/README.md to populate)

import { ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

import { Badge } from "@tacholens/ui/components/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@tacholens/ui/components/tooltip";
import type { db } from "../wailsjs/go/models";

type Props = {
  summary: db.SignatureSummary | null;
};

export function VerificationBadge({ summary }: Props) {
  // No summary at all (import predates B.5 or had no verifier wired):
  // surface a quiet "unverified" without crying wolf.
  if (!summary) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Badge variant="outline" className="cursor-help gap-1 font-mono text-[10px]">
              <ShieldQuestion className="size-3" />
              unverified
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          No signature verification was performed on this card. Run{" "}
          <code className="rounded bg-muted px-1">go run ./cmd/refresh-pks</code>
          {" "}inside <code className="rounded bg-muted px-1">packages/go-ddd</code>
          {" "}to fetch the EU root keys, rebuild the app, and re-import.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (summary.failedCount > 0) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Badge variant="destructive" className="cursor-help gap-1 font-mono text-[10px]">
              <ShieldAlert className="size-3" />
              {summary.failedCount} signature failure
              {summary.failedCount === 1 ? "" : "s"}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          {summary.failedCount} per-EF signature
          {summary.failedCount === 1 ? "" : "s"} on this card did not match the
          equipment public key — typically a sign the card data was tampered
          with after issuance. Chain valid:{" "}
          {summary.chainValid ? "yes" : "no"}. Verified:{" "}
          {summary.verifiedCount}; failed: {summary.failedCount}; unverifiable:{" "}
          {summary.unverifiableCount}.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (summary.verified) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <Badge variant="secondary" className="cursor-help gap-1 font-mono text-[10px] text-emerald-500">
              <ShieldCheck className="size-3" />
              verified · {summary.verifiedCount}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm">
          ERCA → MSCA → card chain validates and every per-EF signature
          checked out ({summary.verifiedCount} EFs verified, 0 failed). The
          card's cryptographic integrity is intact.
        </TooltipContent>
      </Tooltip>
    );
  }

  // Chain didn't validate or no EFs verified — likely no ERCA root
  // embedded, so the verifier reported everything as unverifiable.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Badge variant="outline" className="cursor-help gap-1 font-mono text-[10px]">
            <ShieldQuestion className="size-3" />
            unverified
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        {summary.unverifiableCount} EFs were not verifiable (typically because
        no ERCA root key is embedded). Run{" "}
        <code className="rounded bg-muted px-1">go run ./cmd/refresh-pks</code>
        {" "}inside <code className="rounded bg-muted px-1">packages/go-ddd</code>
        {" "}to fetch the EU root keys, rebuild, and re-import.
      </TooltipContent>
    </Tooltip>
  );
}

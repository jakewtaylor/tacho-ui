import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@tacholens/ui/components/alert";

/**
 * Persistent, non-dismissible reminder that TachoLens is a first-look tool,
 * not a compliance product. Rendered at the top of any page that surfaces
 * rule-driven findings (WeeksPage, DayPage) and on the printed weekly
 * summary so a stakeholder reading a printout sees the disclaimer too.
 */
export function DisclaimerBanner() {
  return (
    <Alert>
      <Info />
      <AlertTitle>First-look summary — verify manually</AlertTitle>
      <AlertDescription>
        Findings on this page are pattern matches against EU 561/2006
        reference rules and may be incomplete or wrong. Treat them as a
        starting point for your own review — check the raw activity, the
        regulation text, and qualified advice before relying on any flag or
        total. TachoLens is not a compliance-certification tool.
      </AlertDescription>
    </Alert>
  );
}

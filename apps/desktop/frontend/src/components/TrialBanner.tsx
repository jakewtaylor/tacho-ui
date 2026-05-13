import { Link } from "react-router-dom";

import { Button } from "@tacholens/ui/components/button";

export function TrialBanner() {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
      <div>
        <strong>Trial mode</strong> — imports won&apos;t persist after you
        close the app. Buy a license to enable the full database.
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button asChild size="sm" variant="default">
          <Link to="/license">Enter license key</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href="https://tacholens.com/#download" target="_blank" rel="noreferrer">
            Buy a license
          </a>
        </Button>
      </div>
    </div>
  );
}

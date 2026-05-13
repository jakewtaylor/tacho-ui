import { useEffect } from "react";

const BASE_TITLE = "TachoLens";

/**
 * Sets `document.title` for the lifetime of the calling component and restores
 * the previous title on unmount. Pass `null`/`undefined` to leave the title
 * alone (e.g. while data is still loading).
 *
 * The macOS print dialog uses `document.title` as the default "Save as PDF"
 * filename, so route-level titles double as PDF filename hints.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/** Suffix a page-specific title with the app base, e.g. "Weekly summary · TachoLens". */
export function pageTitle(specific: string | null | undefined): string {
  if (!specific) return BASE_TITLE;
  return `${specific} · ${BASE_TITLE}`;
}

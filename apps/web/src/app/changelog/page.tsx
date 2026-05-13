import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { listReleases, type GitHubRelease } from "@/lib/github";

// react-markdown's Components type passes `node` (an internal AST handle) and
// declares `ref` as the React 18 LegacyRef shape, which React 19's typing for
// intrinsic elements no longer accepts on spread. We strip both before
// forwarding props to the underlying JSX element.
const markdownComponents: Components = {
  h1: ({ node: _n, ref: _r, ...props }) => (
    <h3 className="mt-5 font-heading text-[16px] font-semibold text-ink" {...props} />
  ),
  h2: ({ node: _n, ref: _r, ...props }) => (
    <h3 className="mt-5 font-heading text-[15px] font-semibold text-ink" {...props} />
  ),
  h3: ({ node: _n, ref: _r, ...props }) => (
    <h4 className="mt-4 font-heading text-[14px] font-semibold text-ink" {...props} />
  ),
  p: ({ node: _n, ref: _r, ...props }) => (
    <p className="mt-3 text-ink-2 leading-relaxed" {...props} />
  ),
  ul: ({ node: _n, ref: _r, ...props }) => (
    <ul className="mt-3 ml-5 list-disc space-y-1 text-ink-2" {...props} />
  ),
  ol: ({ node: _n, ref: _r, ...props }) => (
    <ol className="mt-3 ml-5 list-decimal space-y-1 text-ink-2" {...props} />
  ),
  li: ({ node: _n, ref: _r, ...props }) => (
    <li className="leading-relaxed" {...props} />
  ),
  a: ({ node: _n, ref: _r, ...props }) => (
    <a className="text-brand underline underline-offset-2 hover:opacity-80" {...props} />
  ),
  code: ({ node: _n, ref: _r, className, ...props }) => (
    <code
      className={
        "rounded bg-paper-2 border border-hairline px-1 py-0.5 font-mono text-[12px] " +
        (className ?? "")
      }
      {...props}
    />
  ),
  pre: ({ node: _n, ref: _r, ...props }) => (
    <pre
      className="mt-3 overflow-x-auto rounded-md border border-hairline bg-paper-2 p-3 text-[12px] font-mono leading-relaxed"
      {...props}
    />
  ),
  blockquote: ({ node: _n, ref: _r, ...props }) => (
    <blockquote
      className="mt-3 border-l-2 border-hairline-strong pl-3 text-ink-3"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-hairline" />,
  table: ({ node: _n, ref: _r, ...props }) => (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-[13px] border-collapse" {...props} />
    </div>
  ),
  th: ({ node: _n, ref: _r, ...props }) => (
    <th
      className="border-b border-hairline-strong px-2 py-1.5 text-left font-semibold"
      {...props}
    />
  ),
  td: ({ node: _n, ref: _r, ...props }) => (
    <td className="border-b border-hairline px-2 py-1.5" {...props} />
  ),
};

export const revalidate = 3600;

export const metadata = {
  title: "Changelog · TachoLens",
  description: "Release notes for the TachoLens desktop app.",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function releaseTitle(r: GitHubRelease): string {
  return r.name?.trim() || r.tag_name;
}

export default async function ChangelogPage() {
  let releases: GitHubRelease[] = [];
  let error: string | null = null;
  try {
    releases = await listReleases(50);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load releases";
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="max-w-[800px] mx-auto px-6 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12px] font-mono text-ink-3 hover:text-ink"
        >
          ← TachoLens
        </Link>

        <div className="mt-6 mb-10">
          <div className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
            release notes
          </div>
          <h1 className="mt-1 font-heading text-[40px] font-semibold tracking-tight leading-[1.05]">
            Changelog
          </h1>
          <p className="mt-3 text-ink-2 text-[15px] leading-relaxed max-w-xl">
            Every TachoLens release in reverse chronological order. Notes are
            published from the build pipeline and refreshed on this page once
            an hour.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-hairline-strong bg-paper-2 px-4 py-3 text-sm text-ink-2">
            Couldn&apos;t load releases right now. Please try again later.
          </div>
        )}

        {!error && releases.length === 0 && (
          <div className="rounded-md border border-hairline bg-paper-2 px-4 py-3 text-sm text-ink-3">
            No releases published yet.
          </div>
        )}

        <ol className="space-y-12">
          {releases.map((r) => (
            <li key={r.id} className="relative pl-6 border-l border-hairline">
              <span
                aria-hidden
                className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-brand ring-4 ring-paper"
              />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-heading text-[22px] font-semibold tracking-tight">
                  {releaseTitle(r)}
                </h2>
                {r.prerelease && (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-ink-3 border border-hairline rounded px-1.5 py-0.5">
                    prerelease
                  </span>
                )}
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  {r.tag_name}
                </span>
                <span className="font-mono text-[11px] text-ink-3 tabular-nums">
                  · {formatDate(r.published_at)}
                </span>
              </div>
              {r.body && r.body.trim().length > 0 ? (
                <div className="mt-2 text-[14px]">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={markdownComponents}
                  >
                    {r.body}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="mt-4 text-ink-3 text-sm italic">
                  No release notes for this version.
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}

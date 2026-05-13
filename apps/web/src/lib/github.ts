// Tiny typed client for the GitHub REST API. Private-repo safe — every call
// includes the GITHUB_API_TOKEN bearer token (fine-grained PAT with
// `Contents: read` on the tacho-ui repo is enough for releases + assets).

const OWNER_REPO = "jakewtaylor/tacho-ui";
const API_BASE = "https://api.github.com";

type FetchOpts = {
  /** Pass-through for Next.js fetch cache hints. */
  next?: { revalidate?: number };
  /** Override the redirect behaviour (used by the asset-download proxy). */
  redirect?: RequestRedirect;
  /** Accept header override. Default is the JSON API media type. */
  accept?: string;
};

function authHeaders(accept: string): HeadersInit {
  const token = process.env.GITHUB_API_TOKEN;
  if (!token) {
    throw new Error("GITHUB_API_TOKEN is not set");
  }
  return {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "tacholens-web",
  };
}

async function ghFetch(path: string, opts: FetchOpts = {}): Promise<Response> {
  const accept = opts.accept ?? "application/vnd.github+json";
  return fetch(`${API_BASE}${path}`, {
    headers: authHeaders(accept),
    redirect: opts.redirect ?? "follow",
    ...(opts.next ? { next: opts.next } : {}),
  });
}

export type GitHubRelease = {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  html_url: string;
  assets: {
    id: number;
    name: string;
    size: number;
    browser_download_url: string;
    content_type: string;
  }[];
};

/**
 * GitHub auto-appends "**Full Changelog**: https://github.com/.../compare/..."
 * to release notes when notes are generated from PRs, and individual PR /
 * commit links sometimes appear inline. We're not exposing the repo from
 * the marketing site, so strip anything that resolves back to github.com
 * before rendering. Returns the cleaned body (or `null` if it was null).
 */
function stripGitHubLinks(body: string | null): string | null {
  if (!body) return body;
  let out = body;
  // 1. Drop the auto-generated "Full Changelog" footer line entirely.
  out = out.replace(/^\s*\*{0,2}Full Changelog\*{0,2}:.*$/gim, "");
  // 2. Replace [text](https://github.com/...) markdown links with just text.
  out = out.replace(
    /\[([^\]]+)\]\(https?:\/\/github\.com\/[^)]+\)/g,
    "$1",
  );
  // 3. Drop any remaining bare github.com URLs.
  out = out.replace(/https?:\/\/github\.com\/\S+/g, "");
  // 4. Collapse 3+ blank lines (the deletions can leave gaps).
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}

/** Fetches the most recent N releases (drafts filtered out). Hourly cache. */
export async function listReleases(limit = 20): Promise<GitHubRelease[]> {
  const res = await ghFetch(`/repos/${OWNER_REPO}/releases?per_page=${limit}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    throw new Error(`GitHub releases: ${res.status} ${res.statusText}`);
  }
  const all = (await res.json()) as GitHubRelease[];
  return all
    .filter((r) => !r.draft)
    .map((r) => ({ ...r, body: stripGitHubLinks(r.body) }));
}

/** Latest non-draft, non-prerelease release. Hourly cache. */
export async function latestRelease(): Promise<GitHubRelease | null> {
  const releases = await listReleases(10);
  return releases.find((r) => !r.prerelease) ?? releases[0] ?? null;
}

/**
 * Resolves an asset ID to a short-lived signed download URL. GitHub responds
 * to `Accept: application/octet-stream` with a 302 to a presigned S3 URL —
 * we capture the Location header rather than following the redirect so the
 * caller can forward it to the browser.
 */
export async function getAssetDownloadUrl(assetId: number): Promise<string> {
  const res = await ghFetch(`/repos/${OWNER_REPO}/releases/assets/${assetId}`, {
    accept: "application/octet-stream",
    redirect: "manual",
  });
  if (res.status !== 302 && res.status !== 301) {
    throw new Error(
      `GitHub asset ${assetId}: expected redirect, got ${res.status}`,
    );
  }
  const location = res.headers.get("location");
  if (!location) {
    throw new Error(`GitHub asset ${assetId}: no Location header on redirect`);
  }
  return location;
}

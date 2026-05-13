import { NextResponse } from "next/server";
import {
  getAssetDownloadUrl,
  latestRelease,
  type GitHubRelease,
} from "@/lib/github";

export const runtime = "nodejs";
// Don't cache: GitHub-signed asset URLs are short-lived (~5 min). Each
// visitor needs a fresh one.
export const dynamic = "force-dynamic";

function pickAsset(release: GitHubRelease): GitHubRelease["assets"][number] | null {
  // Prefer .dmg, fall back to first asset.
  return (
    release.assets.find((a) => a.name.toLowerCase().endsWith(".dmg")) ??
    release.assets[0] ??
    null
  );
}

export async function GET() {
  try {
    const release = await latestRelease();
    if (!release) {
      return NextResponse.json({ error: "no releases yet" }, { status: 404 });
    }
    const asset = pickAsset(release);
    if (!asset) {
      return NextResponse.json(
        { error: "release has no downloadable asset" },
        { status: 404 },
      );
    }
    const signedUrl = await getAssetDownloadUrl(asset.id);
    return NextResponse.redirect(signedUrl, { status: 302 });
  } catch (err) {
    console.error("download proxy error", err);
    const message = err instanceof Error ? err.message : "download failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

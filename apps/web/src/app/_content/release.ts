/**
 * Release metadata. Hard-coded for now — TODO: parse from docs/appcast.xml
 * at build time so the version stamps stay in sync with reality.
 */

export const release = {
  version: "v0.1.2",
  dmgSizeMb: 13,
  publishedDate: "2026-05-13",
  repoUrl: "https://github.com/jakewtaylor/tacho-ui",
  latestReleaseUrl: "https://github.com/jakewtaylor/tacho-ui/releases/latest",
} as const;

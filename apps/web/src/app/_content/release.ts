/**
 * Release metadata shown in marketing copy. The actual release listing is
 * fetched from GitHub at /changelog and the .dmg is served via /api/download,
 * both of which authenticate with GITHUB_API_TOKEN against the private
 * jakewtaylor/tacho-ui repo. This file is just for the static "what version
 * is current" headings on the landing page.
 *
 * TODO: derive these three values from the latest GitHub release at build
 * time so the headings stay in sync with reality automatically.
 */

export const release = {
  version: "v0.1.2",
  dmgSizeMb: 13,
  publishedDate: "2026-05-13",
  // Linked discretely from the footer to satisfy AGPL-3.0's source-availability
  // requirement (tachoparser is AGPL and the combined desktop binary inherits
  // its copyleft).
  repoUrl: "https://github.com/jakewtaylor/tacho-ui",
} as const;

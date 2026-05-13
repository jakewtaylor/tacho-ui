#!/usr/bin/env node
// Applies the migration SQL files under ./drizzle/ to DATABASE_URL.
// Idempotent — each file uses CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
// drizzle-kit is currently broken on Node 24 due to a package-exports clash with
// recent drizzle-orm versions, so this script stands in for `drizzle-kit push`.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "drizzle");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

try {
  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const path = join(migrationsDir, file);
    const body = await readFile(path, "utf8");
    console.log(`Applying ${file}…`);
    await sql.unsafe(body);
  }
  console.log("Done.");
} finally {
  await sql.end({ timeout: 5 });
}

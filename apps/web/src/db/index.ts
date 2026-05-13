import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __pg: ReturnType<typeof postgres> | undefined;
  var __db: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

function buildClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__pg) {
    globalThis.__pg = postgres(process.env.DATABASE_URL, { max: 5 });
  }
  if (!globalThis.__db) {
    globalThis.__db = drizzle(globalThis.__pg, { schema, casing: "snake_case" });
  }
  return globalThis.__db;
}

export function getDb() {
  return buildClient();
}

export { schema };

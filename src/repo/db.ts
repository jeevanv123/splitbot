import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = ReturnType<typeof initDb>;

export function initDb(databaseUrl: string | undefined) {
  if (databaseUrl && databaseUrl.startsWith("postgres")) {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    return drizzlePg(pool, { schema });
  }
  const path = databaseUrl ?? "./data/splitbot.db";
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzleSqlite(sqlite, { schema });
}

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { upsertGroup, getGroup } from "./groups.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("groups repo", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(() => { db = makeTestDb(); });

  it("upserts a new group", async () => {
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip" });
    expect((await getGroup(db, "g1@g.us"))?.name).toBe("Goa Trip");
  });

  it("upsert updates group name", async () => {
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip" });
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip 2026" });
    expect((await getGroup(db, "g1@g.us"))?.name).toBe("Goa Trip 2026");
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { upsertGroup, getGroup, setGroupCurrency } from "./groups.js";

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

  it("getGroup returns INR as default currency", async () => {
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip" });
    expect((await getGroup(db, "g1@g.us"))?.currency).toBe("INR");
  });

  it("defaults currency to INR for newly upserted groups", async () => {
    await upsertGroup(db, { id: "g_default", name: "G" });
    const g = await getGroup(db, "g_default");
    expect(g?.currency).toBe("INR");
  });

  it("setGroupCurrency updates currency", async () => {
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip" });
    await setGroupCurrency(db, "g1@g.us", "USD");
    expect((await getGroup(db, "g1@g.us"))?.currency).toBe("USD");
  });

  it("upsertGroup does NOT overwrite an existing currency", async () => {
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip" });
    await setGroupCurrency(db, "g1@g.us", "USD");
    // Routine re-upsert from another handler should keep USD
    await upsertGroup(db, { id: "g1@g.us", name: "Goa Trip 2" });
    const g = await getGroup(db, "g1@g.us");
    expect(g?.currency).toBe("USD");
    expect(g?.name).toBe("Goa Trip 2");
  });
});

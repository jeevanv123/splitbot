import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { upsertUser, getUser, setUpi } from "./users.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("users repo", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(() => { db = makeTestDb(); });

  it("upserts a new user", async () => {
    await upsertUser(db, { id: "+91999", displayName: "Anu" });
    const u = await getUser(db, "+91999");
    expect(u?.displayName).toBe("Anu");
    expect(u?.upiId).toBeNull();
  });

  it("upsert updates display name without overwriting upi", async () => {
    await upsertUser(db, { id: "+91999", displayName: "Anu" });
    await setUpi(db, "+91999", "anu@okhdfc");
    await upsertUser(db, { id: "+91999", displayName: "Anu Sharma" });
    const u = await getUser(db, "+91999");
    expect(u?.displayName).toBe("Anu Sharma");
    expect(u?.upiId).toBe("anu@okhdfc");
  });

  it("getUser returns undefined for missing id", async () => {
    expect(await getUser(db, "+91000")).toBeUndefined();
  });
});

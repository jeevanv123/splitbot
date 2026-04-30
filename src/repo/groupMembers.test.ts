import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { upsertUser } from "./users.js";
import { upsertGroup } from "./groups.js";
import { recordGroupMember, listGroupMembers } from "./groupMembers.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("groupMembers repo", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
  });

  it("records and lists a single group member", async () => {
    await recordGroupMember(db as any, "g1", "+a");
    const list = await listGroupMembers(db as any, "g1");
    expect(list).toHaveLength(1);
    expect(list[0]!.displayName).toBe("Anu");
  });

  it("recordGroupMember is idempotent (updates lastSeenAt)", async () => {
    await recordGroupMember(db as any, "g1", "+a");
    await recordGroupMember(db as any, "g1", "+a");   // second call
    const list = await listGroupMembers(db as any, "g1");
    expect(list).toHaveLength(1);
  });

  it("lists multiple members", async () => {
    await recordGroupMember(db as any, "g1", "+a");
    await recordGroupMember(db as any, "g1", "+b");
    const list = await listGroupMembers(db as any, "g1");
    expect(list).toHaveLength(2);
    expect(list.map((m) => m.userId).sort()).toEqual(["+a", "+b"]);
  });
});

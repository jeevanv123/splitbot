import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { upsertUser } from "./users.js";
import { upsertGroup } from "./groups.js";
import { createDraft, listPendingDraftsForUser, listPendingDraftsInGroup, markDraftAssigned, markDraftCancelled } from "./drafts.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const sampleBill = {
  items: [{ name: "pasta", pricePaise: 62000 }],
  taxPaise: 5000,
  tipPaise: 0,
  totalPaise: 67000,
  currency: "INR",
};

describe("drafts repo", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertGroup(db, { id: "g1", name: "G" });
  });

  it("creates a draft and lists it as pending", async () => {
    const id = await createDraft(db, { groupId: "g1", uploaderId: "+a", bill: sampleBill, imagePath: null });
    expect(id).toBeGreaterThan(0);
    const userPending = await listPendingDraftsForUser(db, "g1", "+a");
    expect(userPending).toHaveLength(1);
    expect(userPending[0]!.bill.totalPaise).toBe(67000);
    const groupPending = await listPendingDraftsInGroup(db, "g1");
    expect(groupPending).toHaveLength(1);
  });

  it("markDraftAssigned removes from pending", async () => {
    const id = await createDraft(db, { groupId: "g1", uploaderId: "+a", bill: sampleBill, imagePath: null });
    await markDraftAssigned(db, id, 999);
    expect(await listPendingDraftsForUser(db, "g1", "+a")).toHaveLength(0);
  });

  it("markDraftCancelled removes from pending", async () => {
    const id = await createDraft(db, { groupId: "g1", uploaderId: "+a", bill: sampleBill, imagePath: null });
    await markDraftCancelled(db, id);
    expect(await listPendingDraftsForUser(db, "g1", "+a")).toHaveLength(0);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { createExpenseWithSplits } from "../repo/expenses.js";
import { setUpi } from "../repo/users.js";
import { handleSettle } from "./settle.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("handleSettle", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
    await setUpi(db as any, "+a", "anu@okhdfc");
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 1000,
      description: "x", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 500 }, { userId: "+b", sharePaise: 500 }],
    });
  });

  it("DMs UPI link to the debtor", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      msg: { kind: "text", groupId: "g1", senderId: "+b", senderDisplayName: "Beta", text: "/settle", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }],
    };
    const replies = await handleSettle(ctx);
    expect(replies[0]!.to).toBe("+b");
    expect(replies[0]!.text).toContain("upi://pay");
    expect(replies[0]!.text).toContain("anu%40okhdfc");
  });

  it("notes when creditor has no UPI", async () => {
    await upsertUser(db, { id: "+c", displayName: "Cee" });
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+c", amountPaise: 200,
      description: "y", source: "slash", draftId: null,
      splits: [{ userId: "+c", sharePaise: 100 }, { userId: "+b", sharePaise: 100 }],
    });
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      msg: { kind: "text", groupId: "g1", senderId: "+b", senderDisplayName: "Beta", text: "/settle", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }, { userId: "+c", displayName: "Cee" }],
    };
    const replies = await handleSettle(ctx);
    expect(replies[0]!.text).toMatch(/Cee.*no UPI/);
  });
});

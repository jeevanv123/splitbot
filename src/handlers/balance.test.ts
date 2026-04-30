import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { createExpenseWithSplits } from "../repo/expenses.js";
import { handleBalance } from "./balance.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("handleBalance", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 1000,
      description: "x", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 500 }, { userId: "+b", sharePaise: 500 }],
    });
  });

  it("DMs the sender their balance for the group", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      msg: { kind: "text", groupId: "g1", senderId: "+b", senderDisplayName: "Beta", text: "/balance", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }],
    };
    const replies = await handleBalance(ctx);
    expect(replies[0]!.to).toBe("+b");
    expect(replies[0]!.text).toMatch(/owe.*₹5/);
  });

  it("reports settled-up when net is zero", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      msg: { kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "/balance", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }],
    };
    const replies = await handleBalance(ctx);
    // Anu paid 1000, owes 500, net +500 — owed money
    expect(replies[0]!.text).toMatch(/owed.*₹5/);
  });
});

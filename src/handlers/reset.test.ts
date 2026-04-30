import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { createExpenseWithSplits, listExpenses } from "../repo/expenses.js";
import { createDraft, listPendingDraftsInGroup } from "../repo/drafts.js";
import { handleReset } from "./reset.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("handleReset", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertGroup(db, { id: "g2", name: "G2" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
  });

  it("wipes expenses and drafts in the group, leaves other groups untouched", async () => {
    // Seed g1 + g2 with expenses
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 1000,
      description: "x", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 500 }, { userId: "+b", sharePaise: 500 }],
    });
    await createExpenseWithSplits(db as any, {
      groupId: "g2", paidByUserId: "+a", amountPaise: 2000,
      description: "y", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 1000 }, { userId: "+b", sharePaise: 1000 }],
    });
    await createDraft(db as any, {
      groupId: "g1", uploaderId: "+a",
      bill: { items: [{ name: "pasta", pricePaise: 62000 }], taxPaise: 0, tipPaise: 0, totalPaise: 62000, currency: "INR" },
      imagePath: null,
    });

    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      model: "test-model",
      msg: { kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "/reset", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }],
    };

    const replies = await handleReset(ctx);
    expect(replies[0]!.text).toContain("Wiped 1");
    expect(replies[0]!.to).toBe("g1");

    expect(await listExpenses(db as any, "g1")).toHaveLength(0);
    expect(await listExpenses(db as any, "g2")).toHaveLength(1);
    expect(await listPendingDraftsInGroup(db as any, "g1")).toHaveLength(0);
  });

  it("rejects when used in DM", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      model: "test-model",
      msg: { kind: "text", groupId: null, senderId: "+a", senderDisplayName: "Anu", text: "/reset", receivedAt: new Date(), rawId: "1" },
      groupMembers: [],
    };
    const replies = await handleReset(ctx);
    expect(replies[0]!.text).toMatch(/inside a group/i);
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { createExpenseWithSplits } from "../repo/expenses.js";
import { handleHistory } from "./history.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const llm = { messages: { create: vi.fn() } };

describe("handleHistory", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
  });

  it("DMs the user when invoked outside a group", async () => {
    const ctx: HandlerContext = {
      db: db as any, llm, model: "test-model",
      msg: {
        kind: "text", groupId: null, senderId: "+a", senderDisplayName: "Anu",
        text: "/history", receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleHistory(ctx);
    expect(replies[0]!.to).toBe("+a");
    expect(replies[0]!.text).toMatch(/inside a group/);
  });

  it("says nothing logged yet when no expenses", async () => {
    const ctx: HandlerContext = {
      db: db as any, llm, model: "test-model",
      msg: {
        kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
        text: "/history", receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleHistory(ctx);
    expect(replies[0]!.text).toMatch(/No expenses logged yet/);
    expect(replies[0]!.keyboard).toBeUndefined();
  });

  it("lists expenses with delete buttons", async () => {
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 60000,
      description: "cab from airport", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 30000 }, { userId: "+b", sharePaise: 30000 }],
    });
    const ctx: HandlerContext = {
      db: db as any, llm, model: "test-model",
      msg: {
        kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
        text: "/history", receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleHistory(ctx);
    expect(replies[0]!.to).toBe("g1");
    expect(replies[0]!.text).toMatch(/Recent expenses/);
    expect(replies[0]!.text).toContain("cab from airport");
    expect(replies[0]!.text).toContain("Anu");
    expect(replies[0]!.text).toContain("₹600");
    expect(replies[0]!.keyboard).toBeDefined();
    expect(replies[0]!.keyboard).toHaveLength(1);
    expect(replies[0]!.keyboard![0]![0]!.callbackData).toMatch(/^del:\d+$/);
    expect(replies[0]!.keyboard![0]![0]!.text).toMatch(/Delete/);
  });

  it("caps at 10 rows when many expenses exist", async () => {
    for (let i = 0; i < 15; i++) {
      await createExpenseWithSplits(db as any, {
        groupId: "g1", paidByUserId: "+a", amountPaise: 100,
        description: `e${i}`, source: "slash", draftId: null,
        splits: [{ userId: "+a", sharePaise: 50 }, { userId: "+b", sharePaise: 50 }],
      });
    }
    const ctx: HandlerContext = {
      db: db as any, llm, model: "test-model",
      msg: {
        kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
        text: "/history", receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleHistory(ctx);
    expect(replies[0]!.keyboard).toHaveLength(10);
  });
});

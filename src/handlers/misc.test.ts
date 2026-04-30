import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser, getUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { createExpenseWithSplits } from "../repo/expenses.js";
import { createDraft } from "../repo/drafts.js";
import { handleUpi } from "./upi.js";
import { handlePaid } from "./paid.js";
import { handleBills } from "./bills.js";
import { handleHelp } from "./help.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const llm = { messages: { create: vi.fn() } };
const dummyMsg = (overrides: Partial<HandlerContext["msg"]> = {}): HandlerContext["msg"] => ({
  kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
  text: "x", receivedAt: new Date(), rawId: "1", ...overrides,
});

describe("misc handlers", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
  });

  it("/upi sets the user's UPI id", async () => {
    const ctx: HandlerContext = { db: db as any, llm, model: "test-model", msg: dummyMsg(), groupMembers: [] };
    await handleUpi(ctx, { command: "upi", upiId: "anu@okhdfc" });
    const u = await getUser(db as any, "+a");
    expect(u?.upiId).toBe("anu@okhdfc");
  });

  it("/paid marks splits settled up to the amount", async () => {
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 1000,
      description: "x", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 500 }, { userId: "+b", sharePaise: 500 }],
    });
    const ctx: HandlerContext = {
      db: db as any, llm,
      model: "test-model",
      msg: dummyMsg({ senderId: "+b", senderDisplayName: "Beta" }),
      groupMembers: [],
    };
    const replies = await handlePaid(ctx, { command: "paid", toUserId: "+a", amountPaise: 500 });
    expect(replies[0]!.text).toMatch(/marked.*settled/i);
  });

  it("/paid with amount smaller than smallest split returns hint", async () => {
    // Single ₹500 split (sharePaise=50000), payment of ₹400 (40000 paise) → can't settle.
    await createExpenseWithSplits(db as any, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 100000,
      description: "x", source: "slash", draftId: null,
      splits: [{ userId: "+a", sharePaise: 50000 }, { userId: "+b", sharePaise: 50000 }],
    });
    const ctx: HandlerContext = {
      db: db as any, llm,
      model: "test-model",
      msg: dummyMsg({ senderId: "+b", senderDisplayName: "Beta" }),
      groupMembers: [],
    };
    const replies = await handlePaid(ctx, { command: "paid", toUserId: "+a", amountPaise: 40000 });
    expect(replies[0]!.text).toMatch(/Couldn't settle/i);
    expect(replies[0]!.text).toMatch(/Smallest unsettled/i);
    expect(replies[0]!.text).toContain("₹500");
  });

  it("/bills lists pending drafts in the group", async () => {
    await createDraft(db as any, {
      groupId: "g1", uploaderId: "+a",
      bill: { items: [{ name: "pasta", pricePaise: 62000 }], taxPaise: 0, tipPaise: 0, totalPaise: 62000, currency: "INR" },
      imagePath: null,
    });
    const ctx: HandlerContext = { db: db as any, llm, model: "test-model", msg: dummyMsg(), groupMembers: [] };
    const replies = await handleBills(ctx);
    expect(replies[0]!.text).toContain("pasta");
    expect(replies[0]!.text).toContain("₹620");
  });

  it("/help returns usage info", async () => {
    const ctx: HandlerContext = { db: db as any, llm, model: "test-model", msg: dummyMsg(), groupMembers: [] };
    const replies = await handleHelp(ctx);
    expect(replies[0]!.text).toMatch(/\/split/);
    expect(replies[0]!.text).toMatch(/\/settle/);
  });
});

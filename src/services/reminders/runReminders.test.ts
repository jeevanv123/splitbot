import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import pino from "pino";
import * as schema from "../../repo/schema.js";
import { upsertUser } from "../../repo/users.js";
import { upsertGroup, setGroupCurrency } from "../../repo/groups.js";
import { createExpenseWithSplits } from "../../repo/expenses.js";
import { listUnsettledSplits, markSplitsSettled } from "../../repo/splits.js";
import { runReminders } from "./runReminders.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const FIXED_NOW = new Date("2026-04-30T12:00:00Z");
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const OLD_DATE = new Date(FIXED_NOW.getTime() - SEVEN_DAYS_MS - 24 * 60 * 60 * 1000); // 8 days old
const RECENT_DATE = new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000);              // 1 day old

const silentLogger = pino({ level: "silent" });

async function backdateExpense(db: any, expenseId: number, createdAt: Date) {
  await db.update(schema.expenses)
    .set({ createdAt })
    .where(eq(schema.expenses.id, expenseId));
}

async function seed(db: any) {
  await upsertUser(db, { id: "+a", displayName: "Anu" });
  await upsertUser(db, { id: "+b", displayName: "Beta" });
  await upsertUser(db, { id: "+c", displayName: "Cee" });
  await upsertGroup(db, { id: "g1", name: "Group One" });
}

describe("runReminders", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await seed(db);
  });

  it("no-ops when there are no stale splits", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const result = await runReminders({
      db, logger: silentLogger, send, now: () => FIXED_NOW,
    });
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ groupsReminded: 0, splitsMarked: 0 });
  });

  it("sends one message per group with stale splits and marks them reminded", async () => {
    const id = await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 30000,
      description: "cab", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 10000 },
        { userId: "+b", sharePaise: 10000 },
        { userId: "+c", sharePaise: 10000 },
      ],
    });
    await backdateExpense(db, id, OLD_DATE);

    const send = vi.fn().mockResolvedValue({ ok: true });
    const result = await runReminders({
      db, logger: silentLogger, send, now: () => FIXED_NOW,
    });

    expect(send).toHaveBeenCalledTimes(1);
    const [chatId, text] = send.mock.calls[0]!;
    expect(chatId).toBe("g1");
    expect(text).toContain("Friendly reminder");
    expect(text).toContain("Beta owes Anu");
    expect(text).toContain("Cee owes Anu");
    // INR default → ₹ symbol
    expect(text).toContain("₹100");

    expect(result.groupsReminded).toBe(1);
    expect(result.splitsMarked).toBe(3);
  });

  it("does not re-send on a second run after splits are marked", async () => {
    const id = await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 20000,
      description: "dinner", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 10000 },
        { userId: "+b", sharePaise: 10000 },
      ],
    });
    await backdateExpense(db, id, OLD_DATE);

    const send = vi.fn().mockResolvedValue({ ok: true });
    await runReminders({ db, logger: silentLogger, send, now: () => FIXED_NOW });
    expect(send).toHaveBeenCalledTimes(1);

    await runReminders({ db, logger: silentLogger, send, now: () => FIXED_NOW });
    expect(send).toHaveBeenCalledTimes(1); // still 1 — no re-send
  });

  it("uses the group currency in the reminder message", async () => {
    await setGroupCurrency(db as any, "g1", "USD");
    const id = await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 20000,
      description: "lunch", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 10000 },
        { userId: "+b", sharePaise: 10000 },
      ],
    });
    await backdateExpense(db, id, OLD_DATE);

    const send = vi.fn().mockResolvedValue({ ok: true });
    await runReminders({ db, logger: silentLogger, send, now: () => FIXED_NOW });

    expect(send).toHaveBeenCalledTimes(1);
    const text = send.mock.calls[0]![1];
    expect(text).toContain("$100");
    expect(text).not.toContain("₹");
  });

  it("does not send to groups whose stale splits are all settled", async () => {
    const id = await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 20000,
      description: "old-but-paid", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 10000 },
        { userId: "+b", sharePaise: 10000 },
      ],
    });
    await backdateExpense(db, id, OLD_DATE);

    // Mark every split settled before the reminder run.
    const all = await listUnsettledSplits(db, "g1");
    await markSplitsSettled(db, all.map((s) => s.id));

    const send = vi.fn().mockResolvedValue({ ok: true });
    const result = await runReminders({
      db, logger: silentLogger, send, now: () => FIXED_NOW,
    });
    expect(send).not.toHaveBeenCalled();
    expect(result.groupsReminded).toBe(0);
  });

  it("does not mark splits reminded if send fails (so it can retry next run)", async () => {
    const id = await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 20000,
      description: "fail-send", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 10000 },
        { userId: "+b", sharePaise: 10000 },
      ],
    });
    await backdateExpense(db, id, OLD_DATE);

    const sendFail = vi.fn().mockResolvedValue({ ok: false });
    const r1 = await runReminders({ db, logger: silentLogger, send: sendFail, now: () => FIXED_NOW });
    expect(r1.groupsReminded).toBe(0);

    // Now succeed: it should retry and mark them.
    const sendOk = vi.fn().mockResolvedValue({ ok: true });
    const r2 = await runReminders({ db, logger: silentLogger, send: sendOk, now: () => FIXED_NOW });
    expect(sendOk).toHaveBeenCalledTimes(1);
    expect(r2.groupsReminded).toBe(1);
  });
});

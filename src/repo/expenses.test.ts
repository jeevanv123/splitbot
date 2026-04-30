import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.js";
import { upsertUser } from "./users.js";
import { upsertGroup } from "./groups.js";
import { createExpenseWithSplits, listExpenses } from "./expenses.js";
import { netBalances, listUnsettledSplits, markSplitsSettled } from "./splits.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

async function seed(db: any) {
  await upsertUser(db, { id: "+a", displayName: "Anu" });
  await upsertUser(db, { id: "+b", displayName: "Beta" });
  await upsertUser(db, { id: "+c", displayName: "Cee" });
  await upsertGroup(db, { id: "g1", name: "G" });
}

describe("expenses + splits", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => { db = makeTestDb(); await seed(db); });

  it("creates an expense with three splits and lists them", async () => {
    const expenseId = await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 60000,
      description: "cab", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 20000 },
        { userId: "+b", sharePaise: 20000 },
        { userId: "+c", sharePaise: 20000 },
      ],
    });
    const list = await listExpenses(db, "g1");
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(expenseId);
    expect(list[0]!.amountPaise).toBe(60000);
  });

  it("computes net balances from unsettled splits", async () => {
    await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 60000,
      description: "cab", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 20000 },
        { userId: "+b", sharePaise: 20000 },
        { userId: "+c", sharePaise: 20000 },
      ],
    });
    const balances = await netBalances(db, "g1");
    const map = Object.fromEntries(balances.map((b) => [b.userId, b.netPaise]));
    expect(map["+a"]).toBe(40000);    // paid 60k, owes 20k → +40k
    expect(map["+b"]).toBe(-20000);
    expect(map["+c"]).toBe(-20000);
  });

  it("markSplitsSettled excludes settled splits from balance", async () => {
    await createExpenseWithSplits(db, {
      groupId: "g1", paidByUserId: "+a", amountPaise: 60000,
      description: "cab", source: "slash", draftId: null,
      splits: [
        { userId: "+a", sharePaise: 20000 },
        { userId: "+b", sharePaise: 20000 },
        { userId: "+c", sharePaise: 20000 },
      ],
    });
    const unsettled = await listUnsettledSplits(db, "g1");
    const bSplit = unsettled.find((s) => s.userId === "+b")!;
    await markSplitsSettled(db, [bSplit.id]);
    const balances = await netBalances(db, "g1");
    const map = Object.fromEntries(balances.map((b) => [b.userId, b.netPaise]));
    expect(map["+a"]).toBe(20000);   // only c still owes
    expect(map["+b"]).toBe(0);       // settled or absent
    expect(map["+c"]).toBe(-20000);
  });
});

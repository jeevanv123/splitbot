import { eq, isNull, inArray, and, lt } from "drizzle-orm";
import * as schema from "./schema.js";
import type { Split, Paise } from "../types/domain.js";

type AnyDb = { select: any; insert: any; update: any };

export interface NetBalance {
  userId: string;
  netPaise: Paise;
}

export interface StaleUnsettledSplit {
  id: number;
  groupId: string;
  expenseId: number;
  userId: string;           // debtor
  paidByUserId: string;     // creditor (from joined expenses)
  sharePaise: Paise;
  createdAt: Date;
}

export async function listUnsettledSplits(db: AnyDb, groupId: string): Promise<Split[]> {
  const rows = await db.select({
    id: schema.splits.id,
    expenseId: schema.splits.expenseId,
    userId: schema.splits.userId,
    sharePaise: schema.splits.sharePaise,
    settledAt: schema.splits.settledAt,
  })
    .from(schema.splits)
    .innerJoin(schema.expenses, eq(schema.splits.expenseId, schema.expenses.id))
    .where(and(eq(schema.expenses.groupId, groupId), isNull(schema.splits.settledAt)));
  return rows;
}

export async function netBalances(db: AnyDb, groupId: string): Promise<NetBalance[]> {
  // For each user in group:
  //   net = sum(amount of expenses they paid) - sum(their unsettled share)
  const expenses = await db.select().from(schema.expenses).where(eq(schema.expenses.groupId, groupId));
  const unsettled = await listUnsettledSplits(db, groupId);

  const totals = new Map<string, number>();
  for (const e of expenses) {
    const allSplitsForExpense = await db.select().from(schema.splits)
      .where(and(eq(schema.splits.expenseId, e.id)));
    const settledForExpense = allSplitsForExpense
      .reduce((s: number, r: any) => s + (r.settledAt ? r.sharePaise : 0), 0);
    const credited = e.amountPaise - settledForExpense;
    totals.set(e.paidByUserId, (totals.get(e.paidByUserId) ?? 0) + credited);
    // Ensure every participant (even fully-settled) appears in the result with 0.
    for (const r of allSplitsForExpense) {
      if (!totals.has(r.userId)) totals.set(r.userId, 0);
    }
  }
  for (const s of unsettled) {
    totals.set(s.userId, (totals.get(s.userId) ?? 0) - s.sharePaise);
  }
  return Array.from(totals.entries()).map(([userId, netPaise]) => ({ userId, netPaise }));
}

export async function markSplitsSettled(db: AnyDb, splitIds: number[]): Promise<void> {
  if (splitIds.length === 0) return;
  await db.update(schema.splits)
    .set({ settledAt: new Date() })
    .where(inArray(schema.splits.id, splitIds));
}

/**
 * Splits that:
 *  - have settledAt IS NULL (still owed)
 *  - have reminderSentAt IS NULL (never reminded)
 *  - whose parent expense was created before `olderThan`
 *
 * Returns rows joined with expenses so callers know which group + creditor + when.
 */
export async function findStaleUnsettledSplits(db: AnyDb, olderThan: Date): Promise<StaleUnsettledSplit[]> {
  const rows = await db.select({
    id: schema.splits.id,
    groupId: schema.expenses.groupId,
    expenseId: schema.splits.expenseId,
    userId: schema.splits.userId,
    paidByUserId: schema.expenses.paidByUserId,
    sharePaise: schema.splits.sharePaise,
    createdAt: schema.expenses.createdAt,
  })
    .from(schema.splits)
    .innerJoin(schema.expenses, eq(schema.splits.expenseId, schema.expenses.id))
    .where(and(
      isNull(schema.splits.settledAt),
      isNull(schema.splits.reminderSentAt),
      lt(schema.expenses.createdAt, olderThan),
    ));
  return rows;
}

export async function markSplitsReminded(db: AnyDb, splitIds: number[]): Promise<void> {
  if (splitIds.length === 0) return;
  await db.update(schema.splits)
    .set({ reminderSentAt: new Date() })
    .where(inArray(schema.splits.id, splitIds));
}

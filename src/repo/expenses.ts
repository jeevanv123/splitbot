import { eq, desc } from "drizzle-orm";
import * as schema from "./schema.js";
import type { Expense, ExpenseSource, Paise } from "../types/domain.js";

type AnyDb = { select: any; insert: any; update: any; transaction: any };

export interface CreateExpenseInput {
  groupId: string;
  paidByUserId: string;
  amountPaise: Paise;
  description: string;
  source: ExpenseSource;
  draftId: number | null;
  splits: { userId: string; sharePaise: Paise }[];
}

export async function createExpenseWithSplits(db: AnyDb, input: CreateExpenseInput): Promise<number> {
  const totalShares = input.splits.reduce((s, x) => s + x.sharePaise, 0);
  if (totalShares !== input.amountPaise) {
    throw new Error(`split shares (${totalShares}) do not sum to amount (${input.amountPaise})`);
  }

  // better-sqlite3's drizzle adapter runs transactions synchronously and rejects
  // async callbacks ("Transaction function cannot return a promise"). We use a
  // sync callback and the synchronous query terminators (.all() / .run()).
  return db.transaction((tx: AnyDb) => {
    const inserted = tx.insert(schema.expenses).values({
      groupId: input.groupId,
      paidByUserId: input.paidByUserId,
      amountPaise: input.amountPaise,
      description: input.description,
      source: input.source,
      draftId: input.draftId,
      createdAt: new Date(),
    }).returning({ id: schema.expenses.id }).all();

    const expenseId = inserted[0]!.id as number;

    tx.insert(schema.splits).values(
      input.splits.map((s) => ({
        expenseId,
        userId: s.userId,
        sharePaise: s.sharePaise,
        settledAt: null,
      })),
    ).run();

    return expenseId;
  });
}

export async function listExpenses(db: AnyDb, groupId: string): Promise<Expense[]> {
  const rows = await db.select().from(schema.expenses)
    .where(eq(schema.expenses.groupId, groupId))
    .orderBy(desc(schema.expenses.createdAt));
  return rows.map((r: any) => ({
    id: r.id,
    groupId: r.groupId,
    paidByUserId: r.paidByUserId,
    amountPaise: r.amountPaise,
    description: r.description,
    source: r.source,
    draftId: r.draftId,
    createdAt: r.createdAt,
  }));
}

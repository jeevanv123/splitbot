import { eq, and, desc } from "drizzle-orm";
import * as schema from "./schema.js";
import type { Bill, BillDraft } from "../types/domain.js";

type AnyDb = { select: any; insert: any; update: any };

export interface CreateDraftInput {
  groupId: string;
  uploaderId: string;
  bill: Bill;
  imagePath: string | null;
}

export async function createDraft(db: AnyDb, input: CreateDraftInput): Promise<number> {
  const inserted = await db.insert(schema.billDrafts).values({
    groupId: input.groupId,
    uploaderId: input.uploaderId,
    itemsJson: JSON.stringify(input.bill),
    imagePath: input.imagePath,
    status: "pending",
    createdAt: new Date(),
    assignedAt: null,
    expenseId: null,
  }).returning({ id: schema.billDrafts.id });
  return inserted[0]!.id as number;
}

function rowToDraft(r: any): BillDraft {
  return {
    id: r.id,
    groupId: r.groupId,
    uploaderId: r.uploaderId,
    bill: JSON.parse(r.itemsJson) as Bill,
    imagePath: r.imagePath,
    status: r.status,
    createdAt: r.createdAt,
    assignedAt: r.assignedAt,
    expenseId: r.expenseId,
  };
}

export async function listPendingDraftsForUser(db: AnyDb, groupId: string, uploaderId: string): Promise<BillDraft[]> {
  const rows = await db.select().from(schema.billDrafts)
    .where(and(
      eq(schema.billDrafts.groupId, groupId),
      eq(schema.billDrafts.uploaderId, uploaderId),
      eq(schema.billDrafts.status, "pending"),
    ))
    .orderBy(desc(schema.billDrafts.createdAt));
  return rows.map(rowToDraft);
}

export async function listPendingDraftsInGroup(db: AnyDb, groupId: string): Promise<BillDraft[]> {
  const rows = await db.select().from(schema.billDrafts)
    .where(and(eq(schema.billDrafts.groupId, groupId), eq(schema.billDrafts.status, "pending")))
    .orderBy(desc(schema.billDrafts.createdAt));
  return rows.map(rowToDraft);
}

export async function markDraftAssigned(db: AnyDb, id: number, expenseId: number): Promise<void> {
  await db.update(schema.billDrafts)
    .set({ status: "assigned", assignedAt: new Date(), expenseId })
    .where(eq(schema.billDrafts.id, id));
}

export async function markDraftCancelled(db: AnyDb, id: number): Promise<void> {
  await db.update(schema.billDrafts)
    .set({ status: "cancelled" })
    .where(eq(schema.billDrafts.id, id));
}

import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import type { Group } from "../types/domain.js";

type AnyDb = { select: any; insert: any; update: any };

export interface UpsertGroupInput { id: string; name: string }

export async function upsertGroup(db: AnyDb, input: UpsertGroupInput): Promise<void> {
  const existing = await db.select().from(schema.groups).where(eq(schema.groups.id, input.id)).limit(1);
  if (existing.length > 0) {
    // Only update mutable fields here (name). Currency is managed via setGroupCurrency
    // so we never clobber a user-chosen currency on a routine upsert.
    await db.update(schema.groups).set({ name: input.name }).where(eq(schema.groups.id, input.id));
    return;
  }
  // New group: rely on schema default ("INR") for currency.
  // `currency` is intentionally omitted; schema default ("INR") fires.
  await db.insert(schema.groups).values({ id: input.id, name: input.name, createdAt: new Date() });
}

export async function getGroup(db: AnyDb, id: string): Promise<Group | undefined> {
  const rows = await db.select().from(schema.groups).where(eq(schema.groups.id, id)).limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return { id: r.id, name: r.name, currency: r.currency ?? "INR", createdAt: r.createdAt };
}

export async function setGroupCurrency(db: AnyDb, id: string, currency: string): Promise<void> {
  await db.update(schema.groups).set({ currency }).where(eq(schema.groups.id, id));
}

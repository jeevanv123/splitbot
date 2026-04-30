import { eq } from "drizzle-orm";
import * as schema from "./schema.js";
import type { User } from "../types/domain.js";

type AnyDb = { select: any; insert: any; update: any };

export interface UpsertUserInput {
  id: string;
  displayName: string;
}

export async function upsertUser(db: AnyDb, input: UpsertUserInput): Promise<void> {
  const existing = await db.select().from(schema.users).where(eq(schema.users.id, input.id)).limit(1);
  if (existing.length > 0) {
    await db.update(schema.users)
      .set({ displayName: input.displayName })
      .where(eq(schema.users.id, input.id));
    return;
  }
  await db.insert(schema.users).values({
    id: input.id,
    displayName: input.displayName,
    upiId: null,
    createdAt: new Date(),
  });
}

export async function getUser(db: AnyDb, id: string): Promise<User | undefined> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  const r = rows[0];
  if (!r) return undefined;
  return { id: r.id, displayName: r.displayName, upiId: r.upiId, createdAt: r.createdAt };
}

export async function setUpi(db: AnyDb, id: string, upiId: string): Promise<void> {
  await db.update(schema.users).set({ upiId }).where(eq(schema.users.id, id));
}

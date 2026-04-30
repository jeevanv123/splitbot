import { eq, and } from "drizzle-orm";
import * as schema from "./schema.js";

type AnyDb = { select: any; insert: any; update: any };

export interface GroupMember {
  userId: string;
  displayName: string;
  lastSeenAt: Date;
}

export async function recordGroupMember(db: AnyDb, groupId: string, userId: string): Promise<void> {
  const existing = await db.select().from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(schema.groupMembers)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId)));
    return;
  }
  await db.insert(schema.groupMembers).values({
    groupId, userId, lastSeenAt: new Date(),
  });
}

export async function listGroupMembers(db: AnyDb, groupId: string): Promise<GroupMember[]> {
  // Join with users to get displayName
  const rows = await db.select({
    userId: schema.groupMembers.userId,
    displayName: schema.users.displayName,
    lastSeenAt: schema.groupMembers.lastSeenAt,
  })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
    .where(eq(schema.groupMembers.groupId, groupId));
  return rows.map((r: any) => ({
    userId: r.userId,
    displayName: r.displayName,
    lastSeenAt: r.lastSeenAt,
  }));
}

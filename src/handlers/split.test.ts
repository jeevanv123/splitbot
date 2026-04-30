import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { handleSplit } from "./split.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

describe("handleSplit", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "a", displayName: "Anu" });
    await upsertUser(db, { id: "b", displayName: "Beta" });
    await upsertUser(db, { id: "c", displayName: "Cee" });
  });

  it("splits with explicit `with` list", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      model: "test-model",
      msg: { kind: "text", groupId: "g1", senderId: "a", senderDisplayName: "Anu", text: "/split 600 cab with @b @c", receivedAt: new Date(), rawId: "1" },
      groupMembers: [
        { userId: "a", displayName: "Anu" },
        { userId: "b", displayName: "Beta" },
        { userId: "c", displayName: "Cee" },
      ],
    };
    const replies = await handleSplit(ctx, {
      command: "split", amountPaise: 60000, description: "cab",
      withMentions: ["b", "c"], exceptMentions: [],
    });
    expect(replies).toHaveLength(1);
    expect(replies[0]!.text).toContain("Anu paid ₹600");
    expect(replies[0]!.text).toContain("₹200");
  });

  it("splits across all group members when no `with` and no `except`", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      model: "test-model",
      msg: { kind: "text", groupId: "g1", senderId: "a", senderDisplayName: "Anu", text: "/split 300 chai", receivedAt: new Date(), rawId: "1" },
      groupMembers: [
        { userId: "a", displayName: "Anu" },
        { userId: "b", displayName: "Beta" },
        { userId: "c", displayName: "Cee" },
      ],
    };
    const replies = await handleSplit(ctx, {
      command: "split", amountPaise: 30000, description: "chai",
      withMentions: [], exceptMentions: [],
    });
    expect(replies[0]!.text).toContain("₹100");
  });

  it("excludes participants listed in `except`", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      model: "test-model",
      msg: { kind: "text", groupId: "g1", senderId: "a", senderDisplayName: "Anu", text: "/split 200 except @c", receivedAt: new Date(), rawId: "1" },
      groupMembers: [
        { userId: "a", displayName: "Anu" },
        { userId: "b", displayName: "Beta" },
        { userId: "c", displayName: "Cee" },
      ],
    };
    const replies = await handleSplit(ctx, {
      command: "split", amountPaise: 20000, description: "x",
      withMentions: [], exceptMentions: ["c"],
    });
    expect(replies[0]!.text).toContain("₹100");
    expect(replies[0]!.text).not.toContain("Cee");
  });

  it("rejects DM (no group)", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: { messages: { create: vi.fn() } },
      model: "test-model",
      msg: { kind: "text", groupId: null, senderId: "a", senderDisplayName: "Anu", text: "/split 100 x", receivedAt: new Date(), rawId: "1" },
      groupMembers: [],
    };
    const replies = await handleSplit(ctx, {
      command: "split", amountPaise: 10000, description: "x",
      withMentions: [], exceptMentions: [],
    });
    expect(replies[0]!.text).toMatch(/group/i);
  });
});

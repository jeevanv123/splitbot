import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { createDraft, listPendingDraftsForUser } from "../repo/drafts.js";
import { handleFreeText } from "./freeText.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

function llmSequence(...responses: string[]) {
  let i = 0;
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: responses[i++] ?? "{}" }],
      })),
    },
  };
}

describe("handleFreeText", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
    await upsertUser(db, { id: "+b", displayName: "Beta" });
  });

  it("returns empty when no pending drafts for user", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: llmSequence() as any,
      model: "test-model",
      msg: { kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "hello", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }],
    };
    const replies = await handleFreeText(ctx);
    expect(replies).toHaveLength(0);
  });

  it("auto-assigns to the only pending draft and creates expense", async () => {
    await createDraft(db as any, {
      groupId: "g1", uploaderId: "+a",
      bill: { items: [{ name: "pasta", pricePaise: 62000 }], taxPaise: 0, tipPaise: 0, totalPaise: 62000, currency: "INR" },
      imagePath: null,
    });
    const assignmentJson = JSON.stringify({
      assignments: [
        { user_id: "+a", share_paise: 31000 },
        { user_id: "+b", share_paise: 31000 },
      ],
    });
    const ctx: HandlerContext = {
      db: db as any,
      llm: llmSequence(assignmentJson) as any,
      model: "test-model",
      msg: { kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "split equally", receivedAt: new Date(), rawId: "1" },
      groupMembers: [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }],
    };
    const replies = await handleFreeText(ctx);
    expect(replies[0]!.text).toMatch(/split done/i);
    expect(await listPendingDraftsForUser(db as any, "g1", "+a")).toHaveLength(0);
  });
});

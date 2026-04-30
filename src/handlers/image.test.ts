import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup } from "../repo/groups.js";
import { listPendingDraftsInGroup } from "../repo/drafts.js";
import { handleImage } from "./image.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

function llmReturning(text: string) {
  return { messages: { create: vi.fn(async () => ({ content: [{ type: "text", text }] })) } };
}

describe("handleImage", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(async () => {
    db = makeTestDb();
    await upsertGroup(db, { id: "g1", name: "G" });
    await upsertUser(db, { id: "+a", displayName: "Anu" });
  });

  it("creates a pending draft and replies with summary on a valid bill", async () => {
    const billJson = JSON.stringify({
      is_bill: true,
      items: [{ name: "pasta", price_paise: 62000 }],
      tax_paise: 5000, tip_paise: 0, total_paise: 67000, currency: "INR",
    });
    const ctx: HandlerContext = {
      db: db as any,
      llm: llmReturning(billJson) as any,
      msg: {
        kind: "image", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
        text: "", imageBuffer: Buffer.from("fake-jpeg"),
        receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [{ userId: "+a", displayName: "Anu" }],
    };
    const replies = await handleImage(ctx);
    expect(replies[0]!.text).toContain("pasta");
    const drafts = await listPendingDraftsInGroup(db as any, "g1");
    expect(drafts).toHaveLength(1);
  });

  it("does not reply or create a draft when image is not a bill", async () => {
    const notBill = JSON.stringify({ is_bill: false, reason: "meme" });
    const ctx: HandlerContext = {
      db: db as any,
      llm: llmReturning(notBill) as any,
      msg: {
        kind: "image", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
        text: "", imageBuffer: Buffer.from("fake"),
        receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [{ userId: "+a", displayName: "Anu" }],
    };
    const replies = await handleImage(ctx);
    expect(replies).toHaveLength(0);
    expect(await listPendingDraftsInGroup(db as any, "g1")).toHaveLength(0);
  });

  it("ignores DM images", async () => {
    const ctx: HandlerContext = {
      db: db as any,
      llm: llmReturning("{}") as any,
      msg: {
        kind: "image", groupId: null, senderId: "+a", senderDisplayName: "Anu",
        text: "", imageBuffer: Buffer.from("fake"),
        receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleImage(ctx);
    expect(replies).toHaveLength(0);
  });
});

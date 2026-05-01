import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../repo/schema.js";
import { upsertGroup, getGroup } from "../repo/groups.js";
import { handleCurrency } from "./currency.js";
import type { HandlerContext } from "./context.js";

function makeTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

const llm = { messages: { create: vi.fn() } };

function ctxFor(db: any, opts: { groupId: string | null }): HandlerContext {
  return {
    db,
    llm,
    model: "test-model",
    msg: {
      kind: "text",
      groupId: opts.groupId,
      senderId: "+a",
      senderDisplayName: "Anu",
      text: "/currency",
      receivedAt: new Date(),
      rawId: "1",
    },
    groupMembers: [],
  };
}

describe("handleCurrency", () => {
  let db: ReturnType<typeof makeTestDb>;
  beforeEach(() => { db = makeTestDb(); });

  it("DM hint when not in a group", async () => {
    const ctx = ctxFor(db, { groupId: null });
    const replies = await handleCurrency(ctx, { command: "currency", code: null });
    expect(replies[0]!.to).toBe("+a");
    expect(replies[0]!.text).toMatch(/inside a group/i);
  });

  it("shows current currency (default INR) with code=null", async () => {
    await upsertGroup(db, { id: "g1", name: "G" });
    const ctx = ctxFor(db, { groupId: "g1" });
    const replies = await handleCurrency(ctx, { command: "currency", code: null });
    expect(replies[0]!.to).toBe("g1");
    expect(replies[0]!.text).toMatch(/Current group currency: INR/);
  });

  it("sets group currency and persists it", async () => {
    await upsertGroup(db, { id: "g1", name: "G" });
    const ctx = ctxFor(db, { groupId: "g1" });
    const replies = await handleCurrency(ctx, { command: "currency", code: "USD" });
    expect(replies[0]!.text).toMatch(/✅.*USD/);
    const g = await getGroup(db as any, "g1");
    expect(g?.currency).toBe("USD");
  });

  it("creates the group on the fly if missing", async () => {
    const ctx = ctxFor(db, { groupId: "g-new" });
    const replies = await handleCurrency(ctx, { command: "currency", code: "EUR" });
    expect(replies[0]!.text).toMatch(/EUR/);
    const g = await getGroup(db as any, "g-new");
    expect(g?.currency).toBe("EUR");
  });
});

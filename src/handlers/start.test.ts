import { describe, it, expect, vi } from "vitest";
import { handleStart } from "./start.js";
import type { HandlerContext } from "./context.js";

const llm = { messages: { create: vi.fn() } };

describe("handleStart", () => {
  it("DMs the intro when no group is set", async () => {
    const ctx: HandlerContext = {
      db: {} as any,
      llm,
      model: "test-model",
      msg: {
        kind: "text", groupId: null, senderId: "+a", senderDisplayName: "Anu",
        text: "/start", receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleStart(ctx);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.to).toBe("+a");
    expect(replies[0]!.text).toMatch(/Splitbot/);
    expect(replies[0]!.text).toMatch(/\/split/);
    expect(replies[0]!.text).toMatch(/\/history/);
  });

  it("replies in the group when invoked there", async () => {
    const ctx: HandlerContext = {
      db: {} as any,
      llm,
      model: "test-model",
      msg: {
        kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
        text: "/start", receivedAt: new Date(), rawId: "1",
      },
      groupMembers: [],
    };
    const replies = await handleStart(ctx);
    expect(replies[0]!.to).toBe("g1");
    expect(replies[0]!.replyToRawId).toBe("1");
  });
});

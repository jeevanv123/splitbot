import { describe, it, expect, vi } from "vitest";
import { route } from "./index.js";
import type { HandlerContext } from "../handlers/context.js";

const baseCtx = (text: string, kind: "text" | "image" = "text"): HandlerContext => ({
  db: {} as any,
  llm: { messages: { create: vi.fn() } } as any,
  model: "test-model",
  msg: {
    kind, groupId: "g1", senderId: "+a", senderDisplayName: "Anu",
    text, receivedAt: new Date(), rawId: "1",
    ...(kind === "image" ? { imageBuffer: Buffer.from("x") } : {}),
  },
  groupMembers: [],
});

describe("route", () => {
  it("routes images to image handler", async () => {
    expect(route(baseCtx("", "image")).name).toBe("handleImage");
  });

  it("routes /split to split handler", async () => {
    const r = route(baseCtx("/split 100 x"));
    expect(r.name).toBe("handleSplit");
  });

  it("routes free-text to freeText handler", async () => {
    expect(route(baseCtx("anu had pasta")).name).toBe("handleFreeText");
  });

  it("routes invalid slash to a help reply", async () => {
    const r = route(baseCtx("/foobar"));
    expect(r.name).toBe("handleInvalid");
  });

  it("routes /help correctly", async () => {
    expect(route(baseCtx("/help")).name).toBe("handleHelp");
  });

  it("routes /reset to reset handler", async () => {
    expect(route(baseCtx("/reset")).name).toBe("handleReset");
  });

  it("routes /start to start handler", async () => {
    expect(route(baseCtx("/start")).name).toBe("handleStart");
  });

  it("routes /history to history handler", async () => {
    expect(route(baseCtx("/history")).name).toBe("handleHistory");
  });
});

import { describe, it, expect, vi } from "vitest";
import { resolveDraft, type AnthropicLike } from "./resolveDraft.js";

function fakeClient(text: string): AnthropicLike {
  return { messages: { create: vi.fn(async () => ({ content: [{ type: "text", text }] })) } };
}

const drafts = [
  { id: 12, total: "₹2,840", date: "Friday", topItems: ["pasta", "pizza", "wine"] },
  { id: 15, total: "₹1,200", date: "Saturday", topItems: ["cab"] },
];

describe("resolveDraft", () => {
  it("returns high-confidence pick when item matches uniquely", async () => {
    const json = JSON.stringify({ draft_id: 12, confidence: "high", reason: "pasta only on draft 12" });
    const result = await resolveDraft(fakeClient(json), {
      message: "Anu had pasta",
      drafts,
    });
    expect(result.kind).toBe("pick");
    if (result.kind === "pick") {
      expect(result.draftId).toBe(12);
      expect(result.confidence).toBe("high");
    }
  });

  it("returns low-confidence pick", async () => {
    const json = JSON.stringify({ draft_id: 12, confidence: "low", reason: "could be either" });
    const result = await resolveDraft(fakeClient(json), { message: "split it", drafts });
    expect(result.kind).toBe("pick");
    if (result.kind === "pick") expect(result.confidence).toBe("low");
  });

  it("returns ambiguous when LLM declines to pick", async () => {
    const json = JSON.stringify({ draft_id: null, confidence: "ambiguous", reason: "no signal" });
    const result = await resolveDraft(fakeClient(json), { message: "go", drafts });
    expect(result.kind).toBe("ambiguous");
  });

  it("returns error on malformed JSON", async () => {
    const result = await resolveDraft(fakeClient("nope"), { message: "x", drafts });
    expect(result.kind).toBe("error");
  });
});

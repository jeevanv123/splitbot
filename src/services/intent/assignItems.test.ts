import { describe, it, expect, vi } from "vitest";
import { assignItems, type AnthropicLike } from "./assignItems.js";

function fakeClient(text: string): AnthropicLike {
  return { messages: { create: vi.fn(async () => ({ content: [{ type: "text", text }] })) } };
}

const bill = {
  items: [
    { name: "pasta", pricePaise: 62000 },
    { name: "pizza", pricePaise: 78000 },
    { name: "wine", pricePaise: 90000 },
  ],
  taxPaise: 30000,
  tipPaise: 0,
  totalPaise: 260000,
  currency: "INR",
};

const participants = [
  { userId: "+a", displayName: "Anu" },
  { userId: "+r", displayName: "Rohit" },
  { userId: "+j", displayName: "Jeevan" },
];

describe("assignItems", () => {
  it("returns assignments that sum to bill total", async () => {
    const json = JSON.stringify({
      assignments: [
        { user_id: "+a", share_paise: 152000 },  // pasta + wine + tax share
        { user_id: "+r", share_paise: 78000 },
        { user_id: "+j", share_paise: 30000 },
      ],
    });
    const result = await assignItems(fakeClient(json), {
      bill,
      participants,
      assignmentText: "Anu had pasta and wine, Rohit had pizza, Jeevan only had tax",
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      const total = result.assignments.reduce((s, a) => s + a.sharePaise, 0);
      expect(total).toBe(260000);
    }
  });

  it("returns error when shares do not sum to total", async () => {
    const json = JSON.stringify({
      assignments: [{ user_id: "+a", share_paise: 100000 }],
    });
    const result = await assignItems(fakeClient(json), {
      bill, participants, assignmentText: "anything",
    });
    expect(result.kind).toBe("error");
  });

  it("returns error on malformed JSON", async () => {
    const result = await assignItems(fakeClient("not json"), {
      bill, participants, assignmentText: "anything",
    });
    expect(result.kind).toBe("error");
  });
});

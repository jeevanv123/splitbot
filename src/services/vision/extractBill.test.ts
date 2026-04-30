import { describe, it, expect, vi } from "vitest";
import { extractBill, type AnthropicLike } from "./extractBill.js";

function fakeClient(responseText: string): AnthropicLike {
  return {
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: "text", text: responseText }],
      })),
    },
  };
}

describe("extractBill", () => {
  it("parses a valid bill JSON", async () => {
    const json = JSON.stringify({
      is_bill: true,
      items: [{ name: "pasta", price_paise: 62000 }],
      tax_paise: 5000,
      tip_paise: 0,
      total_paise: 67000,
      currency: "INR",
    });
    const out = await extractBill(fakeClient(json), Buffer.from("img"), "image/jpeg");
    expect(out.kind).toBe("bill");
    if (out.kind === "bill") {
      expect(out.bill.items[0]!.name).toBe("pasta");
      expect(out.bill.totalPaise).toBe(67000);
    }
  });

  it("returns not-a-bill when is_bill is false", async () => {
    const json = JSON.stringify({ is_bill: false, reason: "this is a meme" });
    const out = await extractBill(fakeClient(json), Buffer.from("img"), "image/jpeg");
    expect(out.kind).toBe("not_a_bill");
  });

  it("returns error when JSON is malformed", async () => {
    const out = await extractBill(fakeClient("not json at all"), Buffer.from("img"), "image/jpeg");
    expect(out.kind).toBe("error");
  });

  it("returns error when total <= 0 even if is_bill true", async () => {
    const json = JSON.stringify({
      is_bill: true,
      items: [],
      tax_paise: 0,
      tip_paise: 0,
      total_paise: 0,
      currency: "INR",
    });
    const out = await extractBill(fakeClient(json), Buffer.from("img"), "image/jpeg");
    expect(out.kind).toBe("error");
  });
});

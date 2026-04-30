import type { Bill } from "../../types/domain.js";

export interface AnthropicLike {
  messages: {
    create: (args: any) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export type ExtractBillResult =
  | { kind: "bill"; bill: Bill }
  | { kind: "not_a_bill"; reason: string }
  | { kind: "error"; reason: string };

const SYSTEM_PROMPT = `You extract bill/receipt data from images.

Return ONLY valid JSON, no other text. Schema:
{
  "is_bill": boolean,
  "reason": string (required if is_bill=false),
  "items": [{ "name": string, "price_paise": integer }],
  "tax_paise": integer,
  "tip_paise": integer,
  "total_paise": integer,
  "currency": string  // "INR" if rupees
}

If image is not a bill/receipt (meme, photo, screenshot of chat, etc.), return:
{"is_bill": false, "reason": "<why>"}

Convert all amounts to paise (multiply rupees by 100). If currency unclear, assume INR.`;

export async function extractBill(
  client: AnthropicLike,
  imageBuffer: Buffer,
  mediaType: string,
): Promise<ExtractBillResult> {
  let text = "";
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBuffer.toString("base64") },
          },
          { type: "text", text: "Extract the bill." },
        ],
      }],
    });
    const block = resp.content.find((c) => c.type === "text");
    text = block?.text ?? "";
  } catch (e) {
    return { kind: "error", reason: e instanceof Error ? e.message : String(e) };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "error", reason: "Vision response was not valid JSON." };
  }

  if (parsed.is_bill === false) {
    return { kind: "not_a_bill", reason: parsed.reason ?? "not a bill" };
  }
  if (parsed.is_bill !== true) {
    return { kind: "error", reason: "Missing or invalid is_bill flag." };
  }

  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const totalPaise = Number.isInteger(parsed.total_paise) ? parsed.total_paise : 0;
  if (totalPaise <= 0) {
    return { kind: "error", reason: "Total must be a positive integer (paise)." };
  }

  const bill: Bill = {
    items: items.map((i: any) => ({
      name: String(i.name ?? "item"),
      pricePaise: Number.isInteger(i.price_paise) ? i.price_paise : 0,
    })),
    taxPaise: Number.isInteger(parsed.tax_paise) ? parsed.tax_paise : 0,
    tipPaise: Number.isInteger(parsed.tip_paise) ? parsed.tip_paise : 0,
    totalPaise,
    currency: typeof parsed.currency === "string" ? parsed.currency : "INR",
  };
  return { kind: "bill", bill };
}

import type { Bill, Paise } from "../../types/domain.js";

export interface AnthropicLike {
  messages: {
    create: (args: any) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface AssignItemsInput {
  bill: Bill;
  participants: { userId: string; displayName: string }[];
  assignmentText: string;
}

export interface Assignment { userId: string; sharePaise: Paise }

export type AssignItemsResult =
  | { kind: "ok"; assignments: Assignment[] }
  | { kind: "error"; reason: string };

const SYSTEM = `You split bills among people based on natural-language assignments.

Input:
  - bill: list of items with prices in paise, plus tax and tip
  - participants: list of users with userId and displayName
  - assignment_text: free-form text describing who had what

Rules:
  - Distribute tax and tip proportionally to each person's pre-tax/tip share.
  - "Everything else" / "the rest" means items not assigned to others.
  - "Split equally" / "share" means split that item among named people.
  - All amounts must be integer paise. Sum of all share_paise must EXACTLY equal bill.total_paise.

Return ONLY valid JSON:
{ "assignments": [ {"user_id": string, "share_paise": integer}, ... ] }`;

export async function assignItems(
  client: AnthropicLike,
  input: AssignItemsInput,
): Promise<AssignItemsResult> {
  let text = "";
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: JSON.stringify({
            bill: input.bill,
            participants: input.participants,
            assignment_text: input.assignmentText,
          }),
        }],
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
    return { kind: "error", reason: "Intent response was not valid JSON." };
  }

  if (!Array.isArray(parsed.assignments)) {
    return { kind: "error", reason: "Missing assignments array." };
  }
  const assignments: Assignment[] = parsed.assignments.map((a: any) => ({
    userId: String(a.user_id),
    sharePaise: Number.isInteger(a.share_paise) ? a.share_paise : 0,
  }));
  const total = assignments.reduce((s, a) => s + a.sharePaise, 0);
  if (total !== input.bill.totalPaise) {
    return { kind: "error", reason: `Shares sum to ${total}; expected ${input.bill.totalPaise}.` };
  }
  return { kind: "ok", assignments };
}

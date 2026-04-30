export interface AnthropicLike {
  messages: {
    create: (args: any) => Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

export interface DraftSummary {
  id: number;
  total: string;
  date: string;            // human-readable, e.g. "Friday" or "2 days ago"
  topItems: string[];
}

export interface ResolveInput {
  message: string;
  drafts: DraftSummary[];
}

export type ResolveResult =
  | { kind: "pick"; draftId: number; confidence: "high" | "low"; reason: string }
  | { kind: "ambiguous"; reason: string }
  | { kind: "error"; reason: string };

const SYSTEM = `You decide which pending bill draft a user's message refers to.

Input: list of drafts (with total, date, top items) and a user message.

Decide:
  - If the message contains a clear signal (item name uniquely on one draft, date, "the X one"), pick high confidence.
  - If it leans toward one but isn't certain, pick low confidence.
  - If genuinely ambiguous, return draft_id: null with confidence "ambiguous".

Return ONLY valid JSON:
{ "draft_id": number | null, "confidence": "high" | "low" | "ambiguous", "reason": string }`;

export async function resolveDraft(
  client: AnthropicLike,
  input: ResolveInput,
  model: string,
): Promise<ResolveResult> {
  let text = "";
  try {
    const resp = await client.messages.create({
      model,
      max_tokens: 256,
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [{ type: "text", text: JSON.stringify(input) }],
      }],
    });
    const block = resp.content.find((c) => c.type === "text");
    text = block?.text ?? "";
  } catch (e) {
    return { kind: "error", reason: e instanceof Error ? e.message : String(e) };
  }

  let parsed: any;
  try { parsed = JSON.parse(text); } catch { return { kind: "error", reason: "Resolver response was not valid JSON." }; }

  if (parsed.confidence === "ambiguous" || parsed.draft_id === null) {
    return { kind: "ambiguous", reason: String(parsed.reason ?? "ambiguous") };
  }
  if ((parsed.confidence !== "high" && parsed.confidence !== "low") || !Number.isInteger(parsed.draft_id)) {
    return { kind: "error", reason: "Resolver returned invalid fields." };
  }
  return {
    kind: "pick",
    draftId: parsed.draft_id,
    confidence: parsed.confidence,
    reason: String(parsed.reason ?? ""),
  };
}

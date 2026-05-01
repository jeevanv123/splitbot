import type { HandlerContext, HandlerResult } from "./context.js";
import { extractBill } from "../services/vision/extractBill.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup, getGroup } from "../repo/groups.js";
import { createDraft } from "../repo/drafts.js";
import { formatMoney } from "../utils/money.js";

export async function handleImage(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId || ctx.msg.kind !== "image" || !ctx.msg.imageBuffer) return [];
  if (ctx.msg.imageBuffer.byteLength > 5 * 1024 * 1024) {
    return [{ to: ctx.msg.groupId, text: "Image too large (>5MB).", replyToRawId: ctx.msg.rawId }];
  }

  const result = await extractBill(ctx.llm, ctx.msg.imageBuffer, "image/jpeg", ctx.model);
  if (result.kind === "not_a_bill") {
    return [];   // silent
  }
  if (result.kind === "error") {
    return [{
      to: ctx.msg.groupId,
      text: "Couldn't read this bill — try a clearer photo, or use /split <amount> <desc>.",
      replyToRawId: ctx.msg.rawId,
    }];
  }

  await upsertGroup(ctx.db as any, { id: ctx.msg.groupId, name: "Group" });
  await upsertUser(ctx.db as any, { id: ctx.msg.senderId, displayName: ctx.msg.senderDisplayName });

  // Vision result may carry its own currency from the bill; we deliberately use the
  // GROUP currency for storage/display so amounts in the message match what /balance
  // and /history will later show. (Future: prompt-correct mismatches.)
  const group = await getGroup(ctx.db as any, ctx.msg.groupId);
  const currency = group?.currency ?? "INR";

  const draftId = await createDraft(ctx.db as any, {
    groupId: ctx.msg.groupId,
    uploaderId: ctx.msg.senderId,
    bill: result.bill,
    imagePath: null,
  });

  const items = result.bill.items.map((i) => `${i.name} ${formatMoney(i.pricePaise, currency)}`).join(", ");
  return [{
    to: ctx.msg.groupId,
    text: `📋 I see ${formatMoney(result.bill.totalPaise, currency)} — ${items}.\nReply when you're ready: "who had what?"`,
    replyToRawId: ctx.msg.rawId,
    keyboard: [[{ text: "Split equally", callbackData: `equal:${draftId}` }]],
  }];
}

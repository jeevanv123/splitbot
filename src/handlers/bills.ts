import type { HandlerContext, HandlerResult } from "./context.js";
import { listPendingDraftsInGroup } from "../repo/drafts.js";
import { getGroup } from "../repo/groups.js";
import { formatMoney } from "../utils/money.js";

export async function handleBills(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /bills inside a group." }];
  }
  const drafts = await listPendingDraftsInGroup(ctx.db as any, ctx.msg.groupId);
  if (drafts.length === 0) {
    return [{ to: ctx.msg.groupId, text: "No pending bills in this group.", replyToRawId: ctx.msg.rawId }];
  }
  const group = await getGroup(ctx.db as any, ctx.msg.groupId);
  const currency = group?.currency ?? "INR";
  const lines = ["📋 Pending bills:"];
  for (const d of drafts) {
    const items = d.bill.items.map((i) => i.name).slice(0, 3).join(", ");
    lines.push(`• ${formatMoney(d.bill.totalPaise, currency)} — ${items}${d.bill.items.length > 3 ? "…" : ""}`);
  }
  return [{ to: ctx.msg.groupId, text: lines.join("\n"), replyToRawId: ctx.msg.rawId }];
}

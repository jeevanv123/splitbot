import type { HandlerContext, HandlerResult } from "./context.js";
import { listPendingDraftsInGroup } from "../repo/drafts.js";

function rupees(p: number): string {
  return `₹${(p / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export async function handleBills(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /bills inside a group." }];
  }
  const drafts = await listPendingDraftsInGroup(ctx.db as any, ctx.msg.groupId);
  if (drafts.length === 0) {
    return [{ to: ctx.msg.groupId, text: "No pending bills in this group.", replyToRawId: ctx.msg.rawId }];
  }
  const lines = ["📋 Pending bills:"];
  for (const d of drafts) {
    const items = d.bill.items.map((i) => i.name).slice(0, 3).join(", ");
    lines.push(`• ${rupees(d.bill.totalPaise)} — ${items}${d.bill.items.length > 3 ? "…" : ""}`);
  }
  return [{ to: ctx.msg.groupId, text: lines.join("\n"), replyToRawId: ctx.msg.rawId }];
}

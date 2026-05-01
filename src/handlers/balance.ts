import type { HandlerContext, HandlerResult } from "./context.js";
import { netBalances } from "../repo/splits.js";
import { getUser } from "../repo/users.js";
import { simplify } from "../services/split/simplify.js";

function rupees(paise: number): string {
  const r = (paise / 100).toFixed(2).replace(/\.00$/, "");
  return `₹${r}`;
}

export async function handleBalance(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /balance inside a group." }];
  }

  const balances = await netBalances(ctx.db as any, ctx.msg.groupId);
  const nonZero = balances.filter((b) => b.netPaise !== 0);

  if (nonZero.length === 0) {
    return [{
      to: ctx.msg.groupId,
      text: "✅ Everyone in this group is settled up.",
      replyToRawId: ctx.msg.rawId,
    }];
  }

  // Resolve display names for each user (group_members has them, but we go through getUser
  // which is already loaded into the codebase and consistent across handlers).
  const lines: string[] = ["📊 Balances in this group:"];
  // Sort: creditors first (descending net), then debtors (descending magnitude)
  const sorted = [...nonZero].sort((a, b) => b.netPaise - a.netPaise);
  for (const b of sorted) {
    const u = await getUser(ctx.db as any, b.userId);
    const name = u?.displayName ?? b.userId;
    if (b.netPaise > 0) {
      lines.push(`• ${name} is owed ${rupees(b.netPaise)}`);
    } else {
      lines.push(`• ${name} owes ${rupees(-b.netPaise)}`);
    }
  }

  const settlements = simplify(nonZero);
  if (settlements.length > 0) {
    lines.push("");
    lines.push("To settle:");
    for (const s of settlements) {
      const from = await getUser(ctx.db as any, s.fromUserId);
      const to = await getUser(ctx.db as any, s.toUserId);
      const fromName = from?.displayName ?? s.fromUserId;
      const toName = to?.displayName ?? s.toUserId;
      lines.push(`• ${fromName} → ${toName}: ${rupees(s.amountPaise)}`);
    }
  }

  lines.push("");
  lines.push("Tap /settle in DM with me to get UPI links for what you owe.");

  return [{
    to: ctx.msg.groupId,
    text: lines.join("\n"),
    replyToRawId: ctx.msg.rawId,
  }];
}

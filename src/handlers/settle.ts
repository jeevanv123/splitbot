import type { HandlerContext, HandlerResult } from "./context.js";
import { netBalances } from "../repo/splits.js";
import { simplify } from "../services/split/simplify.js";
import { getUser } from "../repo/users.js";
import { buildUpiLink } from "../upi/buildLink.js";

function rupees(paise: number): string {
  const r = (paise / 100).toFixed(2).replace(/\.00$/, "");
  return `₹${r}`;
}

export async function handleSettle(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /settle inside a group." }];
  }
  const balances = await netBalances(ctx.db as any, ctx.msg.groupId);
  const settlements = simplify(balances);

  const myDebts = settlements.filter((s) => s.fromUserId === ctx.msg.senderId);
  const myCredits = settlements.filter((s) => s.toUserId === ctx.msg.senderId);

  if (myDebts.length === 0 && myCredits.length === 0) {
    return [{ to: ctx.msg.senderId, text: "✅ You're all settled up." }];
  }

  const lines: string[] = [];
  if (myDebts.length > 0) {
    lines.push("You owe:");
    for (const d of myDebts) {
      const creditor = await getUser(ctx.db as any, d.toUserId);
      if (creditor?.upiId) {
        const link = buildUpiLink({ pa: creditor.upiId, amPaise: d.amountPaise, tn: "Splitbot" });
        lines.push(`• ${rupees(d.amountPaise)} to ${creditor.displayName} — ${link}`);
      } else {
        lines.push(`• ${rupees(d.amountPaise)} to ${creditor?.displayName ?? d.toUserId} — (no UPI; ask them to /upi)`);
      }
    }
  }
  if (myCredits.length > 0) {
    lines.push("Owed to you:");
    for (const c of myCredits) {
      const debtor = await getUser(ctx.db as any, c.fromUserId);
      lines.push(`• ${rupees(c.amountPaise)} from ${debtor?.displayName ?? c.fromUserId}`);
    }
    lines.push("(Once they pay, send /paid @them <amount> to mark settled.)");
  }

  return [{ to: ctx.msg.senderId, text: lines.join("\n") }];
}

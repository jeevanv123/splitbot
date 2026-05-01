import type { HandlerContext, HandlerResult } from "./context.js";
import type { InlineKeyboardButton } from "../types/messages.js";
import { netBalances } from "../repo/splits.js";
import { simplify } from "../services/split/simplify.js";
import { getUser } from "../repo/users.js";
import { buildUpiLink } from "../upi/buildLink.js";

function rupees(paise: number): string {
  const r = (paise / 100).toFixed(2).replace(/\.00$/, "");
  return `₹${r}`;
}

// NOTE on URL buttons + UPI deep-links: Telegram inline-keyboard `url` buttons
// open `upi://pay?...` reliably in Telegram for Android (where most Indian users
// are). On iOS, Telegram historically has been stricter about non-https URL
// buttons; tap behavior may not auto-launch the UPI app. As a fallback we ALSO
// keep the raw `upi://pay?...` link inline in the message text — Telegram
// auto-detects the scheme in plain text and renders it as a tappable link on iOS.
// So: button-tap users get one-tap pay (Android), and text-link users get the
// same affordance (iOS) without any extra UX cost.
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
  const keyboard: InlineKeyboardButton[][] = [];

  if (myDebts.length > 0) {
    lines.push("You owe:");
    for (const d of myDebts) {
      const creditor = await getUser(ctx.db as any, d.toUserId);
      const creditorName = creditor?.displayName ?? d.toUserId;
      if (creditor?.upiId) {
        const link = buildUpiLink({ pa: creditor.upiId, amPaise: d.amountPaise, tn: "Splitbot" });
        // Inline link in body (works on iOS as a tappable text link), plus a button (works on Android).
        lines.push(`• ${rupees(d.amountPaise)} to ${creditorName} — ${link}`);
        keyboard.push([{
          text: `Pay ${creditorName} ${rupees(d.amountPaise)}`,
          url: link,
        }]);
      } else {
        lines.push(`• ${rupees(d.amountPaise)} to ${creditorName} — (no UPI; ask them to /upi)`);
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

  const out: HandlerResult = [{
    to: ctx.msg.senderId,
    text: lines.join("\n"),
    ...(keyboard.length > 0 ? { keyboard } : {}),
  }];
  return out;
}

import type { HandlerContext, HandlerResult } from "./context.js";
import type { InlineKeyboardButton } from "../types/messages.js";
import { listExpenses } from "../repo/expenses.js";
import { getUser } from "../repo/users.js";

const HISTORY_LIMIT = 10;

function rupees(p: number): string {
  return `₹${(p / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function relativeAgo(then: Date, now: Date): string {
  const ms = now.getTime() - then.getTime();
  const sec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return "just now";
}

// NOTE: /history's per-row delete buttons have NO admin check in v1 — same posture
// as /reset. Anyone in the group can delete an expense. Acceptable for testing /
// personal-use scope; harden before opening to public groups.
export async function handleHistory(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /history inside a group." }];
  }

  const all = await listExpenses(ctx.db as any, ctx.msg.groupId);
  if (all.length === 0) {
    return [{
      to: ctx.msg.groupId,
      text: "No expenses logged yet in this group.",
      replyToRawId: ctx.msg.rawId,
    }];
  }

  const recent = all.slice(0, HISTORY_LIMIT);
  const now = ctx.msg.receivedAt ?? new Date();

  const lines = ["🧾 Recent expenses:"];
  const keyboard: InlineKeyboardButton[][] = [];
  let i = 1;
  for (const e of recent) {
    const payer = await getUser(ctx.db as any, e.paidByUserId);
    const payerName = payer?.displayName ?? e.paidByUserId;
    const desc = e.description?.trim() || "expense";
    lines.push(`${i}. ${rupees(e.amountPaise)} ${desc} — paid by ${payerName}, ${relativeAgo(e.createdAt, now)}`);
    keyboard.push([{
      text: `🗑 Delete #${i} (${rupees(e.amountPaise)})`,
      callbackData: `del:${e.id}`,
    }]);
    i += 1;
  }

  return [{
    to: ctx.msg.groupId,
    text: lines.join("\n"),
    replyToRawId: ctx.msg.rawId,
    keyboard,
  }];
}

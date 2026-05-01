import { inArray } from "drizzle-orm";
import type { HandlerContext, HandlerResult } from "./context.js";
import type { ParsedCommand } from "../parser/slash.js";
import type { InlineKeyboardButton } from "../types/messages.js";
import { listUnsettledSplits, markSplitsSettled, netBalances } from "../repo/splits.js";
import { simplify } from "../services/split/simplify.js";
import { getUser } from "../repo/users.js";
import { getGroup } from "../repo/groups.js";
import * as schema from "../repo/schema.js";
import { formatMoney } from "../utils/money.js";

type PaidCmd = Extract<ParsedCommand, { command: "paid" }>;

export async function handlePaid(ctx: HandlerContext, cmd: PaidCmd): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /paid inside a group." }];
  }

  // No-args case: show interactive menu of debts.
  if (cmd.toUserId === null && cmd.amountPaise === null) {
    return await buildPaidMenu(ctx);
  }

  // Existing full-settle flow: cmd.toUserId and cmd.amountPaise are set.
  return await runPaidSettle(ctx, cmd.toUserId!, cmd.amountPaise!);
}

async function buildPaidMenu(ctx: HandlerContext): Promise<HandlerResult> {
  const balances = await netBalances(ctx.db as any, ctx.msg.groupId!);
  const settlements = simplify(balances);
  const myDebts = settlements.filter((s) => s.fromUserId === ctx.msg.senderId);

  if (myDebts.length === 0) {
    return [{
      to: ctx.msg.groupId!,
      text: "✅ You don't owe anyone in this group.",
      replyToRawId: ctx.msg.rawId,
    }];
  }

  const group = await getGroup(ctx.db as any, ctx.msg.groupId!);
  const currency = group?.currency ?? "INR";

  const rows: InlineKeyboardButton[][] = [];
  for (const d of myDebts) {
    const creditor = await getUser(ctx.db as any, d.toUserId);
    const name = creditor?.displayName ?? d.toUserId;
    rows.push([{
      text: `${name} — ${formatMoney(d.amountPaise, currency)}`,
      callbackData: `paid:${d.toUserId}:${d.amountPaise}`,
    }]);
  }

  return [{
    to: ctx.msg.groupId!,
    text: "💸 Who did you pay?",
    replyToRawId: ctx.msg.rawId,
    keyboard: rows,
  }];
}

async function runPaidSettle(ctx: HandlerContext, toUserId: string, amountPaise: number): Promise<HandlerResult> {
  const unsettled = await listUnsettledSplits(ctx.db as any, ctx.msg.groupId!);
  // Splits where THIS user owes the recipient. We mark splits paid by the recipient's
  // expenses where the sender's share is unsettled, oldest first, until amount is covered.
  const candidates = unsettled.filter((s) => s.userId === ctx.msg.senderId);
  if (candidates.length === 0) {
    return [{ to: ctx.msg.groupId!, text: "Nothing unsettled to mark.", replyToRawId: ctx.msg.rawId }];
  }
  const expenseIds = candidates.map((c) => c.expenseId);
  const expenses = await (ctx.db as any).select().from(schema.expenses).where(inArray(schema.expenses.id, expenseIds));
  const owedToUser = candidates.filter((c) =>
    expenses.find((e: any) => e.id === c.expenseId)?.paidByUserId === toUserId,
  );
  owedToUser.sort((a, b) => a.id - b.id);

  const group = await getGroup(ctx.db as any, ctx.msg.groupId!);
  const currency = group?.currency ?? "INR";

  // Greedy settle: oldest splits first, accumulate as many as fit under the paid amount.
  let actuallySettled = 0;
  const toSettle: number[] = [];
  for (const s of owedToUser) {
    if (s.sharePaise <= amountPaise - actuallySettled) {
      toSettle.push(s.id);
      actuallySettled += s.sharePaise;
    }
  }
  if (toSettle.length === 0) {
    const smallest = owedToUser.reduce<number | null>(
      (min, s) => (min === null || s.sharePaise < min ? s.sharePaise : min),
      null,
    );
    const hint = smallest !== null
      ? ` Smallest unsettled split owed to that user is ${formatMoney(smallest, currency)}.`
      : "";
    return [{
      to: ctx.msg.groupId!,
      text: `Couldn't settle anything with ${formatMoney(amountPaise, currency)}.${hint}`,
      replyToRawId: ctx.msg.rawId,
    }];
  }
  await markSplitsSettled(ctx.db as any, toSettle);
  return [{
    to: ctx.msg.groupId!,
    text: `✅ ${formatMoney(actuallySettled, currency)} marked settled (${toSettle.length} split${toSettle.length === 1 ? "" : "s"}).`,
    replyToRawId: ctx.msg.rawId,
  }];
}

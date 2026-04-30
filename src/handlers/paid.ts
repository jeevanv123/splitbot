import { inArray } from "drizzle-orm";
import type { HandlerContext, HandlerResult } from "./context.js";
import type { ParsedCommand } from "../parser/slash.js";
import { listUnsettledSplits, markSplitsSettled } from "../repo/splits.js";
import * as schema from "../repo/schema.js";

type PaidCmd = Extract<ParsedCommand, { command: "paid" }>;

function rupees(p: number): string {
  return `₹${(p / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export async function handlePaid(ctx: HandlerContext, cmd: PaidCmd): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /paid inside a group." }];
  }
  const unsettled = await listUnsettledSplits(ctx.db as any, ctx.msg.groupId);
  // Splits where THIS user owes the recipient. We mark splits paid by the recipient's
  // expenses where the sender's share is unsettled, oldest first, until amount is covered.
  const candidates = unsettled.filter((s) => s.userId === ctx.msg.senderId);
  if (candidates.length === 0) {
    return [{ to: ctx.msg.groupId, text: "Nothing unsettled to mark.", replyToRawId: ctx.msg.rawId }];
  }
  const expenseIds = candidates.map((c) => c.expenseId);
  const expenses = await (ctx.db as any).select().from(schema.expenses).where(inArray(schema.expenses.id, expenseIds));
  const owedToUser = candidates.filter((c) =>
    expenses.find((e: any) => e.id === c.expenseId)?.paidByUserId === cmd.toUserId,
  );
  owedToUser.sort((a, b) => a.id - b.id);

  // Greedy settle: oldest splits first, accumulate as many as fit under the paid amount.
  let actuallySettled = 0;
  const toSettle: number[] = [];
  for (const s of owedToUser) {
    if (s.sharePaise <= cmd.amountPaise - actuallySettled) {
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
      ? ` Smallest unsettled split owed to that user is ${rupees(smallest)}.`
      : "";
    return [{
      to: ctx.msg.groupId,
      text: `Couldn't settle anything with ${rupees(cmd.amountPaise)}.${hint}`,
      replyToRawId: ctx.msg.rawId,
    }];
  }
  await markSplitsSettled(ctx.db as any, toSettle);
  return [{
    to: ctx.msg.groupId,
    text: `✅ ${rupees(actuallySettled)} marked settled (${toSettle.length} split${toSettle.length === 1 ? "" : "s"}).`,
    replyToRawId: ctx.msg.rawId,
  }];
}

import type { HandlerContext, HandlerResult } from "./context.js";
import type { ParsedCommand } from "../parser/slash.js";
import { upsertUser } from "../repo/users.js";
import { upsertGroup, getGroup } from "../repo/groups.js";
import { createExpenseWithSplits } from "../repo/expenses.js";
import { formatMoney } from "../utils/money.js";

type SplitCmd = Extract<ParsedCommand, { command: "split" }>;

export async function handleSplit(ctx: HandlerContext, cmd: SplitCmd): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /split inside a Telegram group." }];
  }
  const groupId = ctx.msg.groupId;

  const memberMap = new Map(ctx.groupMembers.map((m) => [m.userId, m.displayName]));
  // Determine participants:
  let participantIds: string[];
  if (cmd.withMentions.length > 0) {
    participantIds = Array.from(new Set([ctx.msg.senderId, ...cmd.withMentions]));
  } else {
    participantIds = ctx.groupMembers.map((m) => m.userId);
  }
  participantIds = participantIds.filter((id) => !cmd.exceptMentions.includes(id));
  if (participantIds.length === 0) {
    return [{ to: groupId, text: "No participants left after exclusions.", replyToRawId: ctx.msg.rawId }];
  }

  // Upsert users + group
  await upsertGroup(ctx.db as any, { id: groupId, name: ctx.msg.senderDisplayName.slice(0, 40) || "Group" });
  for (const id of participantIds) {
    await upsertUser(ctx.db as any, { id, displayName: memberMap.get(id) ?? id });
  }
  await upsertUser(ctx.db as any, { id: ctx.msg.senderId, displayName: ctx.msg.senderDisplayName });

  const group = await getGroup(ctx.db as any, groupId);
  const currency = group?.currency ?? "INR";

  // Equal split with remainder distribution
  const n = participantIds.length;
  const base = Math.floor(cmd.amountPaise / n);
  const remainder = cmd.amountPaise - base * n;
  const splits = participantIds.map((userId, i) => ({
    userId,
    sharePaise: base + (i < remainder ? 1 : 0),
  }));

  await createExpenseWithSplits(ctx.db as any, {
    groupId,
    paidByUserId: ctx.msg.senderId,
    amountPaise: cmd.amountPaise,
    description: cmd.description,
    source: "slash",
    draftId: null,
    splits,
  });

  // Build reply
  const lines = [`✅ Split ${formatMoney(cmd.amountPaise, currency)} (${cmd.description})`];
  lines.push(`• ${ctx.msg.senderDisplayName} paid ${formatMoney(cmd.amountPaise, currency)}`);
  for (const s of splits) {
    if (s.userId === ctx.msg.senderId) continue;
    const name = memberMap.get(s.userId) ?? s.userId;
    lines.push(`• ${name} owes ${ctx.msg.senderDisplayName} ${formatMoney(s.sharePaise, currency)}`);
  }
  lines.push("Use /balance to see totals.");

  return [{ to: groupId, text: lines.join("\n"), replyToRawId: ctx.msg.rawId }];
}

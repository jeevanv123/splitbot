import type { HandlerContext, HandlerResult } from "./context.js";
import type { ParsedCommand } from "../parser/slash.js";
import { getGroup, setGroupCurrency, upsertGroup } from "../repo/groups.js";

type CurrencyCmd = Extract<ParsedCommand, { command: "currency" }>;

export async function handleCurrency(ctx: HandlerContext, cmd: CurrencyCmd): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /currency inside a group." }];
  }
  // Make sure the group row exists so set/get below have something to work with.
  await upsertGroup(ctx.db as any, { id: ctx.msg.groupId, name: "Group" });
  const group = await getGroup(ctx.db as any, ctx.msg.groupId);
  const current = group?.currency ?? "INR";

  if (cmd.code === null) {
    const isDefault = current === "INR";
    const suffix = isDefault ? " (default)" : "";
    return [{
      to: ctx.msg.groupId,
      text: `Current group currency: ${current}${suffix}.\nChange with /currency <code>, e.g. /currency USD.\nReset to default with /currency INR.`,
      replyToRawId: ctx.msg.rawId,
    }];
  }

  await setGroupCurrency(ctx.db as any, ctx.msg.groupId, cmd.code);
  return [{
    to: ctx.msg.groupId,
    text: `✅ Group currency set to ${cmd.code}. New expenses will use this currency.\n\nNote: existing balances are NOT converted; future expenses just display with the new symbol.`,
    replyToRawId: ctx.msg.rawId,
  }];
}

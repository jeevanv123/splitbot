import type { HandlerContext, HandlerResult } from "./context.js";
import { netBalances } from "../repo/splits.js";

function rupees(paise: number): string {
  const r = (paise / 100).toFixed(2).replace(/\.00$/, "");
  return `₹${r}`;
}

export async function handleBalance(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /balance inside a group." }];
  }
  const balances = await netBalances(ctx.db as any, ctx.msg.groupId);
  const me = balances.find((b) => b.userId === ctx.msg.senderId);

  if (!me || me.netPaise === 0) {
    return [{ to: ctx.msg.senderId, text: "✅ You're all settled up in this group." }];
  }
  if (me.netPaise > 0) {
    return [{ to: ctx.msg.senderId, text: `You're owed ${rupees(me.netPaise)} in this group. /settle to see details.` }];
  }
  return [{ to: ctx.msg.senderId, text: `You owe ${rupees(-me.netPaise)} in this group. /settle to pay.` }];
}

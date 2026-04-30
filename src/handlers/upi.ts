import type { HandlerContext, HandlerResult } from "./context.js";
import type { ParsedCommand } from "../parser/slash.js";
import { upsertUser, setUpi } from "../repo/users.js";

type UpiCmd = Extract<ParsedCommand, { command: "upi" }>;

export async function handleUpi(ctx: HandlerContext, cmd: UpiCmd): Promise<HandlerResult> {
  await upsertUser(ctx.db as any, { id: ctx.msg.senderId, displayName: ctx.msg.senderDisplayName });
  await setUpi(ctx.db as any, ctx.msg.senderId, cmd.upiId);
  return [{ to: ctx.msg.senderId, text: `✅ UPI saved: ${cmd.upiId}` }];
}

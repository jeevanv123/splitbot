import type { HandlerContext, HandlerResult } from "./context.js";

const HELP = `Splitbot — split expenses in Telegram groups.

Commands:
  /split <amount> <desc> [with @u1 @u2] [except @u3]
      e.g. /split 600 cab from airport with @9876543210 @9876543211
  /balance      Your net balance in this group
  /settle       Get UPI deep-links for who you owe
  /upi <upi-id> Save your UPI id once (e.g. /upi anu@okhdfc)
  /paid @user <amt>  Mark a settlement done after paying
  /bills        List pending bill drafts in this group
  /history      Recent expenses with delete buttons (mistakes happen)
  /reset        Wipe all expenses + drafts in this group (no confirmation!)
  /help         This message

Magic: drop a bill photo in the group → I'll itemize it. Reply in plain English
("Anu had pasta, Rohit had pizza") and I'll compute the split, OR tap
"Split equally" to divide it across everyone in the group.`;

export async function handleHelp(ctx: HandlerContext): Promise<HandlerResult> {
  return [{ to: ctx.msg.groupId ?? ctx.msg.senderId, text: HELP, replyToRawId: ctx.msg.rawId }];
}

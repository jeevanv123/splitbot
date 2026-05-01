import type { HandlerContext, HandlerResult } from "./context.js";

const INTRO = `Hi! I'm Splitbot. I help you split group expenses with one-tap UPI settle-up.

To get going:
1. Add me to a Telegram group with friends.
2. Run /setprivacy → Disable in @BotFather so I can read group messages.
3. In the group, try /split 600 cab or drop a bill photo.

Commands: /split /balance /settle /paid /upi /bills /history /currency /reset /help

Default currency: INR. Use /currency to change.`;

export async function handleStart(ctx: HandlerContext): Promise<HandlerResult> {
  return [{
    to: ctx.msg.groupId ?? ctx.msg.senderId,
    text: INTRO,
    replyToRawId: ctx.msg.rawId,
  }];
}

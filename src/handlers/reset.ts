import type { HandlerContext, HandlerResult } from "./context.js";
import { deleteAllExpensesInGroup } from "../repo/expenses.js";
import { deleteAllDraftsInGroup } from "../repo/drafts.js";

// NOTE: /reset has no admin check in v1. Anyone in the group can wipe its expenses
// and bill drafts. Acceptable for testing/personal-use scope; harden before opening
// to public groups.
export async function handleReset(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) {
    return [{ to: ctx.msg.senderId, text: "Use /reset inside a group." }];
  }

  const expenses = await deleteAllExpensesInGroup(ctx.db as any, ctx.msg.groupId);
  const drafts = await deleteAllDraftsInGroup(ctx.db as any, ctx.msg.groupId);

  return [{
    to: ctx.msg.groupId,
    text: `🧹 Wiped ${expenses} expense${expenses === 1 ? "" : "s"} and ${drafts} bill draft${drafts === 1 ? "" : "s"}. Group is fresh.`,
    replyToRawId: ctx.msg.rawId,
  }];
}

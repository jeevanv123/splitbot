import type { HandlerContext, HandlerResult } from "./context.js";
import { listPendingDraftsForUser, markDraftAssigned } from "../repo/drafts.js";
import { resolveDraft } from "../services/intent/resolveDraft.js";
import { assignItems } from "../services/intent/assignItems.js";
import { createExpenseWithSplits } from "../repo/expenses.js";

function rupees(p: number): string {
  return `₹${(p / 100).toFixed(2).replace(/\.00$/, "")}`;
}

function dateLabel(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export async function handleFreeText(ctx: HandlerContext): Promise<HandlerResult> {
  if (!ctx.msg.groupId) return [];
  const drafts = await listPendingDraftsForUser(ctx.db as any, ctx.msg.groupId, ctx.msg.senderId);
  if (drafts.length === 0) return [];

  let target = drafts[0]!;
  let intro = "";

  if (drafts.length > 1) {
    const summaries = drafts.map((d) => ({
      id: d.id,
      total: rupees(d.bill.totalPaise),
      date: dateLabel(d.createdAt),
      topItems: d.bill.items.slice(0, 3).map((i) => i.name),
    }));
    const r = await resolveDraft(ctx.llm, { message: ctx.msg.text, drafts: summaries });
    if (r.kind === "ambiguous") {
      const list = drafts.map((d) => `• ${rupees(d.bill.totalPaise)} from ${dateLabel(d.createdAt)} (${d.bill.items.map((i) => i.name).slice(0, 2).join(", ")})`).join("\n");
      return [{
        to: ctx.msg.groupId,
        text: `You have ${drafts.length} pending bills:\n${list}\nWhich one are you splitting?`,
        replyToRawId: ctx.msg.rawId,
      }];
    }
    if (r.kind === "error") return [];   // fail silent — message likely wasn't an assignment
    const picked = drafts.find((d) => d.id === r.draftId);
    if (!picked) return [];
    target = picked;
    if (r.confidence === "low") {
      intro = `(treating this as the ${rupees(target.bill.totalPaise)} bill from ${dateLabel(target.createdAt)})\n`;
    }
  }

  const result = await assignItems(ctx.llm, {
    bill: target.bill,
    participants: ctx.groupMembers,
    assignmentText: ctx.msg.text,
  });
  if (result.kind === "error") {
    return [{
      to: ctx.msg.groupId,
      text: "I didn't catch that — try: \"Anu had pasta, Rohit had pizza\".",
      replyToRawId: ctx.msg.rawId,
    }];
  }

  const expenseId = await createExpenseWithSplits(ctx.db as any, {
    groupId: ctx.msg.groupId,
    paidByUserId: ctx.msg.senderId,
    amountPaise: target.bill.totalPaise,
    description: target.bill.items.map((i) => i.name).slice(0, 3).join(", ") || "bill",
    source: "image",
    draftId: target.id,
    splits: result.assignments.map((a) => ({ userId: a.userId, sharePaise: a.sharePaise })),
  });
  await markDraftAssigned(ctx.db as any, target.id, expenseId);

  const memberMap = new Map(ctx.groupMembers.map((m) => [m.userId, m.displayName]));
  const lines = [`${intro}✅ Split done for ${rupees(target.bill.totalPaise)} bill:`];
  for (const a of result.assignments) {
    const name = memberMap.get(a.userId) ?? a.userId;
    if (a.userId === ctx.msg.senderId) {
      lines.push(`• ${name} (you) paid; share ${rupees(a.sharePaise)}`);
    } else {
      lines.push(`• ${name} owes ${rupees(a.sharePaise)}`);
    }
  }
  lines.push("/balance for totals.");
  return [{ to: ctx.msg.groupId, text: lines.join("\n"), replyToRawId: ctx.msg.rawId }];
}

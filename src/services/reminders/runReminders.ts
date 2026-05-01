import type pino from "pino";
import { findStaleUnsettledSplits, markSplitsReminded, type StaleUnsettledSplit } from "../../repo/splits.js";
import { simplify, type Balance } from "../split/simplify.js";
import { getUser } from "../../repo/users.js";
import { getGroup } from "../../repo/groups.js";
import { formatMoney } from "../../utils/money.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface RemindersDeps {
  db: any;
  logger: pino.Logger;
  send: (chatId: string, text: string) => Promise<{ ok: boolean }>;
  now?: () => Date;             // for tests
}

export async function runReminders(deps: RemindersDeps): Promise<{ groupsReminded: number; splitsMarked: number }> {
  const now = deps.now?.() ?? new Date();
  const olderThan = new Date(now.getTime() - SEVEN_DAYS_MS);

  const stale = await findStaleUnsettledSplits(deps.db, olderThan);
  if (stale.length === 0) {
    deps.logger.debug("no stale splits to remind");
    return { groupsReminded: 0, splitsMarked: 0 };
  }

  // Group by groupId
  const byGroup = new Map<string, StaleUnsettledSplit[]>();
  for (const s of stale) {
    const list = byGroup.get(s.groupId) ?? [];
    list.push(s);
    byGroup.set(s.groupId, list);
  }

  let groupsReminded = 0;
  let splitsMarked = 0;

  for (const [groupId, splits] of byGroup) {
    // Compute net balances FROM JUST THESE STALE SPLITS (creditor gets +share, debtor gets -share).
    // Skip self-debt rows (userId === paidByUserId) — the payer's own share is unsettled in the
    // schema but doesn't represent money owed.
    const totals = new Map<string, number>();
    for (const s of splits) {
      if (s.userId === s.paidByUserId) continue;
      totals.set(s.paidByUserId, (totals.get(s.paidByUserId) ?? 0) + s.sharePaise);
      totals.set(s.userId, (totals.get(s.userId) ?? 0) - s.sharePaise);
    }
    const balances: Balance[] = Array.from(totals.entries())
      .filter(([, v]) => v !== 0)
      .map(([userId, netPaise]) => ({ userId, netPaise }));

    const settlements = simplify(balances);
    if (settlements.length === 0) continue;

    const group = await getGroup(deps.db, groupId);
    const currency = group?.currency ?? "INR";

    const lines: string[] = ["🔔 Friendly reminder — settlements 7+ days old:"];
    for (const st of settlements) {
      const debtor = await getUser(deps.db, st.fromUserId);
      const creditor = await getUser(deps.db, st.toUserId);
      const debtorName = debtor?.displayName ?? st.fromUserId;
      const creditorName = creditor?.displayName ?? st.toUserId;
      lines.push(`• ${debtorName} owes ${creditorName} ${formatMoney(st.amountPaise, currency)}`);
    }
    lines.push("");
    lines.push("Tap /settle in DM to pay, or /paid @user <amount> after settling.");

    const result = await deps.send(groupId, lines.join("\n"));
    if (result.ok) {
      await markSplitsReminded(deps.db, splits.map((s) => s.id));
      groupsReminded += 1;
      splitsMarked += splits.length;
      deps.logger.info({ groupId, splits: splits.length }, "sent reminder");
    } else {
      deps.logger.warn({ groupId }, "reminder send failed; will retry next run");
    }
  }

  return { groupsReminded, splitsMarked };
}

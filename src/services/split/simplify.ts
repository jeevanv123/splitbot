import type { Paise, Settlement } from "../../types/domain.js";

export interface Balance {
  userId: string;
  netPaise: Paise;       // positive = owed money, negative = owes money
}

/**
 * Greedy min-cash-flow: match max creditor with max debtor, settle min(abs).
 * Result has at most N-1 settlements for N non-zero balances.
 */
export function simplify(balances: Balance[]): Settlement[] {
  const creditors = balances.filter((b) => b.netPaise > 0).map((b) => ({ ...b }));
  const debtors = balances.filter((b) => b.netPaise < 0).map((b) => ({ ...b }));

  const out: Settlement[] = [];

  while (creditors.length > 0 && debtors.length > 0) {
    creditors.sort((a, b) => b.netPaise - a.netPaise);
    debtors.sort((a, b) => a.netPaise - b.netPaise);

    const c = creditors[0]!;
    const d = debtors[0]!;
    const amount = Math.min(c.netPaise, -d.netPaise);

    out.push({ fromUserId: d.userId, toUserId: c.userId, amountPaise: amount });

    c.netPaise -= amount;
    d.netPaise += amount;

    if (c.netPaise === 0) creditors.shift();
    if (d.netPaise === 0) debtors.shift();
  }

  return out;
}

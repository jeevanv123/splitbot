import type { Bill, Paise } from "../../types/domain.js";

export interface EqualSplitInput {
  bill: Bill;
  participants: { userId: string }[];
}

export interface EqualAssignment {
  userId: string;
  sharePaise: Paise;
}

/**
 * Splits a bill's total evenly across participants, distributing the
 * indivisible remainder paise one-by-one to the first `remainder` participants
 * so the assignments sum exactly to `bill.totalPaise`.
 */
export function equalSplit(input: EqualSplitInput): EqualAssignment[] {
  const n = input.participants.length;
  if (n === 0) return [];
  const total = input.bill.totalPaise;
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return input.participants.map((p, i) => ({
    userId: p.userId,
    sharePaise: base + (i < remainder ? 1 : 0),
  }));
}

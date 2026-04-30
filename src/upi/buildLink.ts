import type { Paise } from "../types/domain.js";

const UPI_RE = /^[\w.+-]+@[\w.-]+$/;

export interface BuildUpiArgs {
  pa: string;        // payee UPI id, e.g. anu@okhdfc
  amPaise: Paise;
  tn: string;        // transaction note
}

export function buildUpiLink({ pa, amPaise, tn }: BuildUpiArgs): string {
  if (!UPI_RE.test(pa)) {
    throw new Error(`Invalid UPI id: ${JSON.stringify(pa)}`);
  }
  if (!Number.isInteger(amPaise) || amPaise <= 0) {
    throw new Error(`Invalid amount in paise: ${amPaise}`);
  }
  const rupees = (amPaise / 100).toFixed(2);
  const params = new URLSearchParams({
    pa,
    am: rupees,
    cu: "INR",
    tn,
  });
  // URLSearchParams uses '+' for spaces; UPI clients want %20.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

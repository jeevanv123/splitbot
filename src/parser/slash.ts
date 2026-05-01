import type { Paise } from "../types/domain.js";

export type ParsedCommand =
  | { command: "split"; amountPaise: Paise; description: string; withMentions: string[]; exceptMentions: string[] }
  | { command: "balance" }
  | { command: "settle" }
  | { command: "bills" }
  | { command: "history" }
  | { command: "reset" }
  | { command: "help" }
  | { command: "start" }
  | { command: "upi"; upiId: string }
  | { command: "paid"; toUserId: string | null; amountPaise: Paise | null }
  | { command: "currency"; code: string | null }
  | { command: "invalid"; reason: string };

const UPI_RE = /^[\w.+-]+@[\w.-]+$/;
// Mentions can be Telegram usernames (@anu) or numeric user_ids (@123456789).
// We extract the raw token; resolution against known group members happens at
// the handler layer if needed. v1 simplification: most splits go to all members
// (no `with` clause), so explicit-mention resolution is best-effort.
const MENTION_RE = /@([A-Za-z0-9_]{2,32})/g;

function parseAmountToPaise(s: string): Paise | null {
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const rupees = parseFloat(s);
  return Math.round(rupees * 100);
}

function extractMentions(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]!);
  }
  return out;
}

export function parseSlash(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/") || trimmed === "/") return null;

  const space = trimmed.indexOf(" ");
  const cmd = (space === -1 ? trimmed.slice(1) : trimmed.slice(1, space)).toLowerCase();
  const rest = space === -1 ? "" : trimmed.slice(space + 1).trim();

  switch (cmd) {
    case "balance":
      return { command: "balance" };
    case "settle":
      return { command: "settle" };
    case "bills":
      return { command: "bills" };
    case "history":
      return { command: "history" };
    case "reset":
      return { command: "reset" };
    case "help":
      return { command: "help" };
    case "start":
      return { command: "start" };

    case "upi": {
      if (!rest) return { command: "invalid", reason: "Usage: /upi <upi-id>" };
      if (!UPI_RE.test(rest)) return { command: "invalid", reason: "Invalid UPI id format." };
      return { command: "upi", upiId: rest };
    }

    case "currency": {
      if (!rest) {
        // No args → handler will show current currency
        return { command: "currency", code: null };
      }
      if (!/^[A-Za-z]{3}$/.test(rest)) {
        return { command: "invalid", reason: "Usage: /currency <3-letter code, e.g. USD>" };
      }
      return { command: "currency", code: rest.toUpperCase() };
    }

    case "paid": {
      if (!rest) {
        // No args → handler will show interactive menu
        return { command: "paid", toUserId: null, amountPaise: null };
      }
      const mentions = extractMentions(rest);
      const amountStr = rest.replace(MENTION_RE, "").trim();
      const amountPaise = parseAmountToPaise(amountStr);
      if (mentions.length !== 1 || amountPaise === null) {
        return { command: "invalid", reason: "Usage: /paid @<phone> <amount>" };
      }
      return { command: "paid", toUserId: mentions[0]!, amountPaise };
    }

    case "split": {
      if (!rest) return { command: "invalid", reason: "Usage: /split <amount> <desc> [with @user] [except @user]" };

      // Pull `with` and `except` clauses
      let work = ` ${rest} `;
      const withMatch = work.match(/\swith\s+((?:@[A-Za-z0-9_]{2,32}\s*)+)/i);
      const exceptMatch = work.match(/\sexcept\s+((?:@[A-Za-z0-9_]{2,32}\s*)+)/i);
      const withMentions = withMatch ? extractMentions(withMatch[1]!) : [];
      const exceptMentions = exceptMatch ? extractMentions(exceptMatch[1]!) : [];
      if (withMatch) work = work.replace(withMatch[0], " ");
      if (exceptMatch) work = work.replace(exceptMatch[0], " ");
      work = work.trim();

      const firstSpace = work.indexOf(" ");
      if (firstSpace === -1) return { command: "invalid", reason: "Need a description after the amount." };
      const amountStr = work.slice(0, firstSpace);
      const description = work.slice(firstSpace + 1).trim();
      const amountPaise = parseAmountToPaise(amountStr);
      if (amountPaise === null || amountPaise <= 0) {
        return { command: "invalid", reason: "Amount must be a positive number." };
      }
      if (!description) return { command: "invalid", reason: "Description is required." };

      return { command: "split", amountPaise, description, withMentions, exceptMentions };
    }

    default:
      return { command: "invalid", reason: `Unknown command: /${cmd}` };
  }
}

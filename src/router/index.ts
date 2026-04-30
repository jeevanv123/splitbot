import type { HandlerContext, HandlerResult } from "../handlers/context.js";
import { parseSlash } from "../parser/slash.js";
import { handleSplit } from "../handlers/split.js";
import { handleBalance } from "../handlers/balance.js";
import { handleSettle } from "../handlers/settle.js";
import { handleUpi } from "../handlers/upi.js";
import { handlePaid } from "../handlers/paid.js";
import { handleBills } from "../handlers/bills.js";
import { handleReset } from "../handlers/reset.js";
import { handleHelp } from "../handlers/help.js";
import { handleImage } from "../handlers/image.js";
import { handleFreeText } from "../handlers/freeText.js";

type Bound = { name: string; run: (ctx: HandlerContext) => Promise<HandlerResult> };

export function route(ctx: HandlerContext): Bound {
  if (ctx.msg.kind === "image") {
    return { name: "handleImage", run: handleImage };
  }
  const parsed = parseSlash(ctx.msg.text);
  if (!parsed) {
    return { name: "handleFreeText", run: handleFreeText };
  }
  switch (parsed.command) {
    case "split":   return { name: "handleSplit", run: (c) => handleSplit(c, parsed) };
    case "balance": return { name: "handleBalance", run: handleBalance };
    case "settle":  return { name: "handleSettle", run: handleSettle };
    case "upi":     return { name: "handleUpi", run: (c) => handleUpi(c, parsed) };
    case "paid":    return { name: "handlePaid", run: (c) => handlePaid(c, parsed) };
    case "bills":   return { name: "handleBills", run: handleBills };
    case "reset":   return { name: "handleReset", run: handleReset };
    case "help":    return { name: "handleHelp", run: handleHelp };
    case "invalid": {
      return {
        name: "handleInvalid",
        run: async (c) => [{
          to: c.msg.groupId ?? c.msg.senderId,
          text: `${parsed.reason}\nType /help for usage.`,
          replyToRawId: c.msg.rawId,
        }],
      };
    }
  }
}

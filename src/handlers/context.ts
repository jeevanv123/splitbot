import type { Db } from "../repo/db.js";
import type { AnthropicLike as VisionClient } from "../services/vision/extractBill.js";
import type { AnthropicLike as IntentClient } from "../services/intent/assignItems.js";
import type { IncomingMessage, OutgoingMessage } from "../types/messages.js";

export interface HandlerContext {
  db: Db;
  llm: VisionClient & IntentClient;
  msg: IncomingMessage;
  groupMembers: { userId: string; displayName: string }[];   // null/[] for DM
}

export type HandlerResult = OutgoingMessage[];

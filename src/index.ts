import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import AnthropicBedrock from "@anthropic-ai/bedrock-sdk";
import Fastify from "fastify";
import pino from "pino";
import { loadConfig } from "./config/index.js";
import { initDb } from "./repo/db.js";
import { upsertUser } from "./repo/users.js";
import { upsertGroup } from "./repo/groups.js";
import { recordGroupMember, listGroupMembers } from "./repo/groupMembers.js";
import { createTgBot } from "./tg/bot.js";
import { route } from "./router/index.js";
import type { HandlerContext } from "./handlers/context.js";
import type { IncomingMessage } from "./types/messages.js";

function defaultModelFor(provider: "anthropic" | "bedrock"): string {
  return provider === "bedrock"
    ? "anthropic.claude-sonnet-4-5-20250929-v1:0"
    : "claude-sonnet-4-6";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = pino({ level: config.LOG_LEVEL });
  const db = initDb(config.DATABASE_URL);

  const llm = config.LLM_PROVIDER === "bedrock"
    ? (new AnthropicBedrock({ awsRegion: config.AWS_REGION }) as any)
    : (new Anthropic({ apiKey: config.ANTHROPIC_API_KEY! }) as any);

  const model = config.CLAUDE_MODEL ?? defaultModelFor(config.LLM_PROVIDER);

  const tg = createTgBot({ token: config.TELEGRAM_BOT_TOKEN, logger });

  tg.onMessage(async (msg) => {
    try {
      // Auto-track sender as a user and (if in group) a group member
      await upsertUser(db as any, { id: msg.senderId, displayName: msg.senderDisplayName });
      if (msg.groupId) {
        await upsertGroup(db as any, { id: msg.groupId, name: "Group" });
        await recordGroupMember(db as any, msg.groupId, msg.senderId);
      }

      const groupMembers = msg.groupId
        ? await listGroupMembers(db as any, msg.groupId)
        : [];

      const ctx: HandlerContext = { db, llm, model, msg, groupMembers };
      const handler = route(ctx);
      const replies = await handler.run(ctx);
      for (const r of replies) {
        const result = await tg.send(r.to, r.text, r.replyToRawId, r.keyboard);
        if (result.ok) continue;

        if (result.reason === "dm_blocked" && msg.groupId) {
          // The bot was trying to DM a group member who hasn't started a chat with the bot.
          // Fall back to a brief in-group nudge — don't leak the original (potentially sensitive) reply.
          const nudge = `${msg.senderDisplayName}, open a private chat with me first (tap my profile → Send Message), then try the command again. I'll DM you the details from there.`;
          const fallback = await tg.send(msg.groupId, nudge, msg.rawId);
          if (!fallback.ok) {
            logger.error({ reason: fallback.reason }, "failed to send dm-blocked fallback");
          }
          continue;
        }

        // Other send errors: log only (don't crash, don't try to send another message about it)
        logger.error({ reason: result.reason, err: result.error }, "send failed");
      }
    } catch (err) {
      logger.error({ err }, "router/handler error");
      // Never let an error kill the bot.
    }
  });

  tg.onCallback(async (event) => {
    // Always answer the callback first to clear the spinner.
    await tg.answerCallback(event.queryId);

    try {
      const [kind, ...rest] = event.data.split(":");
      if (kind !== "paid" || rest.length !== 2) return;
      const [creditorId, paiseStr] = rest;
      if (!creditorId || !paiseStr) return;
      const amountPaise = parseInt(paiseStr, 10);
      if (Number.isNaN(amountPaise) || amountPaise <= 0) return;

      if (!event.chatId) return;

      // Build a synthetic IncomingMessage so we can reuse handlePaid's existing settle path.
      const synth: IncomingMessage = {
        kind: "text",
        groupId: event.chatId,
        senderId: event.fromUserId,
        senderDisplayName: event.fromDisplayName,
        text: `/paid @${creditorId} ${(amountPaise / 100).toFixed(2)}`,
        receivedAt: new Date(),
        rawId: event.messageId,
      };

      // Auto-track sender (mirrors the message handler's behavior).
      await upsertUser(db as any, { id: synth.senderId, displayName: synth.senderDisplayName });
      await upsertGroup(db as any, { id: synth.groupId!, name: "Group" });
      await recordGroupMember(db as any, synth.groupId!, synth.senderId);

      const groupMembers = await listGroupMembers(db as any, synth.groupId!);
      const ctx: HandlerContext = { db, llm, model, msg: synth, groupMembers };

      // Call handlePaid directly with the parsed command (skipping parser since we know the shape).
      const { handlePaid } = await import("./handlers/paid.js");
      const replies = await handlePaid(ctx, { command: "paid", toUserId: creditorId, amountPaise });
      for (const r of replies) {
        const result = await tg.send(r.to, r.text, r.replyToRawId, r.keyboard);
        if (!result.ok) logger.warn({ reason: result.reason }, "callback reply failed");
      }
    } catch (err) {
      logger.error({ err }, "callback processing error");
    }
  });

  await tg.start();

  const fastify = Fastify({ logger: false });
  fastify.get("/health", async () => ({ status: "ok" }));
  await fastify.listen({ port: 3000, host: "0.0.0.0" });
  logger.info("Splitbot up — health on :3000/health");

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    try { await tg.stop(); } catch (e) { logger.error({ err: e }, "tg stop failed"); }
    try { await fastify.close(); } catch (e) { logger.error({ err: e }, "fastify close failed"); }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

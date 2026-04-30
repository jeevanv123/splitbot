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
        await tg.send(r.to, r.text, r.replyToRawId);
      }
    } catch (err) {
      logger.error({ err }, "router/handler error");
      // Never let an error kill the bot.
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

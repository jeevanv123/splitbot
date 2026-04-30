import { Bot, type Context, GrammyError, HttpError } from "grammy";
import type pino from "pino";
import type { IncomingMessage } from "../types/messages.js";

export interface TgClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(to: string, text: string, replyToRawId?: string): Promise<void>;
  onMessage(handler: (m: IncomingMessage) => Promise<void>): void;
  getChatMember(
    chatId: string,
    userId: string,
  ): Promise<{ userId: string; displayName: string } | null>;
}

export interface CreateTgBotArgs {
  token: string;
  logger: pino.Logger;
}

export function createTgBot({ token, logger }: CreateTgBotArgs): TgClient {
  const bot = new Bot(token);
  const handlers: Array<(m: IncomingMessage) => Promise<void>> = [];

  // Map any Telegram message → IncomingMessage and dispatch.
  bot.on("message", async (ctx) => {
    try {
      const incoming = await ctxToIncoming(ctx);
      if (!incoming) return;
      for (const h of handlers) {
        try {
          await h(incoming);
        } catch (e) {
          logger.error({ err: e }, "handler error in tg adapter");
        }
      }
    } catch (e) {
      logger.error({ err: e }, "failed to map telegram message");
    }
  });

  bot.catch((err) => {
    logger.error({ err: err.error }, "grammy uncaught error");
    if (err.error instanceof GrammyError || err.error instanceof HttpError) {
      // bot will keep polling
    }
  });

  // Closure: ctxToIncoming has access to `token` for photo download URLs.
  async function ctxToIncoming(ctx: Context): Promise<IncomingMessage | null> {
    const m = ctx.message;
    if (!m || !ctx.from) return null;

    const chatId = String(ctx.chat?.id ?? "");
    const isGroup = ctx.chat?.type === "group" || ctx.chat?.type === "supergroup";
    const groupId = isGroup ? chatId : null;
    const senderId = String(ctx.from.id);
    const senderDisplayName = displayNameFromUser(ctx.from);
    const rawId = String(m.message_id);
    const receivedAt = new Date(m.date * 1000);

    if (m.photo && m.photo.length > 0) {
      // Largest photo is the last entry by Telegram convention.
      const largest = m.photo[m.photo.length - 1]!;
      const file = await ctx.api.getFile(largest.file_id);
      if (!file.file_path) return null;
      const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      let buf: Buffer;
      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) {
          // Never log downloadUrl or res itself — URL contains the bot token.
          logger.warn(
            { status: res.status, fileId: largest.file_id },
            "telegram photo download failed",
          );
          return null;
        }
        buf = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        // Don't include the error object — it may contain the URL with token.
        logger.warn(
          {
            fileId: largest.file_id,
            errType: e instanceof Error ? e.name : typeof e,
          },
          "telegram photo download threw",
        );
        return null;
      }
      return {
        kind: "image",
        groupId,
        senderId,
        senderDisplayName,
        text: m.caption ?? "",
        imageBuffer: buf,
        receivedAt,
        rawId,
      };
    }

    const text = m.text ?? m.caption ?? "";
    if (!text) return null;
    return {
      kind: "text",
      groupId,
      senderId,
      senderDisplayName,
      text,
      receivedAt,
      rawId,
    };
  }

  return {
    async start() {
      logger.info("Starting Telegram bot (long polling)…");
      // grammy's bot.start() returns a Promise that never resolves while polling.
      // We must NOT await it here, otherwise main() blocks.
      void bot.start({
        onStart: (info) => logger.info({ username: info.username }, "Telegram bot started"),
      });
    },
    async stop() {
      await bot.stop();
    },
    async send(to, text, replyToRawId) {
      const chatId = parseChatId(to);
      const replyParams = replyToRawId
        ? buildReplyParams(replyToRawId)
        : undefined;
      try {
        await bot.api.sendMessage(chatId, sanitizeMarkdown(text), {
          parse_mode: "Markdown",
          ...(replyParams ? { reply_parameters: replyParams } : {}),
        });
      } catch (e) {
        // Fallback to plain text if Markdown parsing fails on user content.
        logger.warn({ err: e }, "send with Markdown failed; retrying plain");
        await bot.api.sendMessage(chatId, text, {
          ...(replyParams ? { reply_parameters: replyParams } : {}),
        });
      }
    },
    onMessage(h) {
      handlers.push(h);
    },
    async getChatMember(chatId, userId) {
      try {
        const m = await bot.api.getChatMember(parseChatId(chatId), Number(userId));
        if (m.status === "left" || m.status === "kicked") return null;
        const u = m.user;
        return { userId: String(u.id), displayName: displayNameFromUser(u) };
      } catch {
        return null;
      }
    },
  };
}

function parseChatId(s: string): number {
  // Telegram chat IDs are integers; we serialize as strings throughout the codebase.
  return parseInt(s, 10);
}

function buildReplyParams(replyToRawId: string): { message_id: number } | undefined {
  const parsed = parseInt(replyToRawId, 10);
  if (Number.isNaN(parsed)) return undefined;
  return { message_id: parsed };
}

function displayNameFromUser(u: {
  first_name: string;
  last_name?: string;
  username?: string;
}): string {
  const full = u.last_name ? `${u.first_name} ${u.last_name}` : u.first_name;
  return full || u.username || "user";
}

// Telegram Markdown V1 reserves: _ * ` [ — escape user content lightly so legitimate
// formatting (we use ** by convention from handlers) keeps working.
function sanitizeMarkdown(text: string): string {
  // We're not generating MarkdownV2; legacy Markdown tolerates unbalanced chars in body.
  // Just ensure no unmatched backticks open code blocks.
  const backticks = (text.match(/`/g) ?? []).length;
  if (backticks % 2 !== 0) return text.replace(/`/g, "'");
  return text;
}

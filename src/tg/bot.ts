import { Bot, type Context, GrammyError, HttpError } from "grammy";
import type pino from "pino";
import type { IncomingMessage } from "../types/messages.js";

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "dm_blocked" | "other"; error: unknown };

export interface CallbackEvent {
  queryId: string;
  data: string;
  fromUserId: string;
  fromDisplayName: string;
  chatId: string;
  messageId: string;
}

export interface TgClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(
    to: string,
    text: string,
    replyToRawId?: string,
    keyboard?: { text: string; callbackData?: string; url?: string }[][],
  ): Promise<SendResult>;
  onMessage(handler: (m: IncomingMessage) => Promise<void>): void;
  onCallback(handler: (e: CallbackEvent) => Promise<void>): void;
  answerCallback(queryId: string, text?: string): Promise<void>;
  getChatMember(
    chatId: string,
    userId: string,
  ): Promise<{ userId: string; displayName: string } | null>;
  getChatAdmins(
    chatId: string,
  ): Promise<{ userId: string; displayName: string }[]>;
}

export interface CreateTgBotArgs {
  token: string;
  logger: pino.Logger;
}

const SPLITBOT_COMMANDS = [
  { command: "start",   description: "Get started" },
  { command: "split",   description: "Split an expense (e.g. /split 600 cab)" },
  { command: "balance", description: "Show group balances" },
  { command: "settle",  description: "Get UPI links for who you owe (DM)" },
  { command: "upi",     description: "Save your UPI id (e.g. /upi anu@okhdfc)" },
  { command: "paid",    description: "Mark a settlement done (e.g. /paid @user 100)" },
  { command: "bills",   description: "List pending bill drafts" },
  { command: "history", description: "List recent expenses with delete buttons" },
  { command: "currency", description: "View/set group currency (e.g. /currency USD)" },
  { command: "help",    description: "Show usage" },
  { command: "reset",   description: "Wipe all expenses + drafts in this group" },
];

export function createTgBot({ token, logger }: CreateTgBotArgs): TgClient {
  const bot = new Bot(token);
  const handlers: Array<(m: IncomingMessage) => Promise<void>> = [];
  const callbackHandlers: Array<(e: CallbackEvent) => Promise<void>> = [];

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

  // Dispatch inline-keyboard button taps to registered callback handlers.
  bot.on("callback_query:data", async (ctx) => {
    try {
      const cb = ctx.callbackQuery;
      if (!cb || !cb.data) return;
      const event: CallbackEvent = {
        queryId: cb.id,
        data: cb.data,
        fromUserId: String(cb.from.id),
        fromDisplayName: displayNameFromUser(cb.from),
        chatId: String(cb.message?.chat.id ?? ""),
        messageId: String(cb.message?.message_id ?? ""),
      };
      for (const h of callbackHandlers) {
        try {
          await h(event);
        } catch (e) {
          logger.error({ err: e }, "callback handler error");
        }
      }
    } catch (e) {
      logger.error({ err: e }, "failed to process callback_query");
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
      // Register slash command suggestions BEFORE polling starts.
      // setMyCommands is idempotent and safe to call on every startup; it overwrites the existing list.
      try {
        await bot.api.setMyCommands(SPLITBOT_COMMANDS);
        logger.info({ count: SPLITBOT_COMMANDS.length }, "Registered Telegram slash commands");
      } catch (e) {
        logger.warn({ err: e }, "Failed to register slash commands (non-fatal)");
      }
      // grammy's bot.start() returns a Promise that never resolves while polling.
      // We must NOT await it here, otherwise main() blocks.
      void bot.start({
        onStart: (info) => logger.info({ username: info.username }, "Telegram bot started"),
      });
    },
    async stop() {
      await bot.stop();
    },
    async send(to, text, replyToRawId, keyboard): Promise<SendResult> {
      const chatId = parseChatId(to);
      const replyParams = replyToRawId
        ? buildReplyParams(replyToRawId)
        : undefined;
      const opts: Record<string, unknown> = {
        ...(replyParams ? { reply_parameters: replyParams } : {}),
      };
      if (keyboard && keyboard.length > 0) {
        opts.reply_markup = {
          inline_keyboard: keyboard.map((row) =>
            row.map((b) => {
              if (b.url) return { text: b.text, url: b.url };
              return { text: b.text, callback_data: b.callbackData! };
            }),
          ),
        };
      }
      try {
        await bot.api.sendMessage(chatId, text, opts);
        return { ok: true };
      } catch (e: any) {
        // Telegram's "can't initiate conversation with a user" is 403 with that exact substring.
        const desc = String(e?.description ?? "");
        const code = e?.error_code ?? e?.status ?? 0;
        if (code === 403 && desc.includes("can't initiate conversation")) {
          return { ok: false, reason: "dm_blocked", error: e };
        }
        return { ok: false, reason: "other", error: e };
      }
    },
    onMessage(h) {
      handlers.push(h);
    },
    onCallback(h) {
      callbackHandlers.push(h);
    },
    async answerCallback(queryId, text) {
      try {
        await bot.api.answerCallbackQuery(queryId, text ? { text } : undefined);
      } catch (e) {
        logger.warn({ err: e }, "answerCallbackQuery failed");
      }
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
    async getChatAdmins(chatId) {
      try {
        const admins = await bot.api.getChatAdministrators(parseChatId(chatId));
        return admins
          .filter((a) => !a.user.is_bot)
          .map((a) => ({
            userId: String(a.user.id),
            displayName: displayNameFromUser(a.user),
          }));
      } catch (e) {
        logger.warn({ err: e }, "getChatAdministrators failed");
        return [];
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


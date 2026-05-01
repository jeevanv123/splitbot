export interface InlineKeyboardButton {
  text: string;
  // Exactly one of `callbackData` or `url` should be set.
  callbackData?: string;       // tap → bot receives callback (<= 64 bytes; Telegram limit)
  url?: string;                // tap → opens URL (e.g. upi://pay?...)
}

export type IncomingKind = "text" | "image" | "callback";

export interface IncomingMessage {
  kind: IncomingKind;
  groupId: string | null;       // null = DM
  senderId: string;             // platform-specific user id (e.g. Telegram user_id)
  senderDisplayName: string;
  text: string;                 // caption for images, body for text
  imageBuffer?: Buffer;         // present when kind === "image"
  receivedAt: Date;
  rawId: string;                // WA message id, for replies/refs
  // Present when kind === "callback":
  callbackData?: string;
  callbackQueryId?: string;
  callbackMessageId?: string;
}

export interface OutgoingMessage {
  to: string;                   // group JID or DM JID
  text: string;
  replyToRawId?: string;
  // Inline keyboard rows. Each inner array is a row of buttons.
  keyboard?: InlineKeyboardButton[][];
}

export type Reply = OutgoingMessage;

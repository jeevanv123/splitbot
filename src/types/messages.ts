export type IncomingKind = "text" | "image";

export interface IncomingMessage {
  kind: IncomingKind;
  groupId: string | null;       // null = DM
  senderId: string;             // platform-specific user id (e.g. Telegram user_id)
  senderDisplayName: string;
  text: string;                 // caption for images, body for text
  imageBuffer?: Buffer;         // present when kind === "image"
  receivedAt: Date;
  rawId: string;                // WA message id, for replies/refs
}

export interface OutgoingMessage {
  to: string;                   // group JID or DM JID
  text: string;
  replyToRawId?: string;
}

export type Reply = OutgoingMessage;

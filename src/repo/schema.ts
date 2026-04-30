import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// NOTE: this schema targets SQLite. Drizzle-kit handles the Postgres dialect at
// migration generation time when DATABASE_URL points at Postgres.

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),                          // E.164 phone
  displayName: text("display_name").notNull(),
  upiId: text("upi_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),                          // WA JID
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: text("group_id").notNull().references(() => groups.id),
  paidByUserId: text("paid_by_user_id").notNull().references(() => users.id),
  amountPaise: integer("amount_paise").notNull(),
  description: text("description").notNull(),
  source: text("source", { enum: ["slash", "image"] }).notNull(),
  draftId: integer("draft_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const splits = sqliteTable("splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseId: integer("expense_id").notNull().references(() => expenses.id),
  userId: text("user_id").notNull().references(() => users.id),
  sharePaise: integer("share_paise").notNull(),
  settledAt: integer("settled_at", { mode: "timestamp" }),
});

export const billDrafts = sqliteTable("bill_drafts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: text("group_id").notNull().references(() => groups.id),
  uploaderId: text("uploader_id").notNull().references(() => users.id),
  itemsJson: text("items_json").notNull(),              // serialized Bill
  imagePath: text("image_path"),
  status: text("status", { enum: ["pending", "assigned", "cancelled"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  assignedAt: integer("assigned_at", { mode: "timestamp" }),
  expenseId: integer("expense_id"),
});

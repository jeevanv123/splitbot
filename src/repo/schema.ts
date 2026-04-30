import { index, sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// NOTE: this schema targets SQLite. Drizzle-kit cannot retranslate `sqliteTable`
// to Postgres DDL — Postgres support requires a parallel `pg-core` schema
// (planned for phase 2). See README "Database" section.

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

// Circular FK: expenses.draftId <-> billDrafts.expenseId.
// Drizzle's `.references(() => billDrafts.id)` would create a TS circular-init
// hazard (billDrafts is declared below). We deliberately leave both circular
// columns as plain integers; the relationship is enforced by application code
// in the repository layer (see src/repo/*Repository.ts). All other FKs use
// proper `.references()` with explicit onDelete policies.
export const expenses = sqliteTable(
  "expenses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    paidByUserId: text("paid_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    amountPaise: integer("amount_paise").notNull(),
    description: text("description").notNull(),
    source: text("source", { enum: ["slash", "image"] }).notNull(),
    draftId: integer("draft_id"), // circular FK to bill_drafts.id — app-enforced
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byGroup: index("idx_expenses_group").on(t.groupId),
    byPayer: index("idx_expenses_payer").on(t.paidByUserId),
    byDraft: index("idx_expenses_draft").on(t.draftId),
  }),
);

export const splits = sqliteTable(
  "splits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    expenseId: integer("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sharePaise: integer("share_paise").notNull(),
    settledAt: integer("settled_at", { mode: "timestamp" }),
  },
  (t) => ({
    byExpense: index("idx_splits_expense").on(t.expenseId),
    byUser: index("idx_splits_user").on(t.userId),
    bySettledAt: index("idx_splits_settled_at").on(t.settledAt),
  }),
);

export const billDrafts = sqliteTable(
  "bill_drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "restrict" }),
    uploaderId: text("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    itemsJson: text("items_json").notNull(),              // serialized Bill
    imagePath: text("image_path"),
    status: text("status", { enum: ["pending", "assigned", "cancelled"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    assignedAt: integer("assigned_at", { mode: "timestamp" }),
    expenseId: integer("expense_id"), // circular FK to expenses.id — app-enforced
  },
  (t) => ({
    byGroup: index("idx_bill_drafts_group").on(t.groupId),
    byUploader: index("idx_bill_drafts_uploader").on(t.uploaderId),
    byGroupStatus: index("idx_bill_drafts_group_status").on(t.groupId, t.status),
  }),
);

export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull().references(() => groups.id, { onDelete: "restrict" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
}, (t) => ({
  // Composite primary key emulation via unique index since drizzle-kit handles single-PK natively
  byGroup: index("idx_group_members_group").on(t.groupId),
  unique: uniqueIndex("uniq_group_members").on(t.groupId, t.userId),
}));

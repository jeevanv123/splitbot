// Money: ALWAYS paise (integer). Convert at edges.
export type Paise = number;

export interface User {
  id: string;            // Platform user id (e.g. Telegram user_id as string)
  displayName: string;
  upiId: string | null;
  createdAt: Date;
}

export interface Group {
  id: string;            // Platform chat id (e.g. Telegram chat_id as string)
  name: string;
  createdAt: Date;
}

export type ExpenseSource = "slash" | "image";

export interface Expense {
  id: number;
  groupId: string;
  paidByUserId: string;
  amountPaise: Paise;
  description: string;
  source: ExpenseSource;
  draftId: number | null;
  createdAt: Date;
}

export interface Split {
  id: number;
  expenseId: number;
  userId: string;
  sharePaise: Paise;
  settledAt: Date | null;
}

export interface BillItem {
  name: string;
  pricePaise: Paise;
}

export interface Bill {
  items: BillItem[];
  taxPaise: Paise;
  tipPaise: Paise;
  totalPaise: Paise;
  currency: string;       // "INR" by default
}

export type DraftStatus = "pending" | "assigned" | "cancelled";

export interface BillDraft {
  id: number;
  groupId: string;
  uploaderId: string;
  bill: Bill;
  imagePath: string | null;
  status: DraftStatus;
  createdAt: Date;
  assignedAt: Date | null;
  expenseId: number | null;
}

export interface Settlement {
  fromUserId: string;
  toUserId: string;
  amountPaise: Paise;
}

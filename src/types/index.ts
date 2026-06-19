// src/types/index.ts — shared domain types (source of truth; do not redefine elsewhere).

export type TxnType = 'expense' | 'income';
export type TxnSource = 'voice' | 'text' | 'sms';
export type TxnStatus = 'pending' | 'confirmed';
export type CategoryKind = 'expense' | 'income';
export type Locale = 'ar' | 'en';

export interface Category {
  slug: string;
  name_en: string;
  name_ar: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  sort_order: number;
  /** Owner of a custom category. Absent/null on the built-in (global) ones. */
  user_id?: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: TxnType;
  amount: number;
  currency: string;
  category_slug: string;
  note: string | null;
  raw_text: string | null;
  source: TxnSource;
  status: TxnStatus;
  confidence: number | null;
  account_id: string | null;
  occurred_at: string;
  created_at: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  opening_balance: number;
  is_default: boolean;
  currency: string;
  created_at: string;
}

// Row shape returned by the account_balances view.
export interface AccountBalance extends Account {
  balance: number;
}

export type NewAccount = Pick<Account, 'name' | 'opening_balance' | 'is_default'>;

export interface ParsedTransaction {
  type: TxnType;
  amount: number;
  currency: string;
  category_slug: string;
  note: string;
  confidence: number;
  occurred_at?: string;
}

// account_id is optional on insert — the DB trigger fills it from the user's
// default account when omitted; callers may still set it explicitly.
export type NewTransaction = Omit<Transaction, 'id' | 'created_at' | 'account_id'> & {
  account_id?: string | null;
};

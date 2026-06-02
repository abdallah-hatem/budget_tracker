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
  occurred_at: string;
  created_at: string;
}

export interface ParsedTransaction {
  type: TxnType;
  amount: number;
  currency: string;
  category_slug: string;
  note: string;
  confidence: number;
  occurred_at?: string;
}

export type NewTransaction = Omit<Transaction, 'id' | 'created_at'>;

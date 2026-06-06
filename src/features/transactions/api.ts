import { supabase } from '../../lib/supabase';
import type { NewTransaction, Transaction, TxnStatus, TxnType } from '../../types';

// Canonical filter shape (consumed by M6's useTransactions / useMonthSummary).
export interface TransactionFilter {
  from?: string;          // ISO-8601, inclusive lower bound on occurred_at
  to?: string;            // ISO-8601, exclusive upper bound on occurred_at
  category_slug?: string;
  status?: TxnStatus;
  type?: TxnType;         // 'expense' | 'income'
}

export async function insertTransaction(row: NewTransaction): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Transaction;
}

/** Insert several transactions at once (one utterance -> several items). */
export async function insertTransactions(
  rows: NewTransaction[],
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(rows)
    .select();
  if (error) throw new Error(error.message);
  return (data ?? []) as Transaction[];
}

export async function updateTransaction(
  id: string,
  patch: Partial<NewTransaction>,
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function listTransactions(
  filter: TransactionFilter,
): Promise<Transaction[]> {
  let query = supabase.from('transactions').select('*');
  if (filter.category_slug) {
    query = query.eq('category_slug', filter.category_slug);
  }
  if (filter.type) {
    query = query.eq('type', filter.type);
  }
  if (filter.status) {
    query = query.eq('status', filter.status);
  }
  if (filter.from) {
    query = query.gte('occurred_at', filter.from);
  }
  if (filter.to) {
    query = query.lt('occurred_at', filter.to);
  }
  const { data, error } = await query.order('occurred_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Transaction[];
}

/** Fetch one transaction by id (null if it no longer exists, e.g. just deleted). */
export async function getTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Transaction) ?? null;
}

import { supabase } from '../../lib/supabase';
import type { Budget, NewBudget } from './types';

/** All of the signed-in user's budgets (RLS scopes the rows). */
export async function listBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, user_id, scope, category_slug, period, amount, warn_pct')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Budget[];
}

// budgets.user_id is `not null` with no column default, and the insert RLS
// policy checks `auth.uid() = user_id` — so it must be supplied explicitly
// from the session (matching the pattern in features/categories/api.ts),
// not left for the DB to stamp.
export async function createBudget(row: NewBudget): Promise<Budget> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('budgets')
    .insert({ ...row, user_id: uid })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Budget;
}

export async function updateBudget(id: string, patch: Partial<NewBudget>): Promise<Budget> {
  const { data, error } = await supabase
    .from('budgets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Budget;
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

import { supabase } from '../../lib/supabase';
import type { Account, AccountBalance, NewAccount } from '../../types';

/** All of the current user's accounts with live balances, default first. */
export async function listAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from('account_balances')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountBalance[];
}

/**
 * Create an account. Always inserts is_default=false (so it never collides with
 * the existing default on the partial unique index); if `is_default` was
 * requested, flips it via the atomic RPC afterwards.
 */
export async function createAccount(input: NewAccount): Promise<Account> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      name: input.name,
      opening_balance: input.opening_balance,
      is_default: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const account = data as Account;
  if (input.is_default) {
    await setDefaultAccount(account.id);
  }
  return account;
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, 'name' | 'opening_balance'>>,
): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Account;
}

export async function setDefaultAccount(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_account', { target: id });
  if (error) throw new Error(error.message);
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

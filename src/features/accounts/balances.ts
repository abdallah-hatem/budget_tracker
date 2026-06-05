import type { AccountBalance } from '../../types';

/** Sum of every account's live balance (the user's total net worth in-app). */
export function totalBalance(accounts: AccountBalance[]): number {
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}

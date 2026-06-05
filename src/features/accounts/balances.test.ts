import { totalBalance } from './balances';
import type { AccountBalance } from '../../types';

const acct = (over: Partial<AccountBalance>): AccountBalance => ({
  id: 'a',
  user_id: 'u',
  name: 'Main',
  opening_balance: 0,
  is_default: true,
  currency: 'EGP',
  created_at: '',
  balance: 0,
  ...over,
});

describe('totalBalance', () => {
  it('returns 0 for no accounts', () => {
    expect(totalBalance([])).toBe(0);
  });

  it('sums balances across accounts', () => {
    expect(totalBalance([acct({ balance: 100000 }), acct({ balance: -250.5 })])).toBe(99749.5);
  });
});

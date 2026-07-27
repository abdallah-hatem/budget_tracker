export type BudgetScope = 'overall' | 'category';
export type BudgetPeriod = 'monthly' | 'weekly';

export interface Budget {
  id: string;
  user_id: string;
  scope: BudgetScope;
  /** null when scope is 'overall'. */
  category_slug: string | null;
  period: BudgetPeriod;
  amount: number;
  warn_pct: number;
}

export type NewBudget = Pick<
  Budget,
  'scope' | 'category_slug' | 'period' | 'amount' | 'warn_pct'
>;

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  /** Can exceed 100 when overspent; the bar clamps its own width. */
  pct: number;
  /** Never negative. */
  remaining: number;
  tone: 'ok' | 'warn' | 'over';
}

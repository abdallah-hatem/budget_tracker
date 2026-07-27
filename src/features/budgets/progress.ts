import type { Budget, BudgetProgress } from './types';

/** Spend vs cap, with the tone the UI colors the bar by. */
export function computeProgress(budget: Budget, spent: number): BudgetProgress {
  const amount = budget.amount > 0 ? budget.amount : 0;
  const pct = amount > 0 ? Math.round((spent / amount) * 100) : 0;
  const tone: BudgetProgress['tone'] =
    amount > 0 && spent >= amount ? 'over' : pct >= budget.warn_pct ? 'warn' : 'ok';
  return {
    budget,
    spent,
    pct,
    remaining: Math.max(0, amount - spent),
    tone,
  };
}

/** The budgets worth surfacing on the dashboard: warn/over, worst first. */
export function atRisk(list: BudgetProgress[], limit = 3): BudgetProgress[] {
  return list
    .filter((p) => p.tone !== 'ok')
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}

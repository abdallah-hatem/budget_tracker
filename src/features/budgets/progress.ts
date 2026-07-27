import type { Budget, BudgetProgress } from './types';

/** Spend vs cap, with the tone the UI colors the bar by. */
export function computeProgress(budget: Budget, spent: number): BudgetProgress {
  const amount = budget.amount > 0 ? budget.amount : 0;

  // Compare money in integer cents — mirrors the server's evaluateBudget
  // (supabase/functions/_shared/budgetEval.ts). Floating-point sums of many
  // numeric(12,2) rows land on values like 999.9999999999998 for a "true"
  // 1000, which must never miss the "over" branch here just as it must never
  // miss "reached"/"exceeded" server-side — otherwise the push notification
  // and the on-screen progress bar tell the user two different stories.
  const spentC = Math.round(spent * 100);
  const amountC = Math.round(amount * 100);

  const rawPct = amount > 0 ? Math.round((spent / amount) * 100) : 0;
  const over = amount > 0 && spentC >= amountC;

  // Genuinely under the cap: never report 100% (rounding of e.g. 999/1000
  // would otherwise say "100%") and decide warn from exact integer math
  // rather than the rounded percentage, so a spend that rounds up to the
  // warn threshold a dollar early doesn't fire warn prematurely.
  const pct = over ? rawPct : Math.min(rawPct, 99);
  const warn = !over && amount > 0 && spentC * 100 >= amountC * budget.warn_pct;

  const tone: BudgetProgress['tone'] = over ? 'over' : warn ? 'warn' : 'ok';
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

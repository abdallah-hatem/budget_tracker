// Pure evaluation of one budget against its cycle spend. Returns AT MOST ONE
// descriptor per budget — the highest-severity state — so a single overspent
// category can never produce three notifications in the same run.
import type { Cycle, Period } from "./budgetCycles.ts";

export interface BudgetRow {
  id: string;
  scope: "overall" | "category";
  category_slug: string | null;
  period: Period;
  amount: number;
  warn_pct: number;
}

export interface AlertDescriptor {
  budgetId: string | null;
  kind: string;
  categorySlug: string | null;
  meta: Record<string, unknown>;
}

/**
 * Below this elapsed fraction a projection is extrapolated from too little of
 * the cycle to mean anything (2 days in, one big grocery run reads as "you'll
 * spend 15x your budget"), so pace alerts are suppressed.
 */
export const PACE_MIN_ELAPSED = 0.25;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function evaluateBudget(
  b: BudgetRow,
  spend: number,
  cycle: Cycle,
): AlertDescriptor | null {
  if (spend <= 0 || b.amount <= 0) return null;

  // Compare money in integer cents — floating point sums of many numeric(12,2)
  // rows land on values like 999.9999999999998 or 1000.0000000000002, and
  // those must never miss the "reached" branch or spuriously fire "exceeded".
  const spendC = Math.round(spend * 100);
  const amountC = Math.round(b.amount * 100);

  const pct = Math.round((spend / b.amount) * 100);
  const base = { budgetId: b.id, categorySlug: b.category_slug };

  // Severity order: exceeded > reached > approaching > pace.
  if (spendC > amountC) {
    return { ...base, kind: "exceeded", meta: { pct, spend: round2(spend), amount: b.amount, over: round2((spendC - amountC) / 100) } };
  }
  if (spendC === amountC) {
    return { ...base, kind: "reached", meta: { pct, spend: round2(spend), amount: b.amount } };
  }
  // Genuinely under the cap from here on — never report 100% for an
  // under-cap budget (rounding of e.g. 996/1000 would otherwise say "100%").
  const pctUnderCap = Math.min(pct, 99);
  if (pctUnderCap >= b.warn_pct) {
    return { ...base, kind: "approaching", meta: { pct: pctUnderCap, spend: round2(spend), amount: b.amount, remaining: round2(b.amount - spend) } };
  }
  if (cycle.elapsedFraction >= PACE_MIN_ELAPSED) {
    const projected = round2(spend / cycle.elapsedFraction);
    if (projected > b.amount) {
      return { ...base, kind: "pace", meta: { pct: pctUnderCap, spend: round2(spend), amount: b.amount, projected, over: round2(projected - b.amount) } };
    }
  }
  return null;
}

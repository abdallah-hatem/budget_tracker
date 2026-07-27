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

/** Per-category history used for anomaly detection (budgeted or not). */
export interface CategoryHistory {
  categorySlug: string;
  /** Spend so far in the current monthly cycle. */
  cycleSpend: number;
  /** Trailing 3-month average monthly spend for this category. */
  avg3mMonthly: number;
  /** Transactions in the current week. */
  weekCount: number;
  /** Typical transactions per week for this category. */
  avgWeekCount: number;
}

/** Absolute floor so trivial categories can't produce a "300% spike". */
export const SPIKE_MIN_EGP = 200;
export const SPIKE_RATIO = 1.4;
export const FREQ_MIN_COUNT = 4;
export const FREQ_RATIO = 1.5;

/**
 * Detect notable shifts across ALL categories, budgeted or not. Returns the
 * strongest `limit` insights so the daily push stays short.
 */
export function detectInsights(
  hist: CategoryHistory[],
  cycle: Cycle,
  limit = 2,
): AlertDescriptor[] {
  const found: Array<AlertDescriptor & { strength: number }> = [];

  for (const h of hist) {
    // --- Spike: cycle spend vs the average PRORATED to how far we are in. ---
    if (h.avg3mMonthly > 0 && h.cycleSpend >= SPIKE_MIN_EGP) {
      const expected = h.avg3mMonthly * Math.max(cycle.elapsedFraction, 0.01);
      const ratio = h.cycleSpend / expected;
      if (ratio >= SPIKE_RATIO) {
        found.push({
          budgetId: null,
          kind: "insight_spike",
          categorySlug: h.categorySlug,
          meta: {
            spend: round2(h.cycleSpend),
            expected: round2(expected),
            pctAbove: Math.round((ratio - 1) * 100),
          },
          strength: ratio,
        });
      }
    }

    // --- Frequency: this week's count vs the usual weekly count. ---
    if (h.avgWeekCount > 0 && h.weekCount >= FREQ_MIN_COUNT) {
      const ratio = h.weekCount / h.avgWeekCount;
      if (ratio >= FREQ_RATIO) {
        found.push({
          budgetId: null,
          kind: "insight_frequency",
          categorySlug: h.categorySlug,
          meta: { count: h.weekCount, usual: round2(h.avgWeekCount) },
          strength: ratio,
        });
      }
    }
  }

  return found
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit)
    .map(({ strength: _strength, ...rest }) => rest);
}

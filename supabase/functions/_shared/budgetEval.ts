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
  // Compare EXACT integer money against the warn threshold — not the rounded
  // percentage — so the server always agrees with the client's
  // computeProgress() (src/features/budgets/progress.ts). Otherwise a spend
  // like 795/1000 with warn_pct 80 rounds pct to 80 and would fire "approaching"
  // here while the on-screen bar (which uses exact math) still reads 79% green.
  if (spendC * 100 >= amountC * b.warn_pct) {
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
 * Below this elapsed fraction, spike detection is meaningless: the expected
 * spend is prorated from so little of the cycle that a single ordinary
 * purchase can look like a multi-hundred-percent spike (day 1 of the month,
 * avg3mMonthly = 1000 -> expected ~= 10, so a plain 200 EGP purchase reads as
 * a 1900% spike). Mirrors PACE_MIN_ELAPSED's guard on pace projections.
 * Frequency detection is NOT gated on this — it compares whole-week counts,
 * not a prorated extrapolation, so it stays valid early in the cycle.
 */
export const INSIGHT_MIN_ELAPSED = 0.25;

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
    // Skipped early in the cycle (see INSIGHT_MIN_ELAPSED) since the prorated
    // expectation is too small to compare against meaningfully.
    if (
      cycle.elapsedFraction >= INSIGHT_MIN_ELAPSED &&
      h.avg3mMonthly > 0 && h.cycleSpend >= SPIKE_MIN_EGP
    ) {
      const expected = h.avg3mMonthly * cycle.elapsedFraction;
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

  // At most one insight per category — keep the stronger of spike/frequency
  // so a single noisy category can't crowd out every other category's
  // anomaly within `limit`.
  const strongestPerCategory = new Map<string, AlertDescriptor & { strength: number }>();
  for (const insight of found) {
    const existing = strongestPerCategory.get(insight.categorySlug ?? "");
    if (!existing || insight.strength > existing.strength) {
      strongestPerCategory.set(insight.categorySlug ?? "", insight);
    }
  }

  return [...strongestPerCategory.values()]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit)
    .map(({ strength: _strength, ...rest }) => rest);
}

import { assertEquals, assert } from "@std/assert";
import {
  detectInsights,
  evaluateBudget,
  PACE_MIN_ELAPSED,
  SPIKE_MIN_EGP,
  type BudgetRow,
  type CategoryHistory,
} from "../_shared/budgetEval.ts";
import type { Cycle } from "../_shared/budgetCycles.ts";

const budget = (over: Partial<BudgetRow> = {}): BudgetRow => ({
  id: "b1",
  scope: "category",
  category_slug: "food",
  period: "monthly",
  amount: 1000,
  warn_pct: 80,
  ...over,
});

const cycle = (elapsedFraction: number): Cycle => ({
  start: new Date("2026-07-01T00:00:00Z"),
  end: new Date("2026-08-01T00:00:00Z"),
  key: "2026-07",
  elapsedFraction,
});

Deno.test("under the warning line -> no alert", () => {
  assertEquals(evaluateBudget(budget(), 500, cycle(0.9)), null);
});

Deno.test("at the warning line -> approaching", () => {
  const a = evaluateBudget(budget(), 800, cycle(0.9));
  assertEquals(a?.kind, "approaching");
  assertEquals(a?.budgetId, "b1");
  assertEquals(a?.categorySlug, "food");
  assertEquals(a?.meta.pct, 80);
});

Deno.test("exactly at the cap -> reached, not exceeded", () => {
  assertEquals(evaluateBudget(budget(), 1000, cycle(0.9))?.kind, "reached");
});

Deno.test("over the cap -> exceeded (outranks approaching)", () => {
  const a = evaluateBudget(budget(), 1300, cycle(0.9));
  assertEquals(a?.kind, "exceeded");
  assertEquals(a?.meta.over, 300);
});

Deno.test("on pace to exceed -> pace alert when not yet over", () => {
  // Half the cycle gone, 60% spent -> projects to 1200 > 1000.
  const a = evaluateBudget(budget(), 600, cycle(0.5));
  assertEquals(a?.kind, "pace");
  assertEquals(a?.meta.projected, 1200);
});

Deno.test("pace is suppressed before the minimum elapsed fraction", () => {
  // 10% elapsed, tiny spend that would extrapolate absurdly high.
  assert(PACE_MIN_ELAPSED > 0.1);
  assertEquals(evaluateBudget(budget(), 200, cycle(0.1)), null);
});

Deno.test("pace does not fire when the projection lands under the cap", () => {
  assertEquals(evaluateBudget(budget(), 300, cycle(0.5)), null);
});

Deno.test("approaching outranks pace", () => {
  // 85% spent at 50% elapsed: both would trigger; approaching wins.
  assertEquals(evaluateBudget(budget(), 850, cycle(0.5))?.kind, "approaching");
});

Deno.test("overall scope carries a null categorySlug", () => {
  const a = evaluateBudget(
    budget({ scope: "overall", category_slug: null }), 1200, cycle(0.9),
  );
  assertEquals(a?.kind, "exceeded");
  assertEquals(a?.categorySlug, null);
});

Deno.test("zero spend never alerts", () => {
  assertEquals(evaluateBudget(budget(), 0, cycle(0.99)), null);
});

Deno.test("996/1000 -> approaching with pct clamped to 99, not 100", () => {
  const a = evaluateBudget(budget(), 996, cycle(0.9));
  assertEquals(a?.kind, "approaching");
  assertEquals(a?.meta.pct, 99);
});

Deno.test("float-sum just under the cap -> reached, not approaching", () => {
  // Summing many numeric(12,2) rows can land a hair under the integer cap.
  const a = evaluateBudget(budget(), 999.9999999999998, cycle(0.9));
  assertEquals(a?.kind, "reached");
});

Deno.test("float-sum just over the cap -> reached via cent-rounding, not a spurious exceeded", () => {
  // 1000.0000000000002 rounds to the same integer cent value (100000) as the
  // 1000 cap, so this is correctly classified as "reached" rather than
  // "exceeded" with a meaningless over:0 (or over: <1 cent artifact).
  const a = evaluateBudget(budget(), 1000.0000000000002, cycle(0.9));
  assertEquals(a?.kind, "reached");
});

Deno.test("pace is evaluated exactly at PACE_MIN_ELAPSED", () => {
  const a = evaluateBudget(budget(), 300, cycle(PACE_MIN_ELAPSED));
  assertEquals(a?.kind, "pace");
  assertEquals(a?.meta.projected, 1200);
});

Deno.test("pace is suppressed just below PACE_MIN_ELAPSED", () => {
  assertEquals(evaluateBudget(budget(), 300, cycle(PACE_MIN_ELAPSED - 0.01)), null);
});

const hist = (over: Partial<CategoryHistory> = {}): CategoryHistory => ({
  categorySlug: "food",
  cycleSpend: 0,
  avg3mMonthly: 1000,
  weekCount: 0,
  avgWeekCount: 2,
  ...over,
});

Deno.test("spike: 40%+ above the prorated 3-month average", () => {
  // Half the month elapsed, average pace would be 500; 800 is +60%.
  const out = detectInsights([hist({ cycleSpend: 800 })], cycle(0.5));
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "insight_spike");
  assertEquals(out[0].categorySlug, "food");
});

Deno.test("spike: normal spending produces no insight", () => {
  assertEquals(detectInsights([hist({ cycleSpend: 520 })], cycle(0.5)).length, 0);
});

Deno.test("spike: suppressed below the EGP floor even at a big ratio", () => {
  // 10x the average, but the absolute amount is trivial.
  const out = detectInsights(
    [hist({ cycleSpend: SPIKE_MIN_EGP - 50, avg3mMonthly: 20 })], cycle(0.5),
  );
  assertEquals(out.filter((o) => o.kind === "insight_spike").length, 0);
});

Deno.test("spike: no history (avg 0) produces no insight", () => {
  assertEquals(
    detectInsights([hist({ cycleSpend: 5000, avg3mMonthly: 0 })], cycle(0.5)).length, 0,
  );
});

Deno.test("frequency: unusual transaction count fires", () => {
  const out = detectInsights([hist({ weekCount: 6, avgWeekCount: 2 })], cycle(0.5));
  assertEquals(out.some((o) => o.kind === "insight_frequency"), true);
});

Deno.test("frequency: below the minimum count never fires", () => {
  const out = detectInsights([hist({ weekCount: 3, avgWeekCount: 1 })], cycle(0.5));
  assertEquals(out.some((o) => o.kind === "insight_frequency"), false);
});

Deno.test("insights are capped at the limit, strongest first", () => {
  const out = detectInsights(
    [
      hist({ categorySlug: "a", cycleSpend: 700 }),   // +40%
      hist({ categorySlug: "b", cycleSpend: 2000 }),  // +300%
      hist({ categorySlug: "c", cycleSpend: 1200 }),  // +140%
    ],
    cycle(0.5),
    2,
  );
  assertEquals(out.length, 2);
  assertEquals(out[0].categorySlug, "b");
});

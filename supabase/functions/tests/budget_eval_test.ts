import { assertEquals, assert } from "@std/assert";
import { evaluateBudget, PACE_MIN_ELAPSED, type BudgetRow } from "../_shared/budgetEval.ts";
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

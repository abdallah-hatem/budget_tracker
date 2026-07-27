import { assertEquals, assert } from "@std/assert";
import { monthlyCycle, weeklyCycle, cycleFor } from "../_shared/budgetCycles.ts";

Deno.test("monthlyCycle: startDay 1 spans the calendar month", () => {
  const c = monthlyCycle(new Date("2026-07-15T12:00:00Z"), 1);
  assertEquals(c.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-08-01T00:00:00.000Z");
  assertEquals(c.key, "2026-07");
});

Deno.test("monthlyCycle: custom startDay before today -> cycle began this month", () => {
  const c = monthlyCycle(new Date("2026-07-20T00:00:00Z"), 10);
  assertEquals(c.start.toISOString(), "2026-07-10T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-08-10T00:00:00.000Z");
  assertEquals(c.key, "2026-07");
});

Deno.test("monthlyCycle: custom startDay after today -> cycle began last month", () => {
  const c = monthlyCycle(new Date("2026-07-05T00:00:00Z"), 10);
  assertEquals(c.start.toISOString(), "2026-06-10T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-07-10T00:00:00.000Z");
  // The key names the cycle by its START month.
  assertEquals(c.key, "2026-06");
});

Deno.test("monthlyCycle: December rolls into the next year", () => {
  const c = monthlyCycle(new Date("2026-12-20T00:00:00Z"), 10);
  assertEquals(c.end.toISOString(), "2027-01-10T00:00:00.000Z");
});

Deno.test("weeklyCycle: starts Saturday", () => {
  // 2026-07-15 is a Wednesday; the preceding Saturday is 2026-07-11.
  const c = weeklyCycle(new Date("2026-07-15T12:00:00Z"));
  assertEquals(c.start.getUTCDay(), 6); // 6 = Saturday
  assertEquals(c.start.toISOString(), "2026-07-11T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-07-18T00:00:00.000Z");
});

Deno.test("weeklyCycle: on a Saturday the cycle starts that day", () => {
  const c = weeklyCycle(new Date("2026-07-11T09:00:00Z"));
  assertEquals(c.start.toISOString(), "2026-07-11T00:00:00.000Z");
});

Deno.test("weekly key is year + week-offset number (not ISO-8601) and differs across weeks", () => {
  const a = weeklyCycle(new Date("2026-07-11T00:00:00Z"));
  const b = weeklyCycle(new Date("2026-07-18T00:00:00Z"));
  assert(a.key.startsWith("2026-W"));
  assert(a.key !== b.key);
});

Deno.test("elapsedFraction is 0..1 and grows through the cycle", () => {
  const early = monthlyCycle(new Date("2026-07-02T00:00:00Z"), 1);
  const late = monthlyCycle(new Date("2026-07-28T00:00:00Z"), 1);
  assert(early.elapsedFraction > 0 && early.elapsedFraction < 0.2);
  assert(late.elapsedFraction > 0.8 && late.elapsedFraction <= 1);
});

Deno.test("cycleFor dispatches on period", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  assertEquals(cycleFor("monthly", now, 1).key, monthlyCycle(now, 1).key);
  assertEquals(cycleFor("weekly", now, 1).key, weeklyCycle(now).key);
});

// --- Weekly key across the 2026/2027 year boundary ---------------------
// 2026-12-31 is a Thursday, so the boundary week runs Sat 2026-12-26 ->
// Sat 2027-01-02. This is the highest-risk path for the dedup key: it must
// stay STABLE across all days in that one week, and DIFFER from the next
// week, even though the week straddles a year change.

Deno.test("weeklyCycle: key is stable across the year-boundary week (mid-week vs start-of-week)", () => {
  const start = weeklyCycle(new Date("2026-12-26T00:00:00Z"));
  const midWeek = weeklyCycle(new Date("2026-12-31T23:00:00Z"));
  assertEquals(midWeek.key, start.key);
});

Deno.test("weeklyCycle: key differs between the boundary week and the following week", () => {
  const boundary = weeklyCycle(new Date("2026-12-26T00:00:00Z"));
  const nextWeek = weeklyCycle(new Date("2027-01-02T00:00:00Z"));
  assert(boundary.key !== nextWeek.key);
});

Deno.test("weeklyCycle: boundary week has exact start/end across the year change", () => {
  const boundary = weeklyCycle(new Date("2026-12-26T00:00:00Z"));
  assertEquals(boundary.start.toISOString(), "2026-12-26T00:00:00.000Z");
  assertEquals(boundary.end.toISOString(), "2027-01-02T00:00:00.000Z");
});

// --- monthlyCycle startDay clamping (1..28) -----------------------------
// startDay is clamped so every month has the day; these edge inputs must
// not throw and must behave exactly like the nearest clamp boundary.

Deno.test("monthlyCycle: startDay 0 behaves like startDay 1", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const zero = monthlyCycle(now, 0);
  const one = monthlyCycle(now, 1);
  assertEquals(zero.start.toISOString(), one.start.toISOString());
  assertEquals(zero.end.toISOString(), one.end.toISOString());
  assertEquals(zero.key, one.key);
  const d = zero.start.getUTCDate();
  assert(d >= 1 && d <= 28);
});

Deno.test("monthlyCycle: startDay NaN behaves like startDay 1", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const nan = monthlyCycle(now, NaN);
  const one = monthlyCycle(now, 1);
  assertEquals(nan.start.toISOString(), one.start.toISOString());
  assertEquals(nan.end.toISOString(), one.end.toISOString());
  assertEquals(nan.key, one.key);
  const d = nan.start.getUTCDate();
  assert(d >= 1 && d <= 28);
});

Deno.test("monthlyCycle: startDay -5 behaves like startDay 1", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const neg = monthlyCycle(now, -5);
  const one = monthlyCycle(now, 1);
  assertEquals(neg.start.toISOString(), one.start.toISOString());
  assertEquals(neg.end.toISOString(), one.end.toISOString());
  assertEquals(neg.key, one.key);
  const d = neg.start.getUTCDate();
  assert(d >= 1 && d <= 28);
});

Deno.test("monthlyCycle: startDay 31 behaves like startDay 28", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  const overMax = monthlyCycle(now, 31);
  const twentyEight = monthlyCycle(now, 28);
  assertEquals(overMax.start.toISOString(), twentyEight.start.toISOString());
  assertEquals(overMax.end.toISOString(), twentyEight.end.toISOString());
  assertEquals(overMax.key, twentyEight.key);
  const d = overMax.start.getUTCDate();
  assert(d >= 1 && d <= 28);
});

// --- monthlyCycle across the year boundary ------------------------------

Deno.test("monthlyCycle: December cycle rolls into the next year", () => {
  const c = monthlyCycle(new Date("2026-12-20T00:00:00Z"), 10);
  assertEquals(c.start.toISOString(), "2026-12-10T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2027-01-10T00:00:00.000Z");
  assertEquals(c.key, "2026-12");
});

Deno.test("monthlyCycle: January cycle rolls back into the previous year", () => {
  const c = monthlyCycle(new Date("2027-01-05T00:00:00Z"), 10);
  assertEquals(c.start.toISOString(), "2026-12-10T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2027-01-10T00:00:00.000Z");
  assertEquals(c.key, "2026-12");
});

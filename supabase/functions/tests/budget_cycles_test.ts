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

Deno.test("weekly key is year + ISO-ish week number and differs across weeks", () => {
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

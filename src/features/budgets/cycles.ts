// src/features/budgets/cycles.ts — CLIENT mirror of
// supabase/functions/_shared/budgetCycles.ts. The two MUST stay in sync.
//
// Why: the server (Edge Functions / scheduled jobs) computes budget cycle
// boundaries in strict UTC and uses them to decide when a cycle rolls over
// (e.g. to fire an "over budget" push notification for the outgoing cycle).
// If the client computed the same boundaries using LOCAL-time constructors
// instead, then for any timezone ahead of UTC (e.g. Egypt, UTC+2) the local
// calendar date runs ahead of the UTC date every day between local midnight
// and 02:00. During that window the client and server would pick DIFFERENT
// cycles — the Budgets screen could show a freshly-reset 0% bar for the new
// cycle while the server still sends a push about the cycle it thinks is
// still active (or vice versa). Computing in UTC here, exactly like the
// server, keeps the screen and the notifications in agreement.
//
// Keep this file's behaviour identical to budgetCycles.ts's monthlyCycle()/
// weeklyCycle() start-date math. If you change one, change the other and
// re-run both test suites.

/**
 * Start of the current monthly cycle (UTC), honoring the custom month-start
 * day. If `now` is before this month's start day (in UTC), the active cycle
 * began LAST month. `startDay` is clamped to 1..28 so every month has the day.
 */
export function monthlyCycleStart(now: Date, startDay: number): Date {
  const day = Math.min(28, Math.max(1, Math.floor(startDay) || 1));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startsThisMonth = now.getUTCDate() >= day;
  const targetMonth = startsThisMonth ? m : m - 1;
  return new Date(Date.UTC(y, targetMonth, day, 0, 0, 0, 0));
}

/** Start of the current week (UTC), starting Saturday (Egypt convention). */
export function weeklyCycleStart(now: Date): Date {
  // getUTCDay: 0=Sun .. 6=Sat. Days since the most recent Saturday.
  const back = (now.getUTCDay() + 1) % 7;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back, 0, 0, 0, 0));
}

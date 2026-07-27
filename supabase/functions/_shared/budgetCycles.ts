// Pure cycle math for budgets. All computation is in UTC: the server job runs
// in UTC and the app's amounts are date-stamped, not time-critical, so a fixed
// reference frame keeps cycle keys stable and testable.

export type Period = "monthly" | "weekly";

export interface Cycle {
  /** Inclusive start. */
  start: Date;
  /** Exclusive end. */
  end: Date;
  /** Stable dedup key: "2026-07" (monthly) or "2026-W29" (weekly). */
  key: string;
  /** How far through the cycle we are, 0..1. Used for pace projection. */
  elapsedFraction: number;
}

const DAY_MS = 86_400_000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

function elapsed(now: Date, start: Date, end: Date): number {
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 1;
  const done = (now.getTime() - start.getTime()) / span;
  return Math.min(1, Math.max(0, done));
}

/**
 * The monthly cycle containing `now`, starting on `startDay` of the month.
 * If `now` is before this month's start day, the active cycle began LAST month.
 * `startDay` is clamped to 1..28 so every month has the day.
 */
export function monthlyCycle(now: Date, startDay: number): Cycle {
  const day = Math.min(28, Math.max(1, Math.floor(startDay) || 1));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startsThisMonth = now.getUTCDate() >= day;
  const start = startsThisMonth ? utc(y, m, day) : utc(y, m - 1, day);
  const end = startsThisMonth ? utc(y, m + 1, day) : utc(y, m, day);
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, key, elapsedFraction: elapsed(now, start, end) };
}

/** The weekly cycle containing `now`, starting Saturday (Egypt convention). */
export function weeklyCycle(now: Date): Cycle {
  // getUTCDay: 0=Sun .. 6=Sat. Days since the most recent Saturday.
  const back = (now.getUTCDay() + 1) % 7;
  const start = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  // Week number = whole weeks since Jan 1 of the start's year, 1-based. This is
  // NOT ISO-8601 week numbering (no Thursday-majority / "week containing the
  // year's first Thursday" rule) — it's just an offset from Jan 1, so it will
  // disagree with ISO week numbers near year boundaries. That's fine here: the
  // key only needs to be stable within a week and unique across weeks, which it is.
  const jan1 = utc(start.getUTCFullYear(), 0, 1);
  const week = Math.floor((start.getTime() - jan1.getTime()) / (7 * DAY_MS)) + 1;
  const key = `${start.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  return { start, end, key, elapsedFraction: elapsed(now, start, end) };
}

export function cycleFor(period: Period, now: Date, startDay: number): Cycle {
  return period === "weekly" ? weeklyCycle(now) : monthlyCycle(now, startDay);
}

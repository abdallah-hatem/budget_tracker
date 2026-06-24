export interface MonthKey {
  year: number;
  /** 0-indexed, matching JS Date.getMonth() (0 = January). */
  month: number;
}

export interface MonthRange {
  /** Inclusive lower bound, ISO-8601 UTC. */
  from: string;
  /** Exclusive upper bound, ISO-8601 UTC. */
  to: string;
}

/** Default start-of-month day (calendar month: the 1st). */
export const DEFAULT_MONTH_START_DAY = 1;

function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month = last day of this month.
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Clamp a desired start day to a valid day for the given month (so 31 → 28/30
 *  for short months, i.e. "last day"). */
function clampStartDay(year: number, month: number, startDay: number): number {
  return Math.min(Math.max(1, Math.round(startDay)), daysInMonth(year, month));
}

/**
 * Half-open [from, to) UTC range for the FINANCIAL month labelled by `key`,
 * starting on `startDay`. With startDay=1 this is the plain calendar month. With
 * e.g. startDay=25, financial month {June} runs [Jun 25, Jul 25). The label is the
 * calendar month in which the period STARTS. startDay is clamped per-month so 31
 * means "last day" for shorter months.
 */
export function monthRange(key: MonthKey, startDay: number = DEFAULT_MONTH_START_DAY): MonthRange {
  const next = addMonth(key, 1);
  // LOCAL midnight (not UTC) -> .toISOString() yields the matching UTC instant, so
  // a financial month begins/ends at the user's local midnight. occurred_at is a
  // UTC instant; comparing it against these bounds buckets by the user's calendar.
  const from = new Date(key.year, key.month, clampStartDay(key.year, key.month, startDay));
  const to = new Date(next.year, next.month, clampStartDay(next.year, next.month, startDay));
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Shift a MonthKey by `delta` months, normalizing year rollover. */
export function addMonth(key: MonthKey, delta: number): MonthKey {
  const d = new Date(Date.UTC(key.year, key.month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/**
 * MonthKey for the FINANCIAL month containing `date`, given `startDay`. If the
 * day-of-month is before the start day, `date` belongs to the PREVIOUS financial
 * month (e.g. startDay=25, Jun 20 → May; Jun 26 → June).
 */
export function currentMonthKey(
  date: Date = new Date(),
  startDay: number = DEFAULT_MONTH_START_DAY,
): MonthKey {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const key = { year, month };
  return day >= clampStartDay(year, month, startDay) ? key : addMonth(key, -1);
}

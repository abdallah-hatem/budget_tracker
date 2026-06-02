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

/** Half-open [from, to) UTC range covering the given calendar month. */
export function monthRange(key: MonthKey): MonthRange {
  const from = new Date(Date.UTC(key.year, key.month, 1));
  const to = new Date(Date.UTC(key.year, key.month + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Shift a MonthKey by `delta` months, normalizing year rollover. */
export function addMonth(key: MonthKey, delta: number): MonthKey {
  const d = new Date(Date.UTC(key.year, key.month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** MonthKey for the month containing `date` (defaults to now). */
export function currentMonthKey(date: Date = new Date()): MonthKey {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

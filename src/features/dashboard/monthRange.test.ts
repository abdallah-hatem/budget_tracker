import { monthRange, currentMonthKey, addMonth, type MonthKey } from './monthRange';

// Boundaries are the user's LOCAL midnight, converted to a UTC instant. Build the
// expectation the same way so it's correct in any machine timezone.
const localMidnight = (y: number, m: number, d: number) => new Date(y, m, d).toISOString();

describe('monthRange', () => {
  it('produces a half-open range at LOCAL midnight for a normal month', () => {
    // June 2026 -> month index 5
    expect(monthRange({ year: 2026, month: 5 })).toEqual({
      from: localMidnight(2026, 5, 1),
      to: localMidnight(2026, 6, 1),
    });
  });

  it('rolls over to the next year in December', () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({
      from: localMidnight(2026, 11, 1),
      to: localMidnight(2027, 0, 1),
    });
  });
});

describe('addMonth', () => {
  it('advances forward across a year boundary', () => {
    expect(addMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });

  it('goes backward across a year boundary', () => {
    expect(addMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('currentMonthKey', () => {
  it('derives a MonthKey from a Date', () => {
    const key: MonthKey = currentMonthKey(new Date('2026-06-02T09:00:00.000Z'));
    expect(key).toEqual({ year: 2026, month: 5 });
  });
});

describe('custom start-of-month day', () => {
  it('monthRange runs startDay → startDay of next month', () => {
    // Financial June with startDay=25 → [Jun 25, Jul 25)
    expect(monthRange({ year: 2026, month: 5 }, 25)).toEqual({
      from: localMidnight(2026, 5, 25),
      to: localMidnight(2026, 6, 25),
    });
  });

  it('monthRange clamps startDay to the last day for short months (31 → Feb 28/29)', () => {
    // Financial Feb 2026 with startDay=31 → [Feb 28, Mar 31)
    expect(monthRange({ year: 2026, month: 1 }, 31)).toEqual({
      from: localMidnight(2026, 1, 28),
      to: localMidnight(2026, 2, 31),
    });
  });

  it('currentMonthKey: a date BEFORE the start day belongs to the previous month', () => {
    // startDay=25, Jun 20 → still in May's financial month
    expect(currentMonthKey(new Date('2026-06-20T09:00:00.000Z'), 25)).toEqual({ year: 2026, month: 4 });
  });

  it('currentMonthKey: a date ON/AFTER the start day belongs to the current month', () => {
    // startDay=25, Jun 26 → June's financial month
    expect(currentMonthKey(new Date('2026-06-26T09:00:00.000Z'), 25)).toEqual({ year: 2026, month: 5 });
  });

  it('currentMonthKey: start-of-year rollover (Jan 10, startDay=25 → previous Dec)', () => {
    expect(currentMonthKey(new Date('2026-01-10T09:00:00.000Z'), 25)).toEqual({ year: 2025, month: 11 });
  });
});

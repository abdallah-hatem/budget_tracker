import { monthRange, currentMonthKey, addMonth, type MonthKey } from './monthRange';

describe('monthRange', () => {
  it('produces a half-open UTC range for a normal month', () => {
    // June 2026 -> month index 5
    expect(monthRange({ year: 2026, month: 5 })).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    });
  });

  it('rolls over to the next year in December', () => {
    expect(monthRange({ year: 2026, month: 11 })).toEqual({
      from: '2026-12-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
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

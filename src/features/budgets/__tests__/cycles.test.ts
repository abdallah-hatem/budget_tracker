import { monthlyCycleStart, weeklyCycleStart } from '../cycles';

describe('monthlyCycleStart', () => {
  it('startDay before today -> cycle began this month (UTC)', () => {
    const d = monthlyCycleStart(new Date('2026-07-20T00:00:00Z'), 10);
    expect(d.toISOString()).toBe('2026-07-10T00:00:00.000Z');
  });

  it('startDay after today -> cycle began last month (UTC)', () => {
    const d = monthlyCycleStart(new Date('2026-07-05T00:00:00Z'), 10);
    expect(d.toISOString()).toBe('2026-06-10T00:00:00.000Z');
  });

  it('year rollover: January before startDay -> previous December', () => {
    const d = monthlyCycleStart(new Date('2027-01-05T00:00:00Z'), 10);
    expect(d.toISOString()).toBe('2026-12-10T00:00:00.000Z');
  });

  describe('startDay clamping', () => {
    const now = new Date('2026-07-15T00:00:00Z');

    it('0 behaves like 1', () => {
      expect(monthlyCycleStart(now, 0).toISOString()).toBe(
        monthlyCycleStart(now, 1).toISOString(),
      );
    });

    it('NaN behaves like 1', () => {
      expect(monthlyCycleStart(now, NaN).toISOString()).toBe(
        monthlyCycleStart(now, 1).toISOString(),
      );
    });

    it('31 behaves like 28', () => {
      expect(monthlyCycleStart(now, 31).toISOString()).toBe(
        monthlyCycleStart(now, 28).toISOString(),
      );
    });
  });
});

describe('weeklyCycleStart', () => {
  it('Wednesday -> preceding Saturday (UTC)', () => {
    const d = weeklyCycleStart(new Date('2026-07-15T12:00:00Z'));
    expect(d.getUTCDay()).toBe(6);
    expect(d.toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });

  it('on a Saturday, the cycle starts that day', () => {
    const d = weeklyCycleStart(new Date('2026-07-11T09:00:00Z'));
    expect(d.toISOString()).toBe('2026-07-11T00:00:00.000Z');
  });

  // --- The regression test for the critical bug being fixed -------------
  // 2026-07-11T00:30:00+02:00 is Saturday in Egypt LOCAL time, but it is
  // still 2026-07-10T22:30:00Z — Friday — in UTC. This is exactly the
  // 00:00-02:00 "danger window" for UTC+2 where local-time cycle math and
  // UTC cycle math disagree on the calendar date.
  //
  // A LOCAL-time implementation (new Date(y, m, d), getDay(), setHours) would
  // see "Saturday 2026-07-11" and treat THAT as the start of the new week,
  // wrongly returning 2026-07-11T00:00:00 in that local reckoning. That is
  // precisely the client/server divergence this fix eliminates: the server
  // (strict UTC) still considers the previous week active until UTC actually
  // reaches Saturday, so it would compute the preceding Saturday, 2026-07-04.
  // The client must agree with the server, not with the local wall clock.
  it('UTC+2 danger window: still Friday in UTC -> preceding Saturday, NOT the local-time Saturday', () => {
    const instant = new Date('2026-07-11T00:30:00+02:00');
    expect(instant.toISOString()).toBe('2026-07-10T22:30:00.000Z');

    const d = weeklyCycleStart(instant);
    expect(d.toISOString()).toBe('2026-07-04T00:00:00.000Z');
    expect(d.toISOString()).not.toBe('2026-07-11T00:00:00.000Z');
  });
});

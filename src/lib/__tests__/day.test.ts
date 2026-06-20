import { localDayKey } from '../day';

describe('localDayKey', () => {
  it('returns the LOCAL calendar day of an instant, not the UTC day', () => {
    // 00:30 local just after midnight. Build it locally so the test holds in any TZ.
    const justAfterMidnight = new Date(2026, 5, 20, 0, 30, 0); // Jun 20, 00:30 local
    expect(localDayKey(justAfterMidnight)).toBe('2026-06-20');
    // In a UTC+offset zone the UTC date would be Jun 19 — make sure we don't use it.
    if (justAfterMidnight.getTimezoneOffset() < 0) {
      expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-06-19');
    }
  });

  it('zero-pads month and day', () => {
    expect(localDayKey(new Date(2026, 0, 3, 12, 0, 0))).toBe('2026-01-03');
  });

  it('accepts an ISO string', () => {
    const iso = new Date(2026, 5, 20, 9, 0, 0).toISOString();
    expect(localDayKey(iso)).toBe('2026-06-20');
  });
});

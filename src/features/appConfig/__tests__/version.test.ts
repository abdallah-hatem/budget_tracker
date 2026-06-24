import { parseVersion, isUpdateRequired } from '../version';

describe('parseVersion', () => {
  it('parses x.y.z', () => expect(parseVersion('1.2.3')).toEqual([1, 2, 3]));
  it('ignores suffixes', () => expect(parseVersion('1.2.3-beta')).toEqual([1, 2, 3]));
  it('returns null for junk/empty', () => {
    expect(parseVersion('')).toBeNull();
    expect(parseVersion(null)).toBeNull();
    expect(parseVersion('abc')).toBeNull();
  });
});

describe('isUpdateRequired', () => {
  it('blocks when installed < min', () => {
    expect(isUpdateRequired('1.1.1', '1.2.0')).toBe(true);
    expect(isUpdateRequired('1.1.9', '1.2.0')).toBe(true);
    expect(isUpdateRequired('0.9.0', '1.0.0')).toBe(true);
  });
  it('allows when installed >= min', () => {
    expect(isUpdateRequired('1.2.0', '1.2.0')).toBe(false);
    expect(isUpdateRequired('1.3.0', '1.2.0')).toBe(false);
    expect(isUpdateRequired('2.0.0', '1.9.9')).toBe(false);
  });
  it('fails open on missing/invalid versions', () => {
    expect(isUpdateRequired(null, '1.2.0')).toBe(false);
    expect(isUpdateRequired('1.1.1', null)).toBe(false);
    expect(isUpdateRequired('', '')).toBe(false);
    expect(isUpdateRequired('garbage', '1.0.0')).toBe(false);
  });
});

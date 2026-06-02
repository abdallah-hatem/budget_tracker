import { redirectTarget } from '@/src/features/auth/redirectTarget';

describe('redirectTarget', () => {
  it('returns null while loading (no decision yet)', () => {
    expect(redirectTarget({ loading: true, hasSession: false, inAuthGroup: false })).toBeNull();
    expect(redirectTarget({ loading: true, hasSession: true, inAuthGroup: true })).toBeNull();
  });

  it('sends an unauthenticated user out of a protected group to sign-in', () => {
    expect(
      redirectTarget({ loading: false, hasSession: false, inAuthGroup: false }),
    ).toBe('/(auth)/sign-in');
  });

  it('leaves an unauthenticated user already in the auth group alone', () => {
    expect(
      redirectTarget({ loading: false, hasSession: false, inAuthGroup: true }),
    ).toBeNull();
  });

  it('sends an authenticated user sitting on an auth screen into the tabs', () => {
    expect(
      redirectTarget({ loading: false, hasSession: true, inAuthGroup: true }),
    ).toBe('/(tabs)');
  });

  it('leaves an authenticated user already inside the app alone', () => {
    expect(
      redirectTarget({ loading: false, hasSession: true, inAuthGroup: false }),
    ).toBeNull();
  });
});

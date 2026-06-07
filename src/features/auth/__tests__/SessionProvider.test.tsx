import React from 'react';
import { Text } from 'react-native';
import { render, screen, waitFor } from '@testing-library/react-native';
import { SessionProvider, useSession } from '@/src/features/auth/SessionProvider';

// ---- Mock the supabase client module ----
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();
const mockUnsubscribe = jest.fn();
const mockProfileMaybeSingle = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: (...args: unknown[]) => mockSignOut(...args),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: unknown[]) => mockProfileMaybeSingle(...args),
        }),
      }),
    }),
  },
}));

function Probe() {
  const { loading, user, profile, session } = useSession();
  return (
    <>
      <Text testID="loading">{String(loading)}</Text>
      <Text testID="email">{user?.email ?? 'none'}</Text>
      <Text testID="locale">{profile?.locale ?? 'none'}</Text>
      <Text testID="hasSession">{String(!!session)}</Text>
    </>
  );
}

const fakeSession = {
  user: { id: 'user-1', email: 'a@b.com' },
  access_token: 'tok',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  });
  mockSignOut.mockResolvedValue({ error: null });
});

it('starts loading then resolves to no session', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

  expect(screen.getByTestId('loading').props.children).toBe('true');

  await waitFor(() => {
    expect(screen.getByTestId('loading').props.children).toBe('false');
  });
  expect(screen.getByTestId('email').props.children).toBe('none');
  expect(screen.getByTestId('hasSession').props.children).toBe('false');
});

it('loads the session user and the profile row', async () => {
  mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });
  mockProfileMaybeSingle.mockResolvedValue({
    data: { id: 'user-1', display_name: 'A', locale: 'ar', currency: 'EGP' },
    error: null,
  });

  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

  await waitFor(() => {
    expect(screen.getByTestId('loading').props.children).toBe('false');
  });
  expect(screen.getByTestId('email').props.children).toBe('a@b.com');
  expect(screen.getByTestId('locale').props.children).toBe('ar');
  expect(screen.getByTestId('hasSession').props.children).toBe('true');
});

it('refuses a soft-deleted account and signs it out', async () => {
  mockGetSession.mockResolvedValue({ data: { session: fakeSession }, error: null });
  mockProfileMaybeSingle.mockResolvedValue({
    data: {
      id: 'user-1',
      display_name: 'A',
      locale: 'ar',
      currency: 'EGP',
      deleted_at: '2026-06-07T00:00:00.000Z',
    },
    error: null,
  });

  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

  await waitFor(() => {
    expect(screen.getByTestId('loading').props.children).toBe('false');
  });
  // The session is refused (no user, no session) and a sign-out is triggered.
  expect(screen.getByTestId('hasSession').props.children).toBe('false');
  expect(screen.getByTestId('email').props.children).toBe('none');
  expect(mockSignOut).toHaveBeenCalled();
});

it('subscribes to auth changes and unsubscribes on unmount', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  const { unmount } = render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(mockOnAuthStateChange).toHaveBeenCalled());
  unmount();
  expect(mockUnsubscribe).toHaveBeenCalled();
});

import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import Settings from '../settings';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../../src/features/auth/account', () => ({
  softDeleteOwnAccount: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../src/features/ingest/api', () => ({
  createIngestToken: jest.fn(),
  revokeIngestTokens: jest.fn(),
  hasActiveIngestToken: jest.fn(),
  storeIngestToken: jest.fn(),
  clearStoredIngestToken: jest.fn(),
}));

jest.mock('../../../src/features/accounts/api', () => ({
  listAccountBalances: jest.fn(),
  createAccount: jest.fn(),
  updateAccount: jest.fn(),
  setDefaultAccount: jest.fn(),
  deleteAccount: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

// Supabase mock (used by locale setter / sign out — not exercised here)
jest.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: jest.fn(() => ({ eq: jest.fn().mockResolvedValue({}) })),
    })),
    auth: {
      signOut: jest.fn().mockResolvedValue({}),
    },
  },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { useSession } from '../../../src/features/auth/SessionProvider';
import { softDeleteOwnAccount } from '../../../src/features/auth/account';
import {
  createIngestToken,
  revokeIngestTokens,
  hasActiveIngestToken,
} from '../../../src/features/ingest/api';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../../src/lib/supabase';
import {
  listAccountBalances,
  createAccount,
  setDefaultAccount,
} from '../../../src/features/accounts/api';

const mockSignOut = supabase.auth.signOut as jest.Mock;
const mockSoftDelete = softDeleteOwnAccount as jest.Mock;

const mockSession = useSession as jest.Mock;
const mockCreate = createIngestToken as jest.Mock;
const mockRevoke = revokeIngestTokens as jest.Mock;
const mockHasToken = hasActiveIngestToken as jest.Mock;
const mockClipboard = Clipboard.setStringAsync as jest.Mock;
const mockListAccounts = listAccountBalances as jest.Mock;
const mockCreateAccount = createAccount as jest.Mock;
const mockSetDefault = setDefaultAccount as jest.Mock;

const acctBal = (over: Record<string, unknown>) => ({
  id: 'a', user_id: 'u1', name: 'Main', opening_balance: 0,
  is_default: true, currency: 'EGP', created_at: '', balance: 0, ...over,
});

function setupSession(locale: 'en' | 'ar' = 'en') {
  mockSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1', email: 'test@example.com' },
    profile: { id: 'u1', locale, display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  setupSession();
  // Default: no active token
  mockHasToken.mockResolvedValue(false);
  mockCreate.mockResolvedValue('test-raw-token-abc123');
  mockRevoke.mockResolvedValue(undefined);
  // Default: one default 'Main' account
  mockListAccounts.mockResolvedValue([acctBal({ id: 'a', name: 'Main', is_default: true, balance: 100000 })]);
  mockCreateAccount.mockResolvedValue({ id: 'new' });
  mockSetDefault.mockResolvedValue(undefined);
});

describe('Settings screen — existing settings', () => {
  it('renders email', async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('settings-email')).toBeTruthy());
    expect(screen.getByText('test@example.com')).toBeTruthy();
  });

  it('renders locale toggles', async () => {
    render(<Settings />);
    fireEvent.press(screen.getByTestId('section-language')); // expand the section
    expect(screen.getByTestId('locale-en')).toBeTruthy();
    expect(screen.getByTestId('locale-ar')).toBeTruthy();
  });

  it('renders sign-out button', async () => {
    render(<Settings />);
    expect(screen.getByTestId('sign-out')).toBeTruthy();
  });

  it('renders delete-account button', async () => {
    render(<Settings />);
    expect(screen.getByTestId('delete-account')).toBeTruthy();
  });
});

describe('Settings screen — delete account', () => {
  it('soft-deletes only after confirming the destructive dialog', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<Settings />);

    fireEvent.press(screen.getByTestId('delete-account'));

    // Confirm dialog shown; nothing deleted yet.
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockSoftDelete).not.toHaveBeenCalled();

    const buttons = (alertSpy.mock.calls[0][2] ?? []) as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const confirm = buttons.find((b) => b.style === 'destructive');
    await act(async () => {
      confirm?.onPress?.();
    });

    expect(mockSoftDelete).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('does NOT delete when cancelled', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<Settings />);

    fireEvent.press(screen.getByTestId('delete-account'));
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as Array<{ style?: string }>;
    expect(buttons.find((b) => b.style === 'cancel')).toBeTruthy();
    expect(mockSoftDelete).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('Settings screen — sign out confirmation', () => {
  it('asks for confirmation and signs out only after confirming', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<Settings />);

    fireEvent.press(screen.getByTestId('sign-out'));

    // The confirm dialog is shown; sign-out has NOT happened yet.
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(mockSignOut).not.toHaveBeenCalled();

    // Invoke the destructive "Sign out" button from the alert config.
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as Array<{
      style?: string;
      onPress?: () => void;
    }>;
    const confirm = buttons.find((b) => b.style === 'destructive');
    await act(async () => {
      confirm?.onPress?.();
    });

    expect(mockSignOut).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('does NOT sign out when cancelled', () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    render(<Settings />);

    fireEvent.press(screen.getByTestId('sign-out'));
    const buttons = (alertSpy.mock.calls[0][2] ?? []) as Array<{ style?: string }>;
    const cancel = buttons.find((b) => b.style === 'cancel');

    expect(cancel).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('Settings screen — Accounts', () => {
  it('lists the user accounts', async () => {
    render(<Settings />);
    fireEvent.press(screen.getByTestId('section-accounts')); // expand the section
    expect(await screen.findByTestId('account-row-a')).toBeTruthy();
    expect(screen.getByText('Main')).toBeTruthy();
  });

  it('creates a new account from the inline form', async () => {
    render(<Settings />);
    fireEvent.press(screen.getByTestId('section-accounts')); // expand the section
    await screen.findByTestId('account-row-a');

    fireEvent.press(screen.getByTestId('accounts-add'));
    fireEvent.changeText(screen.getByTestId('account-name-input'), 'Bank');
    fireEvent.changeText(screen.getByTestId('account-balance-input'), '100000');

    await act(async () => {
      fireEvent.press(screen.getByTestId('account-create-submit'));
    });

    await waitFor(() =>
      expect(mockCreateAccount).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Bank', opening_balance: 100000 }),
      ),
    );
  });
});


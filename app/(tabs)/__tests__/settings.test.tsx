import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import Settings from '../settings';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({}));

jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

jest.mock('../../../src/features/ingest/api', () => ({
  createIngestToken: jest.fn(),
  revokeIngestTokens: jest.fn(),
  hasActiveIngestToken: jest.fn(),
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
import {
  createIngestToken,
  revokeIngestTokens,
  hasActiveIngestToken,
} from '../../../src/features/ingest/api';
import * as Clipboard from 'expo-clipboard';
import {
  listAccountBalances,
  createAccount,
  setDefaultAccount,
} from '../../../src/features/accounts/api';

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
    expect(screen.getByTestId('locale-en')).toBeTruthy();
    expect(screen.getByTestId('locale-ar')).toBeTruthy();
  });

  it('renders sign-out button', async () => {
    render(<Settings />);
    expect(screen.getByTestId('sign-out')).toBeTruthy();
  });
});

describe('Settings screen — Accounts', () => {
  it('lists the user accounts', async () => {
    render(<Settings />);
    expect(await screen.findByTestId('account-row-a')).toBeTruthy();
    expect(screen.getByText('Main')).toBeTruthy();
  });

  it('creates a new account from the inline form', async () => {
    render(<Settings />);
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

describe('Settings screen — Generate token (no active token)', () => {
  it('shows the Generate button when hasActiveIngestToken resolves false', async () => {
    mockHasToken.mockResolvedValue(false);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());
    // Should NOT show regen/revoke yet
    expect(screen.queryByTestId('regen-token')).toBeNull();
    expect(screen.queryByTestId('revoke-token')).toBeNull();
  });

  it('calls createIngestToken on Generate press and shows token-value box', async () => {
    mockHasToken.mockResolvedValue(false);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('gen-token'));
    });

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('token-value')).toBeTruthy());
    expect(screen.getByText('test-raw-token-abc123')).toBeTruthy();
  });

  it('shows the token_shown_once warning after generate', async () => {
    mockHasToken.mockResolvedValue(false);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('gen-token'));
    });

    await waitFor(() =>
      expect(
        screen.getByText("Copy this token now — it won't be shown again."),
      ).toBeTruthy(),
    );
  });

  it('Copy button calls Clipboard.setStringAsync with the token', async () => {
    mockHasToken.mockResolvedValue(false);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('gen-token'));
    });

    await waitFor(() => expect(screen.getByTestId('copy-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('copy-token'));
    });

    await waitFor(() =>
      expect(mockClipboard).toHaveBeenCalledWith('test-raw-token-abc123'),
    );
  });

  it('shows Regenerate + Revoke after token is generated', async () => {
    mockHasToken.mockResolvedValue(false);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('gen-token'));
    });

    await waitFor(() => expect(screen.getByTestId('regen-token')).toBeTruthy());
    expect(screen.getByTestId('revoke-token')).toBeTruthy();
  });
});

describe('Settings screen — Regenerate + Revoke (active token)', () => {
  it('shows Regenerate and Revoke when hasActiveIngestToken resolves true', async () => {
    mockHasToken.mockResolvedValue(true);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('regen-token')).toBeTruthy());
    expect(screen.getByTestId('revoke-token')).toBeTruthy();
    expect(screen.queryByTestId('gen-token')).toBeNull();
  });

  it('Regenerate calls createIngestToken and shows new token once', async () => {
    mockHasToken.mockResolvedValue(true);
    mockCreate.mockResolvedValue('new-token-xyz');
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('regen-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('regen-token'));
    });

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('token-value')).toBeTruthy());
    expect(screen.getByText('new-token-xyz')).toBeTruthy();
  });

  it('Revoke calls revokeIngestTokens and shows Generate button', async () => {
    mockHasToken.mockResolvedValue(true);
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('revoke-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('revoke-token'));
    });

    await waitFor(() => expect(mockRevoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());
  });
});

describe('Settings screen — Token error handling', () => {
  it('shows token-error when createIngestToken rejects', async () => {
    mockHasToken.mockResolvedValue(false);
    mockCreate.mockRejectedValue(new Error('Network error'));
    render(<Settings />);
    await waitFor(() => expect(screen.getByTestId('gen-token')).toBeTruthy());

    await act(async () => {
      fireEvent.press(screen.getByTestId('gen-token'));
    });

    await waitFor(() => expect(screen.getByTestId('token-error')).toBeTruthy());
    expect(screen.getByText('Network error')).toBeTruthy();
  });
});

describe('Settings screen — iOS Shortcut guide', () => {
  it('renders the shortcut-guide-toggle button', async () => {
    render(<Settings />);
    expect(screen.getByTestId('shortcut-guide-toggle')).toBeTruthy();
  });

  it('guide is collapsed by default', async () => {
    render(<Settings />);
    // Guide content not shown before toggle
    expect(screen.queryByText(/functions\/v1\/ingest-sms/)).toBeNull();
  });

  it('expands and shows ingest-sms URL when toggled', async () => {
    render(<Settings />);
    fireEvent.press(screen.getByTestId('shortcut-guide-toggle'));
    await waitFor(() =>
      expect(screen.getByText(/functions\/v1\/ingest-sms/)).toBeTruthy(),
    );
  });

  it('copies the ingest URL from the guide', async () => {
    render(<Settings />);
    fireEvent.press(screen.getByTestId('shortcut-guide-toggle'));
    await waitFor(() => expect(screen.getByTestId('copy-url')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('copy-url'));
    });
    await waitFor(() =>
      expect(mockClipboard).toHaveBeenCalledWith(
        expect.stringContaining('/functions/v1/ingest-sms'),
      ),
    );
  });

  it('copies the JSON request body from the guide', async () => {
    render(<Settings />);
    fireEvent.press(screen.getByTestId('shortcut-guide-toggle'));
    await waitFor(() => expect(screen.getByTestId('copy-body')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('copy-body'));
    });
    await waitFor(() =>
      expect(mockClipboard).toHaveBeenCalledWith(
        expect.stringContaining('"token"'),
      ),
    );
  });
});

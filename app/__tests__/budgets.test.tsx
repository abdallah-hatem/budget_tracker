import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import BudgetsScreen from '../budgets';
import { t } from '@/src/lib/i18n';
import type { BudgetProgress } from '@/src/features/budgets/types';

// C2 regression coverage: "Save" used to silently no-op when createBudget
// rejected (e.g. the 23505 unique-violation raised for a duplicate
// scope/category/period budget) because onSave's try/finally had no catch.
// These tests prove the failure is now surfaced instead of swallowed.

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('@/src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));

jest.mock('@/src/features/budgets/useBudgets', () => ({
  useBudgets: jest.fn(),
}));

jest.mock('@/src/features/budgets/api', () => ({
  createBudget: jest.fn(),
  deleteBudget: jest.fn(),
}));

import { useSession } from '@/src/features/auth/SessionProvider';
import { useBudgets } from '@/src/features/budgets/useBudgets';
import { createBudget, deleteBudget } from '@/src/features/budgets/api';

const mockUseSession = useSession as jest.Mock;
const mockUseBudgets = useBudgets as jest.Mock;
const mockCreateBudget = createBudget as jest.Mock;
const mockDeleteBudget = deleteBudget as jest.Mock;

const noopRefresh = jest.fn().mockResolvedValue(undefined);

function existingRow(id: string): BudgetProgress {
  return {
    budget: {
      id,
      user_id: 'u1',
      scope: 'category',
      category_slug: 'food',
      period: 'monthly',
      amount: 1000,
      warn_pct: 80,
    },
    spent: 100,
    pct: 10,
    remaining: 900,
    tone: 'ok',
  };
}

beforeEach(() => {
  mockCreateBudget.mockReset();
  mockDeleteBudget.mockReset();
  noopRefresh.mockClear().mockResolvedValue(undefined);
  mockUseSession.mockReturnValue({
    session: { user: { id: 'u1' } },
    user: { id: 'u1' },
    profile: { id: 'u1', locale: 'en', display_name: 'Test', currency: 'EGP' },
    loading: false,
  });
  mockUseBudgets.mockReturnValue({
    progress: [existingRow('b1')],
    loading: false,
    refresh: noopRefresh,
  });
});

async function openFormAndFillAmount() {
  fireEvent.press(screen.getByTestId('budgets-add'));
  fireEvent.changeText(screen.getByTestId('budget-amount-input'), '500');
}

describe('BudgetsScreen — save/delete error surfacing (C2)', () => {
  it('shows the friendly duplicate-budget message when createBudget rejects with a 23505 unique violation', async () => {
    mockCreateBudget.mockRejectedValueOnce(
      new Error(
        'duplicate key value violates unique constraint "budgets_unique_target_idx" (23505)',
      ),
    );

    render(<BudgetsScreen />);
    await openFormAndFillAmount();
    fireEvent.press(screen.getByTestId('budget-save'));

    await waitFor(() =>
      expect(screen.getByTestId('budget-form-error')).toHaveTextContent(
        t('budgets.error.duplicate', 'en'),
      ),
    );
    // The failure must be visible, not a silent no-op — refresh() must NOT be
    // called since the save never actually succeeded.
    expect(noopRefresh).not.toHaveBeenCalled();
  });

  it('shows a generic failure message for any other createBudget error', async () => {
    mockCreateBudget.mockRejectedValueOnce(new Error('network error'));

    render(<BudgetsScreen />);
    await openFormAndFillAmount();
    fireEvent.press(screen.getByTestId('budget-save'));

    await waitFor(() =>
      expect(screen.getByTestId('budget-form-error')).toHaveTextContent(
        t('budgets.error.save_failed', 'en'),
      ),
    );
  });

  it('clears the error once the user edits the form again', async () => {
    mockCreateBudget.mockRejectedValueOnce(new Error('duplicate key value violates 23505'));

    render(<BudgetsScreen />);
    await openFormAndFillAmount();
    fireEvent.press(screen.getByTestId('budget-save'));
    await waitFor(() => expect(screen.getByTestId('budget-form-error')).toBeTruthy());

    fireEvent.changeText(screen.getByTestId('budget-amount-input'), '600');
    expect(screen.queryByTestId('budget-form-error')).toBeNull();
  });

  it('shows a friendly message when deleteBudget rejects, instead of failing silently', async () => {
    mockDeleteBudget.mockRejectedValueOnce(new Error('network error'));

    render(<BudgetsScreen />);
    fireEvent.press(screen.getByTestId('budget-delete-b1'));

    await waitFor(() =>
      expect(screen.getByTestId('budget-form-error')).toHaveTextContent(
        t('budgets.error.delete_failed', 'en'),
      ),
    );
  });
});

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { BudgetSummaryCard } from '../BudgetSummaryCard';
import type { Budget, BudgetProgress } from '../types';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../useBudgets', () => ({
  useBudgets: jest.fn(),
}));

import { useBudgets } from '../useBudgets';

const mockUseBudgets = useBudgets as jest.Mock;

function budget(over: Partial<Budget> = {}): Budget {
  return {
    id: over.id ?? 'b1',
    user_id: 'u1',
    scope: over.scope ?? 'category',
    category_slug: over.category_slug ?? 'food',
    period: over.period ?? 'monthly',
    amount: over.amount ?? 1000,
    warn_pct: over.warn_pct ?? 80,
  };
}

function prog(
  over: Partial<Omit<BudgetProgress, 'budget'>> & { budget?: Partial<Budget> } = {},
): BudgetProgress {
  const b = budget(over.budget);
  return {
    budget: b,
    spent: over.spent ?? 100,
    pct: over.pct ?? 10,
    remaining: over.remaining ?? b.amount - (over.spent ?? 100),
    tone: over.tone ?? 'ok',
  };
}

beforeEach(() => {
  mockPush.mockReset();
  mockUseBudgets.mockReset();
});

describe('BudgetSummaryCard', () => {
  it('renders nothing when the user has no budgets', () => {
    mockUseBudgets.mockReturnValue({ progress: [], loading: false, refresh: jest.fn() });
    render(<BudgetSummaryCard locale="en" />);
    expect(screen.queryByTestId('budget-summary-card')).toBeNull();
  });

  it('renders nothing while loading', () => {
    mockUseBudgets.mockReturnValue({
      progress: [prog({ budget: { id: 'b1' }, tone: 'over', pct: 150 })],
      loading: true,
      refresh: jest.fn(),
    });
    render(<BudgetSummaryCard locale="en" />);
    expect(screen.queryByTestId('budget-summary-card')).toBeNull();
  });

  // Regression test for the "card disappears when the user is doing well" bug:
  // category-only budgets, all healthy (tone 'ok'), no overall budget. Under
  // the old logic (`rows = atRisk(progress, 2)` with no fallback) this list
  // would be empty and the component would bail out with `null`.
  it('renders with at least one bar for healthy category-only budgets', () => {
    mockUseBudgets.mockReturnValue({
      progress: [
        prog({ budget: { id: 'b1', category_slug: 'food' }, tone: 'ok', pct: 20 }),
        prog({ budget: { id: 'b2', category_slug: 'transport' }, tone: 'ok', pct: 45 }),
      ],
      loading: false,
      refresh: jest.fn(),
    });
    render(<BudgetSummaryCard locale="en" />);
    expect(screen.getByTestId('budget-summary-card')).toBeTruthy();
    // Falls back to the most-used budgets, highest pct first — transport (45%) wins.
    expect(screen.getByTestId('budget-summary-row-b2')).toBeTruthy();
  });

  it('shows the overall budget plus an at-risk category, without duplicating overall', () => {
    mockUseBudgets.mockReturnValue({
      progress: [
        prog({ budget: { id: 'overall', scope: 'overall', category_slug: null }, tone: 'ok', pct: 30 }),
        prog({ budget: { id: 'b1', category_slug: 'food' }, tone: 'over', pct: 120 }),
        prog({ budget: { id: 'b2', category_slug: 'transport' }, tone: 'ok', pct: 10 }),
      ],
      loading: false,
      refresh: jest.fn(),
    });
    render(<BudgetSummaryCard locale="en" />);
    expect(screen.getByTestId('budget-summary-row-overall')).toBeTruthy();
    expect(screen.getByTestId('budget-summary-row-b1')).toBeTruthy();
    expect(screen.queryByTestId('budget-summary-row-b2')).toBeNull();
    // Overall must appear exactly once (never duplicated inside the rows list).
    expect(screen.getAllByTestId('budget-summary-row-overall')).toHaveLength(1);
  });

  it('navigates to /budgets on tap', () => {
    mockUseBudgets.mockReturnValue({
      progress: [prog({ budget: { id: 'b1' }, tone: 'ok', pct: 20 })],
      loading: false,
      refresh: jest.fn(),
    });
    render(<BudgetSummaryCard locale="en" />);
    fireEvent.press(screen.getByTestId('budget-summary-card'));
    expect(mockPush).toHaveBeenCalledWith('/budgets');
  });
});

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { EditTransactionSheet } from './EditTransactionSheet';
import type { Transaction } from '../../types';

jest.mock('./api', () => ({
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
}));
jest.mock('../accounts/api', () => ({
  listAccountBalances: jest.fn().mockResolvedValue([]),
}));
import { updateTransaction, deleteTransaction } from './api';
import { listAccountBalances } from '../accounts/api';
const mockUpdate = updateTransaction as jest.MockedFunction<typeof updateTransaction>;
const mockDelete = deleteTransaction as jest.MockedFunction<typeof deleteTransaction>;
const mockListAccounts = listAccountBalances as jest.MockedFunction<typeof listAccountBalances>;

const acctBal = (over: Record<string, unknown>) => ({
  id: 'a', user_id: 'u1', name: 'Main', opening_balance: 0,
  is_default: true, currency: 'EGP', created_at: '', balance: 0, ...over,
}) as any;

const txn: Transaction = {
  id: 't1',
  user_id: 'u1',
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  raw_text: null,
  source: 'text',
  status: 'confirmed',
  confidence: null,
  occurred_at: '2026-06-10T00:00:00.000Z',
  account_id: null,
  created_at: '2026-06-10T00:00:00.000Z',
};

describe('EditTransactionSheet', () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockDelete.mockReset();
    mockListAccounts.mockReset();
    mockListAccounts.mockResolvedValue([]);
  });

  it('shows an account chip per account and saves the chosen account_id', async () => {
    mockListAccounts.mockResolvedValueOnce([
      acctBal({ id: 'a', name: 'Main', is_default: true }),
      acctBal({ id: 'b', name: 'Bank', is_default: false, balance: 100000 }),
    ]);
    mockUpdate.mockResolvedValueOnce({ ...txn });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />,
    );

    fireEvent.press(await screen.findByTestId('edit-account-b'));
    fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ account_id: 'b' })),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('saves an edited amount via updateTransaction then calls onDone', async () => {
    mockUpdate.mockResolvedValueOnce({ ...txn, amount: 75 });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );

    fireEvent.changeText(screen.getByTestId('edit-amount'), '75');
    fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ amount: 75 })));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('includes occurred_at in the save patch (date/time is editable)', async () => {
    mockUpdate.mockResolvedValueOnce(txn);
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={jest.fn()} onCancel={jest.fn()} />
    );

    fireEvent.press(screen.getByTestId('edit-save'));

    // Unchanged → it round-trips the transaction's own timestamp.
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ occurred_at: '2026-06-10T00:00:00.000Z' }),
      ),
    );
  });

  it('deletes via deleteTransaction then calls onDone', async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );

    fireEvent.press(screen.getByTestId('edit-delete'));

    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('t1'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('cancel calls onCancel without touching the api', () => {
    const onCancel = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={jest.fn()} onCancel={onCancel} />
    );
    fireEvent.press(screen.getByTestId('edit-cancel'));
    expect(onCancel).toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('shows error and does NOT call updateTransaction when amount is blank', async () => {
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );
    fireEvent.changeText(screen.getByTestId('edit-amount'), '');
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toBeTruthy());
    expect(screen.getByTestId('edit-error').props.children).toBe('Enter an amount greater than 0');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows error and does NOT call updateTransaction when amount is zero', async () => {
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );
    fireEvent.changeText(screen.getByTestId('edit-amount'), '0');
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toBeTruthy());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('includes status:confirmed in patch when confirmOnSave is true', async () => {
    mockUpdate.mockResolvedValueOnce({ ...txn, status: 'confirmed' });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet
        transaction={txn}
        locale="en"
        onDone={onDone}
        onCancel={jest.fn()}
        confirmOnSave
      />
    );

    fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ status: 'confirmed' }),
      ),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('does NOT include status in patch when confirmOnSave is false (default)', async () => {
    mockUpdate.mockResolvedValueOnce({ ...txn });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );

    fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    const patch = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('status');
  });

  it('with showConfirm: Save keeps status (item stays pending)', async () => {
    mockUpdate.mockResolvedValueOnce({ ...txn });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet
        transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} showConfirm
      />
    );
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockUpdate.mock.calls[0][1]).not.toHaveProperty('status');
  });

  it('with showConfirm: Confirm saves edits AND sets status:confirmed', async () => {
    mockUpdate.mockResolvedValueOnce({ ...txn, status: 'confirmed' });
    const onDone = jest.fn();
    render(
      <EditTransactionSheet
        transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} showConfirm
      />
    );
    fireEvent.press(screen.getByTestId('edit-confirm'));
    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        't1',
        expect.objectContaining({ status: 'confirmed' }),
      ),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it('shows error message and does NOT call onDone when updateTransaction rejects', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('DB error: amount > 0'));
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toBeTruthy());
    expect(screen.getByTestId('edit-error').props.children).toBe('DB error: amount > 0');
    expect(onDone).not.toHaveBeenCalled();
  });
});

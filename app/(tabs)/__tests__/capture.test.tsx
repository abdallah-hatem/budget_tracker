import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CaptureScreen from '../capture';
import { requestCategorize } from '../../../src/features/capture/categorizeClient';
import { useSpeechRecognition } from '../../../src/hooks/useSpeechRecognition';
import { useSession } from '../../../src/features/auth/SessionProvider';
import {
  insertTransactions,
  deleteTransaction,
} from '../../../src/features/transactions/api';
import type { ParsedTransaction, Transaction } from '../../../src/types';

jest.mock('../../../src/features/capture/categorizeClient', () => ({
  requestCategorize: jest.fn(),
}));
jest.mock('../../../src/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: jest.fn(),
}));
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));
jest.mock('../../../src/features/transactions/api', () => ({
  insertTransactions: jest.fn(),
  deleteTransaction: jest.fn(),
}));

const mockedCategorize = requestCategorize as unknown as jest.Mock;
const mockedSpeech = useSpeechRecognition as unknown as jest.Mock;
const mockedSession = useSession as unknown as jest.Mock;
const mockedInsert = insertTransactions as unknown as jest.Mock;
const mockedDelete = deleteTransaction as unknown as jest.Mock;

const parsed: ParsedTransaction = {
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  confidence: 0.9,
};

const savedRow: Transaction = {
  id: 'txn-1',
  user_id: 'user-1',
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  raw_text: 'spent 50 on coffee',
  source: 'text',
  status: 'confirmed',
  confidence: 0.9,
  occurred_at: '2026-06-02T00:00:00.000Z',
  account_id: null,
  created_at: '2026-06-02T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedSession.mockReturnValue({
    user: { id: 'user-1' },
    profile: { locale: 'en' },
    session: {},
    loading: false,
  });
  mockedSpeech.mockReturnValue({
    transcript: '',
    isListening: false,
    supported: true,
    error: null,
    start: jest.fn(),
    stop: jest.fn(),
  });
});

it('auto-adds the transaction after pressing Add (no confirm step)', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);

  const { getByTestId, queryByTestId } = render(<CaptureScreen />);

  fireEvent.changeText(getByTestId('capture-text'), 'spent 50 on coffee');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() =>
    expect(mockedCategorize).toHaveBeenCalledWith('spent 50 on coffee', 'en'),
  );
  // It saves immediately, with status 'confirmed' and the right fields.
  await waitFor(() => expect(mockedInsert).toHaveBeenCalledTimes(1));
  expect(mockedInsert).toHaveBeenCalledWith([
    expect.objectContaining({
      user_id: 'user-1',
      type: 'expense',
      amount: 50,
      currency: 'EGP',
      category_slug: 'food',
      raw_text: 'spent 50 on coffee',
      source: 'text',
      status: 'confirmed',
    }),
  ]);
  // No confirm sheet; an "added" banner shows instead.
  await waitFor(() => expect(queryByTestId('capture-saved')).toBeTruthy());
  expect(queryByTestId('confirm-save')).toBeNull();
});

it('splits one utterance into several transactions', async () => {
  const taxi: ParsedTransaction = {
    type: 'expense',
    amount: 40,
    currency: 'EGP',
    category_slug: 'transport',
    note: 'taxi',
    confidence: 0.85,
  };
  const taxiRow: Transaction = {
    ...savedRow,
    id: 'txn-2',
    amount: 40,
    category_slug: 'transport',
    note: 'taxi',
  };
  mockedCategorize.mockResolvedValue([parsed, taxi]);
  mockedInsert.mockResolvedValue([savedRow, taxiRow]);

  const { getByTestId, queryByText } = render(<CaptureScreen />);

  fireEvent.changeText(getByTestId('capture-text'), 'coffee 50 and taxi 40');
  fireEvent.press(getByTestId('capture-categorize'));

  // Both rows are inserted in one batch...
  await waitFor(() => expect(mockedInsert).toHaveBeenCalledTimes(1));
  expect(mockedInsert.mock.calls[0][0]).toHaveLength(2);
  // ...and the banner shows the count.
  await waitFor(() => expect(queryByText(/Added 2/)).toBeTruthy());
});

it('does NOT auto-add when no amount was detected', async () => {
  mockedCategorize.mockResolvedValue([{ ...parsed, amount: 0, confidence: 0 }]);

  const { getByTestId, queryByTestId } = render(<CaptureScreen />);

  fireEvent.changeText(getByTestId('capture-text'), 'bought coffee');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() => expect(mockedCategorize).toHaveBeenCalled());
  expect(mockedInsert).not.toHaveBeenCalled();
  await waitFor(() => expect(queryByTestId('capture-error')).toBeTruthy());
  expect(queryByTestId('capture-saved')).toBeNull();
});

it('Undo deletes the just-added transaction', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);
  mockedDelete.mockResolvedValue(undefined);

  const { getByTestId, queryByTestId } = render(<CaptureScreen />);

  fireEvent.changeText(getByTestId('capture-text'), 'spent 50 on coffee');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() => expect(queryByTestId('capture-undo')).toBeTruthy());
  fireEvent.press(getByTestId('capture-undo'));

  await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('txn-1'));
  await waitFor(() => expect(queryByTestId('capture-saved')).toBeNull());
});

it('does NOT auto-add for a negative amount', async () => {
  mockedCategorize.mockResolvedValue([{ ...parsed, amount: -5 }]);

  const { getByTestId, queryByTestId } = render(<CaptureScreen />);
  fireEvent.changeText(getByTestId('capture-text'), 'weird -5');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() => expect(mockedCategorize).toHaveBeenCalled());
  expect(mockedInsert).not.toHaveBeenCalled();
  await waitFor(() => expect(queryByTestId('capture-error')).toBeTruthy());
});

it('flags a low-confidence auto-add for review', async () => {
  mockedCategorize.mockResolvedValue([{ ...parsed, confidence: 0.3 }]);
  mockedInsert.mockResolvedValue([{ ...savedRow, confidence: 0.3 }]);

  const { getByTestId, queryByTestId, queryByText } = render(<CaptureScreen />);
  fireEvent.changeText(getByTestId('capture-text'), 'maybe food 50');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() => expect(queryByTestId('capture-saved')).toBeTruthy());
  expect(queryByText(/Check this/)).toBeTruthy();
});

it('keeps the banner if Undo fails to delete', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);
  mockedDelete.mockRejectedValue(new Error('rls'));

  const { getByTestId, queryByTestId } = render(<CaptureScreen />);
  fireEvent.changeText(getByTestId('capture-text'), 'spent 50 on coffee');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() => expect(queryByTestId('capture-undo')).toBeTruthy());
  fireEvent.press(getByTestId('capture-undo'));

  await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('txn-1'));
  await waitFor(() => expect(queryByTestId('capture-error')).toBeTruthy());
  expect(queryByTestId('capture-saved')).toBeTruthy();
});

it('disables Add when the text box is empty', () => {
  const { getByTestId } = render(<CaptureScreen />);
  fireEvent.press(getByTestId('capture-categorize'));
  expect(mockedCategorize).not.toHaveBeenCalled();
});

it('toggles the mic via the speech hook', () => {
  const start = jest.fn();
  mockedSpeech.mockReturnValue({
    transcript: '',
    isListening: false,
    supported: true,
    error: null,
    start,
    stop: jest.fn(),
  });
  const { getByTestId } = render(<CaptureScreen />);
  fireEvent.press(getByTestId('capture-mic'));
  expect(start).toHaveBeenCalledWith('en-US');
});

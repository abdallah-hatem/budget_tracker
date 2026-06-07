import React from 'react';
import { Pressable, Text } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CaptureProvider, useCapture } from '../CaptureProvider';
import { requestCategorize } from '../categorizeClient';
import { useSpeechRecognition } from '../../../hooks/useSpeechRecognition';
import { useSession } from '../../auth/SessionProvider';
import {
  insertTransactions,
  deleteTransaction,
} from '../../transactions/api';
import type { ParsedTransaction, Transaction } from '../../../types';

jest.mock('../categorizeClient', () => ({ requestCategorize: jest.fn() }));
jest.mock('../voiceCaptureClient', () => ({ requestVoiceCapture: jest.fn() }));
jest.mock('../../../hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: jest.fn(),
}));
jest.mock('../../auth/SessionProvider', () => ({ useSession: jest.fn() }));
jest.mock('../../transactions/api', () => ({
  insertTransactions: jest.fn(),
  deleteTransaction: jest.fn(),
  getTransaction: jest.fn(),
  updateTransaction: jest.fn(),
}));
// EditTransactionSheet (opened from a tapped card row) loads account balances.
jest.mock('../../accounts/api', () => ({
  listAccountBalances: jest.fn().mockResolvedValue([]),
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

/** Exposes the context API as tappable buttons so tests can drive the engine. */
function Harness() {
  const { startVoice, openType, openManual } = useCapture();
  return (
    <>
      <Pressable testID="h-voice" onPress={startVoice}>
        <Text>voice</Text>
      </Pressable>
      <Pressable testID="h-type" onPress={openType}>
        <Text>type</Text>
      </Pressable>
      <Pressable testID="h-manual" onPress={openManual}>
        <Text>manual</Text>
      </Pressable>
    </>
  );
}

function renderProvider() {
  return render(
    <CaptureProvider>
      <Harness />
    </CaptureProvider>,
  );
}

/** Open the type sheet, type `value`, and submit it. */
function submitTyped(api: ReturnType<typeof renderProvider>, value: string) {
  fireEvent.press(api.getByTestId('h-type'));
  fireEvent.changeText(api.getByTestId('type-input'), value);
  fireEvent.press(api.getByTestId('type-submit'));
}

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

it('typing → categorize → auto-saves the transaction (no confirm step)', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);

  const api = renderProvider();
  submitTyped(api, 'spent 50 on coffee');

  await waitFor(() =>
    expect(mockedCategorize).toHaveBeenCalledWith('spent 50 on coffee', 'en'),
  );
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
  await waitFor(() => expect(api.queryByTestId('capture-saved')).toBeTruthy());
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

  const api = renderProvider();
  submitTyped(api, 'coffee 50 and taxi 40');

  await waitFor(() => expect(mockedInsert).toHaveBeenCalledTimes(1));
  expect(mockedInsert.mock.calls[0][0]).toHaveLength(2);
  await waitFor(() => expect(api.queryByText(/Added 2/)).toBeTruthy());
});

it('does NOT auto-add when no amount was detected', async () => {
  mockedCategorize.mockResolvedValue([{ ...parsed, amount: 0, confidence: 0 }]);

  const api = renderProvider();
  submitTyped(api, 'bought coffee');

  await waitFor(() => expect(mockedCategorize).toHaveBeenCalled());
  expect(mockedInsert).not.toHaveBeenCalled();
  await waitFor(() => expect(api.queryByTestId('capture-error')).toBeTruthy());
  expect(api.queryByTestId('capture-saved')).toBeNull();
});

it('does NOT auto-add for a negative amount', async () => {
  mockedCategorize.mockResolvedValue([{ ...parsed, amount: -5 }]);

  const api = renderProvider();
  submitTyped(api, 'weird -5');

  await waitFor(() => expect(mockedCategorize).toHaveBeenCalled());
  expect(mockedInsert).not.toHaveBeenCalled();
  await waitFor(() => expect(api.queryByTestId('capture-error')).toBeTruthy());
});

it('flags a low-confidence auto-add for review', async () => {
  mockedCategorize.mockResolvedValue([{ ...parsed, confidence: 0.3 }]);
  mockedInsert.mockResolvedValue([{ ...savedRow, confidence: 0.3 }]);

  const api = renderProvider();
  submitTyped(api, 'maybe food 50');

  await waitFor(() => expect(api.queryByTestId('capture-saved')).toBeTruthy());
  expect(api.queryByText(/Check this/)).toBeTruthy();
});

it('Undo deletes the just-added transaction', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);
  mockedDelete.mockResolvedValue(undefined);

  const api = renderProvider();
  submitTyped(api, 'spent 50 on coffee');

  await waitFor(() => expect(api.queryByTestId('capture-undo')).toBeTruthy());
  fireEvent.press(api.getByTestId('capture-undo'));

  await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('txn-1'));
  await waitFor(() => expect(api.queryByTestId('capture-saved')).toBeNull());
});

it('keeps the card if Undo fails to delete', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);
  mockedDelete.mockRejectedValue(new Error('rls'));

  const api = renderProvider();
  submitTyped(api, 'spent 50 on coffee');

  await waitFor(() => expect(api.queryByTestId('capture-undo')).toBeTruthy());
  fireEvent.press(api.getByTestId('capture-undo'));

  await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('txn-1'));
  await waitFor(() => expect(api.queryByTestId('capture-error')).toBeTruthy());
  expect(api.queryByTestId('capture-saved')).toBeTruthy();
});

it('Dismiss hides the card but keeps the entries (no delete)', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);

  const api = renderProvider();
  submitTyped(api, 'spent 50 on coffee');

  await waitFor(() => expect(api.queryByTestId('capture-saved')).toBeTruthy());
  fireEvent.press(api.getByTestId('capture-dismiss'));

  await waitFor(() => expect(api.queryByTestId('capture-saved')).toBeNull());
  expect(mockedDelete).not.toHaveBeenCalled();
});

it('tapping a saved item opens the edit sheet', async () => {
  mockedCategorize.mockResolvedValue([parsed]);
  mockedInsert.mockResolvedValue([savedRow]);

  const api = renderProvider();
  submitTyped(api, 'spent 50 on coffee');

  await waitFor(() => expect(api.queryByTestId('saved-item-txn-1')).toBeTruthy());
  fireEvent.press(api.getByTestId('saved-item-txn-1'));

  await waitFor(() => expect(api.queryByTestId('edit-amount')).toBeTruthy());
  expect(api.queryByTestId('edit-delete')).toBeTruthy();
});

it('startVoice toggles the mic via the speech hook', () => {
  const start = jest.fn();
  mockedSpeech.mockReturnValue({
    transcript: '',
    isListening: false,
    supported: true,
    error: null,
    start,
    stop: jest.fn(),
  });

  const api = renderProvider();
  fireEvent.press(api.getByTestId('h-voice'));
  expect(start).toHaveBeenCalledWith('en-US');
});

it('manual quick-add saves the entry WITHOUT calling the AI', async () => {
  mockedInsert.mockResolvedValue([savedRow]);

  const api = renderProvider();
  fireEvent.press(api.getByTestId('h-manual'));
  expect(api.getByTestId('manual-amount')).toBeTruthy();
  fireEvent.changeText(api.getByTestId('manual-amount'), '50');
  fireEvent.press(api.getByTestId('manual-add'));

  await waitFor(() => expect(mockedInsert).toHaveBeenCalledTimes(1));
  expect(mockedCategorize).not.toHaveBeenCalled();
  expect(mockedInsert).toHaveBeenCalledWith([
    expect.objectContaining({
      type: 'expense',
      amount: 50,
      source: 'text',
      status: 'confirmed',
    }),
  ]);
  await waitFor(() => expect(api.queryByTestId('capture-saved')).toBeTruthy());
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CaptureScreen from '../capture';
import { requestCategorize } from '../../../src/features/capture/categorizeClient';
import { useSpeechRecognition } from '../../../src/hooks/useSpeechRecognition';
import { useSession } from '../../../src/features/auth/SessionProvider';
import type { ParsedTransaction } from '../../../src/types';

jest.mock('../../../src/features/capture/categorizeClient', () => ({
  requestCategorize: jest.fn(),
}));
jest.mock('../../../src/hooks/useSpeechRecognition', () => ({
  useSpeechRecognition: jest.fn(),
}));
jest.mock('../../../src/features/auth/SessionProvider', () => ({
  useSession: jest.fn(),
}));
// ConfirmSheet pulls in the api module; stub it to avoid the real supabase import.
jest.mock('../../../src/features/transactions/api', () => ({
  insertTransaction: jest.fn(),
}));

const mockedCategorize = requestCategorize as unknown as jest.Mock;
const mockedSpeech = useSpeechRecognition as unknown as jest.Mock;
const mockedSession = useSession as unknown as jest.Mock;

const parsed: ParsedTransaction = {
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  confidence: 0.9,
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

it('categorizes typed text and shows the ConfirmSheet', async () => {
  mockedCategorize.mockResolvedValue(parsed);

  const { getByTestId, queryByTestId } = render(<CaptureScreen />);

  fireEvent.changeText(getByTestId('capture-text'), 'spent 50 on coffee');
  fireEvent.press(getByTestId('capture-categorize'));

  await waitFor(() => expect(mockedCategorize).toHaveBeenCalledWith('spent 50 on coffee', 'en'));
  await waitFor(() => expect(queryByTestId('confirm-save')).toBeTruthy());
});

it('disables Categorize when the text box is empty', () => {
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

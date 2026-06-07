import React from 'react';
import { render } from '@testing-library/react-native';
import CaptureDeepLink from '../capture';

const mockReplace = jest.fn();
const mockStartVoice = jest.fn();
const mockOpenType = jest.fn();
const mockOpenManual = jest.fn();
let mockParams: { mode?: string } = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/src/features/capture/CaptureProvider', () => ({
  useCapture: () => ({
    startVoice: mockStartVoice,
    openType: mockOpenType,
    openManual: mockOpenManual,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

it('defaults to voice capture, then redirects to the dashboard', () => {
  mockParams = {};
  render(<CaptureDeepLink />);
  expect(mockStartVoice).toHaveBeenCalledTimes(1);
  expect(mockOpenType).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
});

it('mode=type opens the type sheet', () => {
  mockParams = { mode: 'type' };
  render(<CaptureDeepLink />);
  expect(mockOpenType).toHaveBeenCalledTimes(1);
  expect(mockStartVoice).not.toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
});

it('mode=manual opens the manual sheet', () => {
  mockParams = { mode: 'manual' };
  render(<CaptureDeepLink />);
  expect(mockOpenManual).toHaveBeenCalledTimes(1);
  expect(mockStartVoice).not.toHaveBeenCalled();
});

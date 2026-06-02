import '@testing-library/react-native/matchers';

// ---------------------------------------------------------------------------
// Redesign deps that don't need to actually animate/draw in unit tests.
// moti -> plain RN components; gifted-charts -> no-op; vector icons -> host stub.
// ---------------------------------------------------------------------------
jest.mock('moti', () => {
  const { View, Text } = require('react-native');
  return {
    MotiView: View,
    MotiText: Text,
    AnimatePresence: ({ children }: { children?: unknown }) => children,
  };
});

jest.mock('react-native-gifted-charts', () => ({
  PieChart: () => null,
  BarChart: () => null,
  LineChart: () => null,
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@expo/vector-icons', () => {
  const Icon = () => null;
  return new Proxy({}, { get: () => Icon });
});

// ---------------------------------------------------------------------------
// expo-speech-recognition — full behavioural mock (used by all tests).
// Includes __emit / __reset helpers for the useSpeechRecognition hook tests.
// ---------------------------------------------------------------------------
type Handler = (event: any) => void;
const _speechHandlers: Record<string, Handler[]> = {};

jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getPermissionsAsync: jest.fn(async () => ({ granted: true })),
    getSupportedLocales: jest.fn(async () => ({ locales: [], installedLocales: [] })),
    supportsOnDeviceRecognition: jest.fn(() => false),
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
  },
  useSpeechRecognitionEvent: jest.fn((event: string, handler: Handler) => {
    _speechHandlers[event] = _speechHandlers[event] ?? [];
    _speechHandlers[event].push(handler);
  }),
  addSpeechRecognitionListener: jest.fn(() => ({ remove: jest.fn() })),
  // Test helpers — imported by useSpeechRecognition.test.ts
  __emit: (event: string, payload?: any) => {
    (_speechHandlers[event] ?? []).forEach((h) => h(payload));
  },
  __reset: () => {
    Object.keys(_speechHandlers).forEach((k) => delete _speechHandlers[k]);
  },
}));

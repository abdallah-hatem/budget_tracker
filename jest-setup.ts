import '@testing-library/react-native/matchers';

// Keep the native speech-recognition module importable under Jest (it ships
// native code). M5 provides the behavioral mock for the real hook; this is a
// minimal stand-in so unrelated tests can import the module without crashing.
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
  useSpeechRecognitionEvent: jest.fn(),
  addSpeechRecognitionListener: jest.fn(() => ({ remove: jest.fn() })),
}));

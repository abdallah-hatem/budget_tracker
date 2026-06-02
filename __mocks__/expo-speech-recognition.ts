// Manual mock used by jest.mock('expo-speech-recognition') in tests.
export const ExpoSpeechRecognitionModule = {
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  start: jest.fn(),
  stop: jest.fn(),
  supportsOnDeviceRecognition: jest.fn().mockReturnValue(false),
  getSupportedLocales: jest
    .fn()
    .mockResolvedValue({ locales: [], installedLocales: [] }),
};

type Handler = (event: any) => void;
const handlers: Record<string, Handler[]> = {};

export const useSpeechRecognitionEvent = jest.fn(
  (event: string, handler: Handler) => {
    handlers[event] = handlers[event] ?? [];
    handlers[event].push(handler);
  },
);

// Test helper: synchronously fire a registered event.
export const __emit = (event: string, payload?: any) => {
  (handlers[event] ?? []).forEach((h) => h(payload));
};

export const __reset = () => {
  Object.keys(handlers).forEach((k) => delete handlers[k]);
};

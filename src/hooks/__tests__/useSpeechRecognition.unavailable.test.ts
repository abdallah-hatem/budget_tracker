// Override the global expo-speech-recognition mock for THIS file: simulate the
// native module being absent (as in Expo Go / web), where `require()` throws.
// (jest.mock is hoisted above the imports below.)
jest.mock('expo-speech-recognition', () => {
  throw new Error("Cannot find native module 'ExpoSpeechRecognition'");
});

import { renderHook, act } from '@testing-library/react-native';
import { useSpeechRecognition } from '../useSpeechRecognition';

// The hook must NOT crash its module on load when the native import throws (that
// would take down the whole Capture route and break the tab navigator). It must
// degrade to supported=false and keep text capture usable.
describe('useSpeechRecognition when the native module is unavailable', () => {
  it('loads without throwing and reports supported=false', () => {
    const { result } = renderHook(() => useSpeechRecognition());
    expect(result.current.supported).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  it('start() degrades to a friendly error instead of crashing', async () => {
    const { result } = renderHook(() => useSpeechRecognition());
    await act(async () => {
      await result.current.start('en-US');
    });
    expect(result.current.error).toMatch(/development build/i);
  });
});

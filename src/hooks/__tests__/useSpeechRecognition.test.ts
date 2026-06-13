import { renderHook, act } from '@testing-library/react-native';
import { useSpeechRecognition } from '../useSpeechRecognition';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

// expo-speech-recognition is already mocked globally in jest-setup.ts
// (includes __emit / __reset helpers as non-typed test utilities).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const speechMock = require('expo-speech-recognition') as {
  ExpoSpeechRecognitionModule: typeof ExpoSpeechRecognitionModule;
  __emit: (event: string, payload?: unknown) => void;
  __reset: () => void;
};
const { __emit, __reset } = speechMock;

const mod = ExpoSpeechRecognitionModule as unknown as {
  requestPermissionsAsync: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
  supportsOnDeviceRecognition: jest.Mock;
  getSupportedLocales: jest.Mock;
};

beforeEach(() => {
  __reset();
  jest.clearAllMocks();
  mod.requestPermissionsAsync.mockResolvedValue({ granted: true });
  mod.supportsOnDeviceRecognition.mockReturnValue(false);
  mod.getSupportedLocales.mockResolvedValue({ locales: [], installedLocales: [] });
});

it('always uses CLOUD recognition (audio persists → routes to Whisper)', async () => {
  const { result } = renderHook(() => useSpeechRecognition());

  await act(async () => {
    await result.current.start('en-US');
  });

  expect(mod.requestPermissionsAsync).toHaveBeenCalled();
  expect(mod.start).toHaveBeenCalledWith(
    expect.objectContaining({ lang: 'en-US', requiresOnDeviceRecognition: false }),
  );
});

it('uses cloud recognition EVEN when on-device is available (no Apple-transcript fallback)', async () => {
  mod.supportsOnDeviceRecognition.mockReturnValue(true);
  mod.getSupportedLocales.mockResolvedValue({
    locales: ['ar-EG'],
    installedLocales: ['ar-EG'],
  });
  const { result } = renderHook(() => useSpeechRecognition());

  await act(async () => {
    await result.current.start('ar-EG');
  });

  // On-device would persist no audio on some iOS versions → bad Masry fallback.
  // We force cloud so the recording always exists and Whisper is the source of truth.
  expect(mod.start).toHaveBeenCalledTimes(1);
  expect(mod.start).toHaveBeenCalledWith(
    expect.objectContaining({ lang: 'ar-EG', requiresOnDeviceRecognition: false }),
  );
});

it('sets isListening on start and clears it on end', async () => {
  const { result } = renderHook(() => useSpeechRecognition());

  await act(async () => {
    await result.current.start('en-US');
  });
  act(() => __emit('start'));
  expect(result.current.isListening).toBe(true);

  act(() => __emit('end'));
  expect(result.current.isListening).toBe(false);
});

it('updates transcript on a result event', async () => {
  const { result } = renderHook(() => useSpeechRecognition());

  act(() => __emit('result', { results: [{ transcript: 'hello' }], isFinal: true }));

  expect(result.current.transcript).toBe('hello');
});

it('calls onFinalResult with the whole utterance when recognition ends', () => {
  const onFinal = jest.fn();
  renderHook(() => useSpeechRecognition(onFinal));

  act(() => __emit('result', { results: [{ transcript: 'coffee 50 pounds' }], isFinal: true }));
  // Nothing fires until recognition actually ends — no streaming/partial processing.
  expect(onFinal).not.toHaveBeenCalled();

  act(() => __emit('end'));
  expect(onFinal).toHaveBeenCalledTimes(1);
  expect(onFinal).toHaveBeenCalledWith('coffee 50 pounds', null);
});

it('passes the recorded audio path (for Whisper) alongside the transcript', () => {
  const onFinal = jest.fn();
  renderHook(() => useSpeechRecognition(onFinal));

  act(() => __emit('result', { results: [{ transcript: 'qahwa' }], isFinal: true }));
  act(() => __emit('audioend', { uri: 'file:///caches/audio_x.wav' }));
  act(() => __emit('end'));

  expect(onFinal).toHaveBeenCalledWith('qahwa', 'file:///caches/audio_x.wav');
});

it('does not call onFinalResult when nothing was transcribed', () => {
  const onFinal = jest.fn();
  renderHook(() => useSpeechRecognition(onFinal));
  act(() => __emit('end'));
  expect(onFinal).not.toHaveBeenCalled();
});

it('captures errors and stops listening', async () => {
  const { result } = renderHook(() => useSpeechRecognition());

  act(() => __emit('start'));
  act(() => __emit('error', { error: 'no-speech', message: 'No speech detected' }));

  expect(result.current.error).toBe('No speech detected');
  expect(result.current.isListening).toBe(false);
});

it('stop() calls the native stop', async () => {
  const { result } = renderHook(() => useSpeechRecognition());
  act(() => result.current.stop());
  expect(mod.stop).toHaveBeenCalled();
});

it('cancel() aborts and delivers NOTHING, even if the session ends after', () => {
  const onFinal = jest.fn();
  const { result } = renderHook(() => useSpeechRecognition(onFinal));

  act(() => __emit('start'));
  act(() => __emit('result', { results: [{ transcript: 'coffee 50' }] }));
  act(() => __emit('audioend', { uri: 'file:///x.wav' }));

  act(() => result.current.cancel());
  expect(mod.abort).toHaveBeenCalled();
  expect(result.current.isListening).toBe(false);

  // The engine still fires 'end' (and a late result) — none of it is delivered.
  act(() => __emit('result', { results: [{ transcript: 'coffee 50 pounds' }] }));
  act(() => __emit('end'));
  expect(onFinal).not.toHaveBeenCalled();
});

it('NEVER auto-stops on silence — records until stop() is called', async () => {
  const { result } = renderHook(() => useSpeechRecognition());
  await act(async () => {
    await result.current.start('en-US');
  });

  jest.useFakeTimers();
  try {
    act(() => __emit('start'));
    act(() => __emit('result', { results: [{ transcript: 'coffee 50' }] }));
    act(() => __emit('speechend')); // a long pause...

    // ...and a lot of time passes with no new words. The session must stay alive.
    act(() => jest.advanceTimersByTime(60_000));
    expect(mod.stop).not.toHaveBeenCalled();
    expect(result.current.isListening).toBe(true);

    // Only an explicit stop() ends it.
    act(() => result.current.stop());
    expect(mod.stop).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

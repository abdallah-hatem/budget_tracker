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

it('starts cloud recognition when on-device is unavailable', async () => {
  const { result } = renderHook(() => useSpeechRecognition());

  await act(async () => {
    await result.current.start('en-US');
  });

  expect(mod.requestPermissionsAsync).toHaveBeenCalled();
  expect(mod.start).toHaveBeenCalledWith(
    expect.objectContaining({ lang: 'en-US', requiresOnDeviceRecognition: false }),
  );
});

it('prefers on-device when the locale is installed', async () => {
  mod.supportsOnDeviceRecognition.mockReturnValue(true);
  mod.getSupportedLocales.mockResolvedValue({
    locales: ['ar-EG'],
    installedLocales: ['ar-EG'],
  });
  const { result } = renderHook(() => useSpeechRecognition());

  await act(async () => {
    await result.current.start('ar-EG');
  });

  expect(mod.start).toHaveBeenCalledWith(
    expect.objectContaining({ lang: 'ar-EG', requiresOnDeviceRecognition: true }),
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

it('falls back to cloud when on-device start throws', async () => {
  mod.supportsOnDeviceRecognition.mockReturnValue(true);
  mod.getSupportedLocales.mockResolvedValue({
    locales: ['ar-EG'],
    installedLocales: ['ar-EG'],
  });
  mod.start
    .mockImplementationOnce(() => {
      throw new Error('on-device unavailable');
    })
    .mockImplementationOnce(() => undefined);

  const { result } = renderHook(() => useSpeechRecognition());

  await act(async () => {
    await result.current.start('ar-EG');
  });

  expect(mod.start).toHaveBeenCalledTimes(2);
  expect(mod.start).toHaveBeenLastCalledWith(
    expect.objectContaining({ requiresOnDeviceRecognition: false }),
  );
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

it('auto-stops on trailing silence, and repeated heartbeat partials do not extend it', async () => {
  const { result } = renderHook(() => useSpeechRecognition());
  await act(async () => {
    await result.current.start('en-US');
  });

  jest.useFakeTimers();
  try {
    act(() => __emit('start')); // arms the initial grace period
    act(() => __emit('result', { results: [{ transcript: 'coffee 50' }] })); // new words → arm 2000ms

    act(() => jest.advanceTimersByTime(1500));
    // Same text again (an iOS heartbeat) must NOT re-arm the timer.
    act(() => __emit('result', { results: [{ transcript: 'coffee 50' }] }));
    expect(mod.stop).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(600)); // 2100ms since the new words → fires
    expect(mod.stop).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

it('keeps listening while NEW words keep arriving', async () => {
  const { result } = renderHook(() => useSpeechRecognition());
  await act(async () => {
    await result.current.start('en-US');
  });

  jest.useFakeTimers();
  try {
    act(() => __emit('result', { results: [{ transcript: 'coffee' }] }));
    act(() => jest.advanceTimersByTime(1500));
    act(() => __emit('result', { results: [{ transcript: 'coffee fifty' }] })); // grew → re-arm
    act(() => jest.advanceTimersByTime(1500));
    expect(mod.stop).not.toHaveBeenCalled(); // 1500 < 2000 since the last new words

    act(() => jest.advanceTimersByTime(600));
    expect(mod.stop).toHaveBeenCalledTimes(1);
  } finally {
    jest.useRealTimers();
  }
});

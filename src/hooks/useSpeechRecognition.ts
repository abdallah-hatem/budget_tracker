import { useCallback, useRef, useState } from 'react';
import type * as ESR from 'expo-speech-recognition';

// expo-speech-recognition is a NATIVE module: it only exists in a development
// build / standalone app, NOT in Expo Go or on web. A static `import` resolves
// the native module at module-evaluation time and THROWS ("Cannot find native
// module 'ExpoSpeechRecognition'") when it's absent — which would crash the whole
// Capture route and break the tab navigator. So load it defensively here and
// degrade to text-only (supported=false) when it isn't available.
let NativeModule: typeof ESR.ExpoSpeechRecognitionModule | null = null;
let nativeEvent: typeof ESR.useSpeechRecognitionEvent | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('expo-speech-recognition');
  NativeModule = mod.ExpoSpeechRecognitionModule ?? null;
  nativeEvent = mod.useSpeechRecognitionEvent;
} catch {
  NativeModule = null;
  nativeEvent = undefined;
}

// Stable event subscriber: the real hook in a dev build, otherwise a no-op. The
// binding is decided ONCE at module load, so React hook call-order stays
// identical across renders whether or not the native module is present.
const subscribe = (nativeEvent ?? (() => {})) as (
  event: string,
  handler: (e: any) => void,
) => void;

// Whether voice input is usable in this runtime (true only in a dev/standalone build).
const SUPPORTED = !!NativeModule;

export interface SpeechRecognition {
  transcript: string;
  isListening: boolean;
  supported: boolean;
  error: string | null;
  start: (lang: string) => Promise<void>;
  /** Finish listening and DELIVER the result (transcribe + save downstream). */
  stop: () => void;
  /** Abort listening and DISCARD it — no result is delivered. */
  cancel: () => void;
}

export function useSpeechRecognition(
  onFinalResult?: (transcript: string, audioUri: string | null) => void,
): SpeechRecognition {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Always invoke the latest callback without re-subscribing each render.
  const finalCbRef = useRef(onFinalResult);
  finalCbRef.current = onFinalResult;
  // Latest transcript + recorded-audio path, read synchronously when it ends.
  const transcriptRef = useRef('');
  const audioUriRef = useRef<string | null>(null);
  // Set by cancel(): makes the in-flight session deliver NOTHING (discard).
  const cancelledRef = useRef(false);

  // NOTE: there is intentionally NO auto-stop. The session records until the user
  // taps Stop (or Cancel). The native session runs with continuous:true, so it
  // keeps going through pauses; only stop()/cancel() (or a platform error) ends it.

  subscribe('start', () => {
    setIsListening(true);
    setError(null);
  });

  // The recorded audio file path arrives on `audioend` (recordingOptions.persist).
  subscribe('audioend', (event) => {
    if (cancelledRef.current) return; // cancelled → keep no audio
    audioUriRef.current = event?.uri ?? null;
  });

  subscribe('end', () => {
    setIsListening(false);
    // Cancelled: discard the session and deliver nothing.
    if (cancelledRef.current) {
      cancelledRef.current = false;
      transcriptRef.current = '';
      audioUriRef.current = null;
      return;
    }
    // Recognition finished: hand the caller the whole utterance AND the recorded
    // audio "at once" (no streaming). The audio lets the caller re-transcribe in
    // ANY language via Whisper, regardless of the on-device locale.
    const finalText = transcriptRef.current.trim();
    const audioUri = audioUriRef.current;
    transcriptRef.current = '';
    audioUriRef.current = null;
    if (finalText || audioUri) finalCbRef.current?.(finalText, audioUri);
  });

  subscribe('result', (event) => {
    if (cancelledRef.current) return; // ignore late results after a cancel
    const next = event?.results?.[0]?.transcript;
    if (typeof next !== 'string') return;
    transcriptRef.current = next;
    setTranscript(next);
  });

  subscribe('error', (event) => {
    setError(event?.message ?? event?.error ?? 'Speech recognition error');
    setIsListening(false);
  });

  const start = useCallback(async (lang: string) => {
    const mod = NativeModule;
    if (!mod) {
      setError('Voice input needs a development build; type instead.');
      return;
    }

    setError(null);
    setTranscript('');
    transcriptRef.current = '';
    audioUriRef.current = null;
    cancelledRef.current = false;

    const perms = await mod.requestPermissionsAsync();
    if (!perms.granted) {
      setError('Microphone / speech permission denied');
      return;
    }

    let preferOnDevice = false;
    try {
      if (mod.supportsOnDeviceRecognition()) {
        const { installedLocales } = await mod.getSupportedLocales({});
        preferOnDevice = installedLocales.includes(lang);
      }
    } catch {
      preferOnDevice = false;
    }

    const baseOptions = {
      // Stream partial results (not shown on screen) so the transcript ref stays
      // current while recording.
      interimResults: true,
      // Keep the native session alive through pauses — it records until the user
      // taps Stop. No silence timer; only stop()/cancel() ends it.
      continuous: true,
      lang,
      recordingOptions: { persist: true }, // keep the audio for Whisper (any language)
    };

    if (preferOnDevice) {
      try {
        mod.start({ ...baseOptions, requiresOnDeviceRecognition: true });
        return;
      } catch {
        // fall through to cloud
      }
    }

    try {
      mod.start({ ...baseOptions, requiresOnDeviceRecognition: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start recognition');
    }
  }, []);

  const stop = useCallback(() => {
    NativeModule?.stop();
  }, []);

  // Abort + discard: mark cancelled (so 'end'/'audioend' deliver nothing), drop
  // any captured text/audio, and abort the native session (falls back to stop()
  // if the platform has no abort — the cancel flag still prevents delivery).
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    transcriptRef.current = '';
    audioUriRef.current = null;
    setTranscript('');
    setIsListening(false);
    const mod = NativeModule as null | { stop: () => void; abort?: () => void };
    if (mod?.abort) mod.abort();
    else mod?.stop();
  }, []);

  return { transcript, isListening, supported: SUPPORTED, error, start, stop, cancel };
}

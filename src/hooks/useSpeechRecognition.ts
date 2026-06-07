import { useCallback, useEffect, useRef, useState } from 'react';
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

// Auto-stop after this much TRAILING silence. The session stays alive through
// short pauses (so listing several expenses doesn't get cut off mid-flow) and
// ends once the user has clearly finished. INITIAL is the grace period before
// the first word. Tune here.
const SILENCE_MS = 2000;
const INITIAL_SILENCE_MS = 6000;

export interface SpeechRecognition {
  transcript: string;
  isListening: boolean;
  supported: boolean;
  error: string | null;
  start: (lang: string) => Promise<void>;
  stop: () => void;
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

  // Trailing-silence auto-stop: every bit of speech activity re-arms the timer,
  // so only a real pause (no activity for SILENCE_MS) ends the session.
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearSilence = useCallback(() => {
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, []);
  const armSilence = useCallback(
    (ms: number) => {
      clearSilence();
      silenceTimer.current = setTimeout(() => NativeModule?.stop(), ms);
    },
    [clearSilence],
  );
  useEffect(() => clearSilence, [clearSilence]); // clear on unmount

  subscribe('start', () => {
    setIsListening(true);
    setError(null);
    armSilence(INITIAL_SILENCE_MS);
  });

  // The recorded audio file path arrives on `audioend` (recordingOptions.persist).
  subscribe('audioend', (event) => {
    audioUriRef.current = event?.uri ?? null;
  });

  subscribe('end', () => {
    clearSilence();
    setIsListening(false);
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
    const next = event?.results?.[0]?.transcript;
    if (typeof next !== 'string') return;
    // Re-arm ONLY on genuinely new words. iOS can keep emitting the same partial
    // as a heartbeat during silence; re-arming on those would mean the trailing-
    // silence timer never fires and the session listens forever (the user then
    // has to tap to stop). Treating only growth as activity lets it auto-stop.
    const grew = next.trim() !== '' && next !== transcriptRef.current;
    transcriptRef.current = next;
    setTranscript(next);
    if (grew) armSilence(SILENCE_MS);
  });

  // Coarser activity signals in case partial results are sparse.
  subscribe('speechstart', () => armSilence(SILENCE_MS));
  subscribe('speechend', () => armSilence(SILENCE_MS));

  subscribe('error', (event) => {
    clearSilence();
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
      // Stream partial results as a "still speaking" heartbeat for the silence
      // timer. They are NOT shown — the capture screen never renders `transcript`
      // — so the capture still feels instant (no live text on screen).
      interimResults: true,
      // Keep the native session alive through pauses; OUR silence timer
      // (SILENCE_MS) decides when the user has actually finished. This avoids the
      // platform cutting off at the first short pause (continuous:false) AND the
      // never-stops problem (continuous:true with no timer).
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
    clearSilence();
    NativeModule?.stop();
  }, [clearSilence]);

  return { transcript, isListening, supported: SUPPORTED, error, start, stop };
}

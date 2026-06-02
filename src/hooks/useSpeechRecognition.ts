import { useCallback, useState } from 'react';
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
  stop: () => void;
}

export function useSpeechRecognition(): SpeechRecognition {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  subscribe('start', () => {
    setIsListening(true);
    setError(null);
  });

  subscribe('end', () => {
    setIsListening(false);
  });

  subscribe('result', (event) => {
    const next = event?.results?.[0]?.transcript;
    if (typeof next === 'string') {
      setTranscript(next);
    }
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
      lang,
      interimResults: true,
      continuous: false,
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

  return { transcript, isListening, supported: SUPPORTED, error, start, stop };
}

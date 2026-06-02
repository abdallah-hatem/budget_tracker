import { useCallback, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export interface SpeechRecognition {
  transcript: string;
  isListening: boolean;
  supported: boolean;
  error: string | null;
  start: (lang: string) => Promise<void>;
  stop: () => void;
}

// The native module is always defined in a dev build; treat its presence as support.
const SUPPORTED = !!ExpoSpeechRecognitionModule;

export function useSpeechRecognition(): SpeechRecognition {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => {
    setIsListening(true);
    setError(null);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const next = event.results?.[0]?.transcript;
    if (typeof next === 'string') {
      setTranscript(next);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setError(event.message ?? event.error ?? 'Speech recognition error');
    setIsListening(false);
  });

  const start = useCallback(async (lang: string) => {
    setError(null);
    setTranscript('');

    const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perms.granted) {
      setError('Microphone / speech permission denied');
      return;
    }

    let preferOnDevice = false;
    try {
      if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
        const { installedLocales } =
          await ExpoSpeechRecognitionModule.getSupportedLocales({});
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
        ExpoSpeechRecognitionModule.start({
          ...baseOptions,
          requiresOnDeviceRecognition: true,
        });
        return;
      } catch {
        // fall through to cloud
      }
    }

    try {
      ExpoSpeechRecognitionModule.start({
        ...baseOptions,
        requiresOnDeviceRecognition: false,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start recognition');
    }
  }, []);

  const stop = useCallback(() => {
    ExpoSpeechRecognitionModule.stop();
  }, []);

  return { transcript, isListening, supported: SUPPORTED, error, start, stop };
}

import { supabase } from '../../lib/supabase';
import type { Locale, ParsedTransaction } from '../../types';

export interface VoiceCaptureResult {
  /** What Whisper heard (any language, auto-detected). */
  text: string;
  parsed: ParsedTransaction;
}

/**
 * Uploads the recorded audio to the `transcribe` Edge Function, which runs Groq
 * Whisper (auto-detects the spoken language — Arabic, Egyptian, English, …) and
 * the categorizer, returning the transcript + parsed transaction in one call.
 *
 * Uses a raw multipart fetch (supabase-js `functions.invoke` can't stream a file
 * upload) with the user's JWT attached for `verify_jwt`.
 */
export async function requestVoiceCapture(
  audioUri: string,
  locale: Locale,
): Promise<VoiceCaptureResult> {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !anon) throw new Error('Supabase env not configured');

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const form = new FormData();
  // React Native's FormData accepts a { uri, name, type } file descriptor.
  form.append(
    'file',
    { uri: audioUri, name: 'audio.wav', type: 'audio/wav' } as unknown as Blob,
  );
  form.append('locale', locale);

  const resp = await fetch(`${base}/functions/v1/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      // Intentionally no Content-Type — fetch sets the multipart boundary.
    },
    body: form,
  });

  if (!resp.ok) {
    let message = 'Voice capture failed';
    try {
      const body = (await resp.json()) as { error?: string };
      message = body?.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }

  const data = (await resp.json()) as Partial<VoiceCaptureResult>;
  if (!data.parsed || typeof data.text !== 'string') {
    throw new Error('Voice capture returned no result');
  }
  return { text: data.text, parsed: data.parsed };
}

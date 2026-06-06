// Edge Function: transcribe
// POST multipart/form-data { file: <audio>, locale?: 'ar' | 'en' }
//   -> 200 { text: string, parsed: ParsedTransaction }
//
// Lets users speak an expense in ANY language. Groq Whisper auto-detects the
// spoken language (Arabic, Egyptian dialect, English, anything) and transcribes
// it, then the shared categorizer parses it into a transaction — all server-side
// in one round trip. verify_jwt = true (see supabase/config.toml).
import { corsHeaders } from "../_shared/cors.ts";
import {
  categorizeMany,
  type Locale,
  type ParsedTransaction,
} from "../_shared/categorize.ts";

const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Groq's ~25MB limit

/** Injectable deps so the handler is unit-testable without network. */
export interface HandlerDeps {
  apiKey: string;
  transcribeFn: (audio: Blob, apiKey: string) => Promise<string>;
  categorizeFn: (
    text: string,
    locale: Locale,
    apiKey: string,
  ) => Promise<ParsedTransaction[]>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Pure request handler — call directly from tests. */
export async function handleTranscribe(
  req: Request,
  deps: HandlerDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (_e) {
    return json(
      { error: "Expected multipart/form-data with an audio 'file'." },
      400,
    );
  }

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return json({ error: "Field 'file' (audio) is required." }, 400);
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return json({ error: "Audio is too large (max 25MB)." }, 413);
  }
  const locale: Locale = form.get("locale") === "ar" ? "ar" : "en";

  if (!deps.apiKey) {
    return json({ error: "Server is missing GROQ_API_KEY." }, 500);
  }

  let text: string;
  try {
    text = (await deps.transcribeFn(file, deps.apiKey)).trim();
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Transcription failed." },
      502,
    );
  }
  if (!text) {
    return json({ error: "No speech detected." }, 422);
  }

  let transactions: ParsedTransaction[];
  try {
    transactions = await deps.categorizeFn(text, locale, deps.apiKey);
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Categorization failed." },
      502,
    );
  }

  return json({ text, transactions, parsed: transactions[0] ?? null }, 200);
}

/** Real Groq Whisper transcription with automatic language detection. */
async function groqTranscribe(audio: Blob, apiKey: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", audio, "audio.wav");
  fd.append("model", WHISPER_MODEL);
  fd.append("response_format", "json");
  // No `language` param on purpose -> Whisper auto-detects the spoken language.

  const resp = await fetch(GROQ_WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`Whisper error ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await resp.json()) as { text?: string };
  return typeof data.text === "string" ? data.text : "";
}

// Guard with import.meta.main so the server does not bind during deno test.
if (import.meta.main) {
  Deno.serve((req) =>
    handleTranscribe(req, {
      apiKey: Deno.env.get("GROQ_API_KEY") ?? "",
      transcribeFn: groqTranscribe,
      categorizeFn: categorizeMany,
    })
  );
}

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
  type CustomCategory,
  type Locale,
  type ParsedTransaction,
} from "../_shared/categorize.ts";
import { logAiEvent, minConfidence, userIdFromAuthHeader, type AiEvent } from "../_shared/aiEvents.ts";
import { fetchCustomCategories } from "../_shared/customCategories.ts";
import { withSentry } from "../_shared/sentry.ts";

const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
// Full large-v3 (not turbo): noticeably more accurate on dialect + loanwords
// like "padel" — worth the small extra latency for short expense clips.
const WHISPER_MODEL = "whisper-large-v3";
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // Groq's ~25MB limit

// Whisper `prompt` biases recognition WITHOUT forcing the language (no `language`
// param -> still auto-detects). We give it a concise VOCABULARY LIST (Whisper's
// recommended biasing form) — not example sentences, which can make it drift and
// hallucinate the seeded words. Seeds the hard loanwords (padel, ping pong, …)
// and finance terms so dialect/foreign words and numbers transcribe correctly.
const WHISPER_PROMPTS: Record<Locale, string> = {
  ar:
    "مصاريف بالعامية المصرية، الأرقام تتكتب أرقام. لعبت بادل (padel) بميتين، " +
    "حجزت ملعب، اشتركت في الجيم. كلمات متكررة: بادل padel، بادل، تنس، بينج بونج، " +
    "كورة، ماتش، جيم، ملعب، تاكسي، أوبر، بنزين، قهوة، غدا، عشا، فاتورة، كهربا، " +
    "إيجار، صيدلية، مرتب، جنيه.",
  en:
    "Egyptian expense notes; amounts as digits. Played padel for 200, booked a " +
    "court, gym subscription. Frequent words: padel, padel, tennis, ping pong, " +
    "football, match, gym, court, taxi, uber, fuel, coffee, lunch, bill, " +
    "electricity, rent, pharmacy, salary, pounds.",
};

/** Injectable deps so the handler is unit-testable without network. */
export interface HandlerDeps {
  apiKey: string;
  transcribeFn: (audio: Blob, apiKey: string, locale: Locale) => Promise<string>;
  categorizeFn: (
    text: string,
    locale: Locale,
    apiKey: string,
    extra?: CustomCategory[],
  ) => Promise<ParsedTransaction[]>;
  /** Fetch the caller's custom categories (omitted in tests -> built-ins only). */
  fetchCategoriesFn?: (userId: string | null) => Promise<CustomCategory[]>;
  /** Optional observability sink (omitted in tests). */
  logEvent?: (e: AiEvent) => void;
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

  const userId = userIdFromAuthHeader(req);
  const t0 = Date.now();

  let text: string;
  try {
    text = (await deps.transcribeFn(file, deps.apiKey, locale)).trim();
  } catch (e) {
    deps.logEvent?.({
      user_id: userId, fn: "transcribe", source: "voice", model: WHISPER_MODEL,
      ok: false, error: e instanceof Error ? e.message : String(e), latency_ms: Date.now() - t0,
    });
    return json(
      { error: e instanceof Error ? e.message : "Transcription failed." },
      502,
    );
  }
  if (!text) {
    deps.logEvent?.({
      user_id: userId, fn: "transcribe", source: "voice", model: WHISPER_MODEL,
      ok: false, error: "no_speech", latency_ms: Date.now() - t0, input_len: 0,
    });
    return json({ error: "No speech detected." }, 422);
  }

  const extra = deps.fetchCategoriesFn ? await deps.fetchCategoriesFn(userId) : [];
  let transactions: ParsedTransaction[];
  try {
    transactions = await deps.categorizeFn(text, locale, deps.apiKey, extra);
  } catch (e) {
    deps.logEvent?.({
      user_id: userId, fn: "transcribe", source: "voice", model: WHISPER_MODEL,
      ok: false, error: e instanceof Error ? e.message : String(e),
      latency_ms: Date.now() - t0, input_len: text.length,
    });
    return json(
      { error: e instanceof Error ? e.message : "Categorization failed." },
      502,
    );
  }

  deps.logEvent?.({
    user_id: userId, fn: "transcribe", source: "voice", model: WHISPER_MODEL,
    ok: true, latency_ms: Date.now() - t0, confidence: minConfidence(transactions),
    input_len: text.length, result_count: transactions.length,
  });
  return json({ text, transactions, parsed: transactions[0] ?? null }, 200);
}

/** Real Groq Whisper transcription with automatic language detection. */
async function groqTranscribe(
  audio: Blob,
  apiKey: string,
  locale: Locale,
): Promise<string> {
  const fd = new FormData();
  fd.append("file", audio, "audio.wav");
  fd.append("model", WHISPER_MODEL);
  fd.append("response_format", "json");
  fd.append("temperature", "0");
  // PIN the language to the user's locale instead of letting Whisper auto-detect.
  // Auto-detection was the main source of inconsistency for Egyptian Arabic
  // (Whisper would sometimes lock onto MSA / mis-detect run to run). "ar" covers
  // Masry; Whisper still handles loan-words (padel, brands) inside it.
  fd.append("language", locale === "ar" ? "ar" : "en");
  // Bias vocabulary/numbers toward the user's language (esp. Egyptian Masry).
  fd.append("prompt", WHISPER_PROMPTS[locale]);

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
  Deno.serve(withSentry("transcribe", (req) =>
    handleTranscribe(req, {
      apiKey: Deno.env.get("GROQ_API_KEY") ?? "",
      transcribeFn: groqTranscribe,
      categorizeFn: (text, locale, apiKey, extra) =>
        categorizeMany(text, locale, apiKey, { customCategories: extra }),
      fetchCategoriesFn: fetchCustomCategories,
      logEvent: (e) => void logAiEvent(e),
    })
  ));
}

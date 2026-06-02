// Shared categorization core. Calls Groq's OpenAI-compatible Chat Completions
// API in JSON mode, then maps the returned JSON object to a ParsedTransaction.
// Designed with an injectable `createCompletion` transport so unit tests can
// supply a fake response (no network, no API key).
import { CATEGORY_SLUGS, FALLBACK_EXPENSE_SLUG, FALLBACK_INCOME_SLUG } from "./categories.ts";

// --- Local mirrors of M2 shared types (Deno cannot import from src/). ---
// Kept structurally identical to ParsedTransaction / Locale / TxnType in
// src/types/index.ts (owned by M2). If those change, update here too.
export type Locale = "ar" | "en";
export type TxnType = "expense" | "income";

export interface ParsedTransaction {
  type: TxnType;
  amount: number;
  currency: string;
  category_slug: string;
  note: string;
  confidence: number;
  occurred_at?: string;
}

// --- Minimal structural shape of the OpenAI-compatible chat completion we read.
// We type only the fields we use so a fake response in tests is trivial.
export interface ChatCompletionResponse {
  id?: string;
  choices: Array<{
    index?: number;
    finish_reason?: string;
    message: { role: string; content: string | null };
  }>;
}

// The request body handed to the transport (loosely typed so tests can introspect).
export type CreateCompletion = (
  body: Record<string, unknown>,
) => Promise<ChatCompletionResponse>;

export interface CategorizeOptions {
  /** Inject a fake transport in tests. Defaults to a real fetch to Groq. */
  createCompletion?: CreateCompletion;
}

// Groq model + endpoint. llama-3.3-70b handles Arabic/English well and is on
// Groq's free tier. Swap the model here if Groq deprecates it.
export const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function systemPrompt(locale: Locale): string {
  const lang = locale === "ar" ? "Arabic" : "English";
  return [
    "You categorize a single personal-finance utterance or SMS into ONE fixed category.",
    "The text is most likely in " + lang + " but may mix Arabic and English.",
    "Respond with a SINGLE JSON object and nothing else (no markdown fences, no prose).",
    "The JSON object must have exactly these keys:",
    '- "type": one of "expense" (money the user spent) or "income" (money received).',
    '- "amount": a positive number. Convert Arabic-Indic digits (٠-٩) to Western digits. Use 0 if no amount is present.',
    '- "currency": map EGP / جنيه / ج.م / pounds to "EGP". Default "EGP".',
    '- "category_slug": EXACTLY one of these allowed values: ' + CATEGORY_SLUGS.join(", ") + ".",
    '  Pick the MOST SPECIFIC fitting category. Use "other_expense"/"other_income" ONLY as a last',
    "  resort when no listed category reasonably fits — never for common everyday items, even from",
    "  terse input. Anything to eat or drink — including water, bottled water, juice, soda, coffee,",
    "  tea, snacks and any beverage — is food (Food & Drink), even when 'bought' from a shop. Use",
    "  groceries ONLY for a supermarket shopping trip or multiple household provisions, never a single",
    "  drink/snack. Other hints: taxi, uber, bus, fuel, petrol -> transport;",
    "  rent, electricity, water bill, internet, phone bill -> bills; pharmacy, doctor, medicine ->",
    "  health; clothes, shoes -> clothes; salary or paycheck -> salary; a refund / money back -> refund.",
    '- "note": a very short human label for the item (e.g. "coffee", "قهوة").',
    '- "confidence": a number from 0 to 1.',
    '- "occurred_at": optional ISO-8601 timestamp if the text states a date/time; omit otherwise.',
    "Amounts are in Egyptian Pounds (EGP) by default.",
  ].join("\n");
}

/** Build the Groq Chat Completions request body (shared by real + fake transports). */
export function buildRequestBody(
  text: string,
  locale: Locale,
): Record<string, unknown> {
  return {
    model: GROQ_MODEL,
    temperature: 0,
    max_tokens: 256,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(locale) },
      { role: "user", content: text },
    ],
  };
}

/** Default transport: a real fetch to Groq's OpenAI-compatible endpoint. */
function realTransport(apiKey: string): CreateCompletion {
  return async (body) => {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Groq API error ${res.status}: ${detail.slice(0, 300)}`);
    }
    return await res.json() as ChatCompletionResponse;
  };
}

// --- Field coercion helpers (provider-agnostic; unchanged from before) ---
function coerceType(v: unknown): TxnType {
  return v === "income" ? "income" : "expense";
}

function coerceAmount(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

function coerceConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function coerceCurrency(v: unknown): string {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return "EGP";
}

function coerceNote(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function coerceSlug(v: unknown, type: TxnType): string {
  if (typeof v === "string" && CATEGORY_SLUGS.includes(v)) return v;
  return type === "income" ? FALLBACK_INCOME_SLUG : FALLBACK_EXPENSE_SLUG;
}

function coerceOccurredAt(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** Pull the JSON object out of the model's message content (tolerant of fences). */
export function extractJsonObject(
  res: ChatCompletionResponse,
): Record<string, unknown> {
  const content = res?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Groq returned an empty completion");
  }
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    // Last resort: grab the first {...} block.
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Groq response was not valid JSON");
    obj = JSON.parse(m[0]);
  }
  if (typeof obj !== "object" || obj === null) {
    throw new Error("Groq JSON was not an object");
  }
  return obj as Record<string, unknown>;
}

/**
 * Categorize a finance utterance into a ParsedTransaction.
 *
 * @param text   Raw user/SMS text.
 * @param locale 'ar' | 'en' — hint for the system prompt.
 * @param apiKey Groq API key (ignored when a fake transport is injected).
 * @param opts   { createCompletion } to inject a fake transport in tests.
 */
export async function categorize(
  text: string,
  locale: Locale,
  apiKey: string,
  opts: CategorizeOptions = {},
): Promise<ParsedTransaction> {
  const transport = opts.createCompletion ?? realTransport(apiKey);
  const res = await transport(buildRequestBody(text, locale));

  const input = extractJsonObject(res);
  const type = coerceType(input.type);
  const amount = coerceAmount(input.amount);
  // Per spec: if there is no usable amount, force amount 0 AND confidence 0.
  const confidence = amount === 0 ? 0 : coerceConfidence(input.confidence);

  const parsed: ParsedTransaction = {
    type,
    amount,
    currency: coerceCurrency(input.currency),
    category_slug: coerceSlug(input.category_slug, type),
    note: coerceNote(input.note),
    confidence,
  };

  const occurredAt = coerceOccurredAt(input.occurred_at);
  if (occurredAt) parsed.occurred_at = occurredAt;

  return parsed;
}

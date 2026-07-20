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

/** What the message actually is — so promos/offers that merely MENTION an amount
 *  don't get ingested as real transactions. */
export type MessageKind = "transaction" | "offer" | "other";

export interface ParsedTransaction {
  type: TxnType;
  amount: number;
  currency: string;
  category_slug: string;
  note: string;
  confidence: number;
  /** "transaction" = money moved; "offer" = marketing/promo; "other" = OTP/info. */
  kind: MessageKind;
  occurred_at?: string;
}

/** A user's custom category, fed to the model so it can assign it by name. */
export interface CustomCategory {
  slug: string;
  name: string;
  kind: TxnType;
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
  /** The caller's custom categories — assignable by the model in addition to built-ins. */
  customCategories?: CustomCategory[];
}

/** Built-in slugs plus the caller's custom slugs (the full allow-set). */
function allowedSlugs(extra: CustomCategory[]): string[] {
  return [...CATEGORY_SLUGS, ...extra.map((c) => c.slug)];
}

/** Prompt lines describing the user's custom categories (empty when none). */
function customCatalogBlock(extra: CustomCategory[]): string[] {
  if (extra.length === 0) return [];
  return [
    "  The user also defined these CUSTOM categories. Prefer one when the item clearly",
    "  matches its name; output its EXACT slug as shown:",
    ...extra.map((c) => `    • ${c.slug} — "${c.name}" (${c.kind})`),
  ];
}

// Groq model + endpoint. Swap the model here if Groq deprecates it.
// HISTORY: migrated to Llama 4 Scout after benchmarking — but on 2026-07-18 Groq
// REMOVED scout from the catalog entirely (404 "model does not exist"), which
// broke SMS ingest. Reverted to llama-3.3-70b-versatile, which is still served,
// handles Arabic/English well, and is the model these prompts were originally
// tuned for (valid JSON under response_format:json_object; qwen3 / gpt-oss failed
// that JSON mode in the earlier benchmark). NOTE: Groq lists 3.3-70b as slated
// for decommission ~2026-08-16 — re-evaluate the catalog and migrate again before
// then (or if it 404s sooner, as scout did).
export const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function systemPrompt(locale: Locale, extra: CustomCategory[] = []): string {
  const lang = locale === "ar" ? "Arabic" : "English";
  return [
    "Categorize ONE personal-finance SMS/utterance (" + lang + ", may mix Arabic+English) into ONE category.",
    "Output ONE JSON object only — no fences, no prose — with EXACTLY these keys:",
    '- "type": "expense" (money LEFT the account) or "income" (money ADDED). In bank SMS decide by DIRECTION, not the word تحويل: TO the account (إلى/الى حساب, تم إضافة/إيداع, أضيف, credited, deposit, received, دائن) = income; FROM the account (من حساب, تم خصم/سحب/تحويل, شراء, دفعت, debited, withdrawal, purchase, POS, مدين) = expense. التحويل اللحظي is neither by itself — use direction. Generic transfer, no merchant: income→other_income, expense→other_expense.',
    '- "amount": positive number for THIS transaction (the charge/credit/debit), NOT the available/remaining balance. Convert Arabic-Indic digits ٠-٩. A SPACE or comma between digit groups is a thousands separator — ignore it; a period/comma before exactly two trailing digits is the decimal ("EGP1 477.29"=1477.29, "10 000"=10000, "1,234.50"=1234.50). Use 0 if none. If the same charge is repeated (a notification echoing its own body), it is ONE transaction — report it once, NEVER sum the repeats.',
    '- "currency": EGP / جنيه / ج.م / pounds → "EGP". Default "EGP".',
    '- "category_slug": EXACTLY one of: ' + allowedSlugs(extra).join(", ") + ".",
    ...customCatalogBlock(extra),
    '  Most specific fit; use "other_expense"/"other_income" ONLY as a last resort, never for common everyday items. Food & Drink = anything eaten/drunk incl. water, juice, soda, coffee, tea, snacks (even bought from a shop); groceries only for a supermarket trip / multiple provisions. transport = taxi, uber, careem, bus, metro, fuel/petrol/benzine, AND any fuel/gas/petrol station (Mobil/موبيل, Shell/شل, Total/توتال, Wataniya/وطنية, Emarat/إمارات, Misr Petroleum/مصر للبترول, TAQA/طاقة, Gastec, AdNOC, and ChillOut/شيل اوت — ChillOut is a fuel/convenience STATION despite the café-sounding name — or any other brand) — on a card/POS "MOBIL" is the FUEL STATION, not telecom. bills = rent, electricity, water, internet, phone. health = pharmacy, doctor, medicine. clothes = clothes/shoes. sports = padel/بادل, football/كورة, tennis, gym/جيم. salary = salary/paycheck. refund = money back.',
    '- "note": a very short label (e.g. "coffee", "قهوة").',
    '- "kind": "transaction" (money ACTUALLY moved on your account — a completed debit/credit/purchase/withdrawal/transfer/salary/refund), "offer" (marketing: cashback, moneyback, discount, "% off", "shop and get", coupon, points, loyalty, "capped at", T&Cs, win/prize), or "other" (NO money moved: OTP/verification code, balance inquiry, generic info, OR a demand to PAY something not paid yet — an unpaid bill, an installment due, a traffic/legal fine مخالفة/غرامة/"ادفع مخالفاتك"/court or prosecutor notice — even when it lists an amount). An amount inside an offer or a still-UNPAID bill/fine is NOT a transaction. When genuinely unsure, prefer "transaction".',
    '- "confidence": a number from 0 to 1.',
    '- "occurred_at": optional ISO-8601 timestamp if the text states a date/time; omit otherwise.',
    "Amounts are in EGP by default.",
  ].join("\n");
}

/** Build the Groq Chat Completions request body (shared by real + fake transports). */
export function buildRequestBody(
  text: string,
  locale: Locale,
  extra: CustomCategory[] = [],
): Record<string, unknown> {
  return {
    model: GROQ_MODEL,
    temperature: 0,
    max_tokens: 256,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(locale, extra) },
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

// Default to "transaction" when the model omits/garbles it — bias against
// dropping a real transaction (false negative) over letting a promo through.
function coerceKind(v: unknown): MessageKind {
  return v === "offer" ? "offer" : v === "other" ? "other" : "transaction";
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

function coerceSlug(v: unknown, type: TxnType, extraSlugs: string[] = []): string {
  if (typeof v === "string" && (CATEGORY_SLUGS.includes(v) || extraSlugs.includes(v))) return v;
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
  const extra = opts.customCategories ?? [];
  const res = await transport(buildRequestBody(text, locale, extra));

  const input = extractJsonObject(res);
  const type = coerceType(input.type);
  const amount = coerceAmount(input.amount);
  // Per spec: if there is no usable amount, force amount 0 AND confidence 0.
  const confidence = amount === 0 ? 0 : coerceConfidence(input.confidence);

  const parsed: ParsedTransaction = {
    type,
    amount,
    currency: coerceCurrency(input.currency),
    category_slug: coerceSlug(input.category_slug, type, extra.map((c) => c.slug)),
    note: coerceNote(input.note),
    confidence,
    kind: coerceKind(input.kind),
  };

  const occurredAt = coerceOccurredAt(input.occurred_at);
  if (occurredAt) parsed.occurred_at = occurredAt;

  return parsed;
}

// --- Multi-item categorization -------------------------------------------------
// Splits ONE utterance ("lunch 50, coffee 20, taxi 30") into SEPARATE
// transactions. Understands English, Modern Standard Arabic, and Egyptian
// colloquial (Masry).

function manySystemPrompt(locale: Locale, extra: CustomCategory[] = []): string {
  const lang = locale === "ar" ? "Arabic" : "English";
  return [
    "Extract personal-finance transactions from ONE spoken/typed utterance or SMS.",
    'The user OFTEN lists several at once ("lunch 50, coffee 20, taxi 30" / "اتغديت بـ٥٠ وشربت قهوة بـ٢٠ وركبت تاكسي بـ٣٠") — split into SEPARATE transactions, one per item with its own amount; a single thing returns one.',
    "Text may be English, Modern Standard " + lang + ", or Egyptian colloquial (Masry/مصري), incl. slang.",
    "NUMBERS — read every amount EXACTLY; never round/swap/invent. Arabic number words → digits: عشرة=10, خمستاشر=15, عشرين=20, تلاتين=30, أربعين=40, خمسين=50, ستين=60, سبعين=70, تمانين=80, تسعين=90, مية/ميه=100, ميتين=200, تلتمية=300, ربعمية=400, خمسمية=500, ألف=1000, ألفين=2000, تلت آلاف=3000. 'و' joins parts (خمسة وتسعين=95, مية وعشرين=120, تلتمية وخمسين=350). 'بـ'/'ب'/'بمبلغ' before a number marks the price. Arabic-Indic ٠-٩→0-9. نص=0.5, ربع=0.25. A space or comma between digit groups is a thousands separator — ignore it (\"1 477.29\"=1477.29, \"10 000\"=10000).",
    'Output ONE JSON object only (no fences/prose): { "transactions": [ <transaction>, ... ] }. Each has EXACTLY:',
    '- "type": "expense" (spent) or "income" (received).',
    '- "amount": a positive number. OMIT the whole item if it has no amount.',
    '- "currency": EGP / جنيه / جنيها / ج / ج.م / pound(s) → "EGP". Default "EGP".',
    '- "category_slug": EXACTLY one of: ' + allowedSlugs(extra).join(", ") + ".",
    ...customCatalogBlock(extra),
    '  Most specific fit; use "other_expense"/"other_income" ONLY as a last resort. Food & Drink = anything eaten/drunk (water, juice, soda, coffee/قهوة, tea/شاي, snacks, any beverage), even bought from a shop; groceries ONLY a supermarket trip / multiple provisions. transport = taxi/تاكسي, uber, bus/أتوبيس, fuel/بنزين. bills = rent/إيجار, electricity/الكهربا, water, internet/نت, phone, فاتورة. health = pharmacy/صيدلية, doctor/دكتور, medicine/دوا. clothes = هدوم/جزمة. sports = PLAYING or paying to do a sport: padel/بادل, football/كورة/ماتش, ping pong, tennis/تنس, gym/جيم, swimming/سباحة, basketball/سلة, booking a pitch/ملعب (phrasings: لعبت بادل, حجزت ملعب, اشتركت في الجيم).',
    "  Speech-to-text OFTEN garbles 'padel' (بادل): in a playing/booking context (لعبت/حجزت/ماتش), read بادر/بدل/بادي/باندل/بادال/paddle/battle/pedal/puddle as padel → sports, note 'بادل' (or 'padel'). Video games/movies/streaming/concerts → entertainment, NOT sports. salary/مرتب/راتب → salary; a refund / فلوس رجعت → refund.",
    '- "note": a very short label for the item (e.g. "coffee", "قهوة").',
    '- "confidence": a number from 0 to 1.',
    '- "occurred_at": optional ISO-8601 timestamp if the text states a date/time; omit otherwise.',
    "Amounts are in EGP by default. Return an empty array if there are no transactions.",
    "Example: اتغديت بتمانين وشربت قهوة بخمسة وعشرين وركبت تاكسي باربعين →",
    '{"transactions":[' +
      '{"type":"expense","amount":80,"currency":"EGP","category_slug":"food","note":"غداء","confidence":0.95},' +
      '{"type":"expense","amount":25,"currency":"EGP","category_slug":"food","note":"قهوة","confidence":0.95},' +
      '{"type":"expense","amount":40,"currency":"EGP","category_slug":"transport","note":"تاكسي","confidence":0.9}]}',
  ].join("\n");
}

/** Build the Groq request body for multi-item extraction. */
export function buildManyRequestBody(
  text: string,
  locale: Locale,
  extra: CustomCategory[] = [],
): Record<string, unknown> {
  return {
    model: GROQ_MODEL,
    temperature: 0,
    max_tokens: 1024, // room for several transactions
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: manySystemPrompt(locale, extra) },
      { role: "user", content: text },
    ],
  };
}

/**
 * Categorize an utterance into ONE OR MORE ParsedTransactions (multi-item).
 * Items with no usable amount are dropped.
 */
export async function categorizeMany(
  text: string,
  locale: Locale,
  apiKey: string,
  opts: CategorizeOptions = {},
): Promise<ParsedTransaction[]> {
  const transport = opts.createCompletion ?? realTransport(apiKey);
  const extra = opts.customCategories ?? [];
  const extraSlugs = extra.map((c) => c.slug);
  const res = await transport(buildManyRequestBody(text, locale, extra));
  const obj = extractJsonObject(res);

  // Accept { transactions: [...] }, a bare array, or a single object (fallback).
  let rawList: unknown[];
  const wrapped = (obj as { transactions?: unknown }).transactions;
  if (Array.isArray(wrapped)) {
    rawList = wrapped;
  } else if (Array.isArray(obj)) {
    rawList = obj as unknown[];
  } else {
    rawList = [obj];
  }

  const out: ParsedTransaction[] = [];
  for (const item of rawList) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const type = coerceType(rec.type);
    const amount = coerceAmount(rec.amount);
    if (amount === 0) continue; // drop items with no usable amount
    const parsed: ParsedTransaction = {
      type,
      amount,
      currency: coerceCurrency(rec.currency),
      category_slug: coerceSlug(rec.category_slug, type, extraSlugs),
      note: coerceNote(rec.note),
      confidence: coerceConfidence(rec.confidence),
      kind: coerceKind(rec.kind),
    };
    const occurredAt = coerceOccurredAt(rec.occurred_at);
    if (occurredAt) parsed.occurred_at = occurredAt;
    out.push(parsed);
  }
  return out;
}

// Shared categorization core. Calls Claude `claude-haiku-4-5` with a single
// strict tool `record_transaction`, then maps the parsed tool_use.input to a
// ParsedTransaction. Designed with an injectable `createMessage` transport so
// unit tests can supply a fake response (no network, no API key).
import Anthropic from "npm:@anthropic-ai/sdk@0.69.0";
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

// --- Minimal structural shape of the Anthropic Messages response we rely on. ---
// We intentionally type only the fields we read so a fake response in tests is
// trivial to construct.
export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}
export interface AnthropicTextBlock {
  type: "text";
  text: string;
}
export type AnthropicContentBlock =
  | AnthropicToolUseBlock
  | AnthropicTextBlock
  | { type: string; [k: string]: unknown };

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  stop_reason: string | null;
  content: AnthropicContentBlock[];
}

// The request body we hand to the transport (loosely typed: it is Anthropic's
// MessageCreateParams, but we keep it `Record` so tests can introspect it).
export type CreateMessage = (
  body: Record<string, unknown>,
) => Promise<AnthropicMessageResponse>;

export interface CategorizeOptions {
  /** Inject a fake transport in tests. Defaults to the real Anthropic SDK. */
  createMessage?: CreateMessage;
}

const TOOL_NAME = "record_transaction";

/** JSON Schema for the single forced tool. */
function toolInputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        type: "string",
        enum: ["expense", "income"],
        description: "Whether money left the user (expense) or came in (income).",
      },
      amount: {
        type: "number",
        description: "The numeric amount, positive. Convert Arabic-Indic digits (٠-٩) to " +
          "Western digits. If no amount is present, use 0.",
      },
      currency: {
        type: "string",
        description: "ISO-ish currency code. Map EGP / جنيه / ج.م / pounds to 'EGP'. " +
          "Default 'EGP' if unspecified.",
      },
      category_slug: {
        type: "string",
        enum: CATEGORY_SLUGS,
        description: "Best-fit category slug. Use other_expense / other_income when unsure.",
      },
      note: {
        type: "string",
        description: "A very short human label for the item (e.g. 'coffee', 'قهوة').",
      },
      confidence: {
        type: "number",
        description: "Your confidence in this parse, from 0 to 1.",
      },
      occurred_at: {
        type: "string",
        description: "Optional ISO-8601 timestamp of when it happened, if the text states " +
          "a date/time. Omit if not stated.",
      },
    },
    required: ["type", "amount", "currency", "category_slug", "note", "confidence"],
  };
}

function systemPrompt(locale: Locale): string {
  const lang = locale === "ar" ? "Arabic" : "English";
  return [
    "You categorize a single personal-finance utterance or SMS into ONE fixed",
    "category. The user's text is most likely in " + lang + ", but it may mix",
    "Arabic and English. You MUST respond by calling the record_transaction tool",
    "exactly once and nothing else. Pick the single best category_slug from the",
    "allowed enum; when genuinely unsure use other_expense (for spending) or",
    "other_income (for money received). Amounts are in Egyptian Pounds (EGP) by",
    "default. Convert Arabic-Indic digits to Western digits.",
  ].join(" ");
}

/** Build the Anthropic Messages request body (shared by real + fake transports). */
export function buildRequestBody(
  text: string,
  locale: Locale,
): Record<string, unknown> {
  return {
    model: "claude-haiku-4-5",
    max_tokens: 256,
    system: systemPrompt(locale),
    tools: [
      {
        name: TOOL_NAME,
        description: "Record the user's parsed financial transaction. Call this exactly " +
          "once with your best structured extraction of type, amount, currency, " +
          "category, a short note, and your confidence.",
        strict: true,
        input_schema: toolInputSchema(),
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: text }],
  };
}

/** Default transport: the real Anthropic SDK using strict tool use. */
function realTransport(apiKey: string): CreateMessage {
  const client = new Anthropic({ apiKey });
  return async (body) => {
    // Strict tool use requires the structured-outputs beta header. We pass it
    // via the per-request `betas` option on the beta.messages endpoint.
    // Fallback (non-beta): tool_choice: { type: 'tool' } without beta header.
    // deno-lint-ignore no-explicit-any
    const res = await (client as any).beta.messages.create({
      ...body,
      betas: ["structured-outputs-2025-11-13"],
    });
    return res as AnthropicMessageResponse;
  };
}

// --- Field coercion helpers ---
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
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function findToolUse(
  res: AnthropicMessageResponse,
): AnthropicToolUseBlock | undefined {
  const blocks = Array.isArray(res?.content) ? res.content : [];
  return blocks.find(
    (b): b is AnthropicToolUseBlock => b?.type === "tool_use" && b.name === TOOL_NAME,
  );
}

/**
 * Categorize a finance utterance into a ParsedTransaction.
 *
 * @param text   Raw user/SMS text.
 * @param locale 'ar' | 'en' — hint for the system prompt.
 * @param apiKey Anthropic API key (ignored when a fake transport is injected).
 * @param opts   { createMessage } to inject a fake transport in tests.
 */
export async function categorize(
  text: string,
  locale: Locale,
  apiKey: string,
  opts: CategorizeOptions = {},
): Promise<ParsedTransaction> {
  const transport = opts.createMessage ?? realTransport(apiKey);
  const res = await transport(buildRequestBody(text, locale));

  const toolUse = findToolUse(res);
  if (!toolUse) {
    throw new Error("Claude did not return a record_transaction tool_use block");
  }

  const input = toolUse.input ?? {};
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

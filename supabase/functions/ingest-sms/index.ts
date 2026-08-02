// Edge Function: ingest-sms
// PUBLIC endpoint (verify_jwt = false) authenticated by a per-user hashed token.
//
// POST { text: string, token: string, received_at?: string }
//   -> 200 { ok: true }                 (transaction inserted as pending)
//   -> 200 { ok: true, skipped: true }  (no amount found — OTP / promo / other)
//   -> 200 { ok: true, duplicate: true} (this exact message was already ingested)
//   -> 401                              (missing or unknown/revoked token)
//   -> 4xx / 5xx                        (validation errors, server faults)
//
// The service-role key is used server-side only; RLS is bypassed intentionally
// so the function can resolve user_id from a validated token and write on their
// behalf.
import { corsHeaders } from "../_shared/cors.ts";
import { categorize, type CustomCategory, type ParsedTransaction } from "../_shared/categorize.ts";
import { fetchCustomCategories } from "../_shared/customCategories.ts";
import { INCOME_SLUGS } from "../_shared/categories.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { logAiEvent, type AiEvent } from "../_shared/aiEvents.ts";
import { withSentry } from "../_shared/sentry.ts";

const MAX_TEXT_LENGTH = 2000;

/**
 * Collapse a bank notification that repeats its own body. Android's
 * NotificationListener exposes the message in BOTH `EXTRA_TEXT` (a collapsed /
 * truncated line) and `EXTRA_BIG_TEXT` (the expanded line); the Android capture
 * forwards both, so the text reaching us can contain the amount TWICE — and the
 * categorizer then SUMS it (a 250 charge is logged as 500). Fix: drop any line
 * that is contained within another line, and drop exact-duplicate lines, keeping
 * order. A single-line body (iOS SMS, or a normal notification) is returned
 * unchanged, so this is a safe no-op everywhere else.
 */
export function collapseRepeatedBody(text: string): string {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const kept: string[] = [];
  for (const line of lines) {
    // Already covered by a longer kept line (this is the truncated duplicate).
    if (kept.some((k) => k.includes(line))) continue;
    // This longer line supersedes any shorter kept line it contains.
    for (let i = kept.length - 1; i >= 0; i--) {
      if (line.includes(kept[i])) kept.splice(i, 1);
    }
    kept.push(line);
  }
  const out = kept.join("\n");
  return out.length > 0 ? out : text;
}

/** How long two identical no-token messages are assumed to be the same event. */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const INTERNAL_TRANSFER_PAIR_WINDOW_MS = 10 * 60 * 1000;
const INTERNAL_TRANSFER_NOTIFICATION_DELAY_MS = 30 * 1000;

type EdgeRuntimeWithWaitUntil = {
  waitUntil: (promise: Promise<unknown>) => void;
};

/** Keep delayed notification work alive after the HTTP response where supported. */
function runInBackground(task: Promise<unknown>): void {
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: EdgeRuntimeWithWaitUntil;
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}

/**
 * Does the message carry something that is unique to ONE transaction?
 *
 * This is the difference between a message that can be deduplicated forever and
 * one that cannot. Compare two real formats seen in production:
 *
 *   "... برقم مرجعي 0896a475 بتاريخ 31-07-2026 01:09"   <- ref + clock
 *   "... رقم المعاملة a65363bf ... في 13:16"             <- txn no + clock
 *   "تم تحويل مبلغ 15EGP من حساب رقم xxx0328 فى 26-JUL-2026 عن طريق التحويل اللحظي"
 *
 * The third has NO reference number and NO time of day — only a date. Two
 * genuine 15 EGP transfers on the same day are therefore byte-identical, and
 * production data contains exactly that: three such messages 20 hours apart,
 * all real. Deduplicating those permanently would silently swallow a real
 * transaction, so they get a time window instead.
 */
export function hasPerTransactionToken(text: string): boolean {
  // A reference / transaction number, in either language.
  if (/(?:مرجعي|المعامل[ةه]|reference|ref\.?\s*(?:no|number))/i.test(text)) return true;
  // A time of day (HH:MM) — enough to separate two transfers on the same date.
  if (/\d{1,2}:\d{2}/.test(text)) return true;
  return false;
}

/**
 * Idempotency key for one captured message.
 *
 * The SAME bank message can reach us more than once: an iOS Shortcuts personal
 * automation that matches a sender through two rules fires twice, and Android's
 * NotificationListener re-delivers a notification when it is updated or bundled.
 * Observed in production as two POSTs 16-160 ms apart carrying byte-identical
 * text — concurrent, so a read-then-write check cannot catch them. The key is
 * stored on the row and backed by a unique index, which makes the second insert
 * lose atomically.
 *
 * Whitespace is normalised because the two copies are not always byte-identical
 * (Android forwards EXTRA_TEXT and EXTRA_BIG_TEXT, which differ in line breaks).
 *
 * When the message carries no per-transaction token the key also folds in a
 * coarse time bucket, so identical text only collapses when it arrives close
 * together. Two copies that straddle a bucket boundary both survive — that is
 * deliberate: this design fails towards "a duplicate slipped through" (the old,
 * visible, user-fixable behaviour) and never towards "a real transaction
 * vanished".
 */
export async function dedupeKey(text: string, atMs: number): Promise<string> {
  const normalised = collapseRepeatedBody(text).replace(/\s+/g, " ").trim();
  if (hasPerTransactionToken(normalised)) return await sha256Hex(normalised);
  const bucket = Math.floor(atMs / DEDUPE_WINDOW_MS);
  return await sha256Hex(`${normalised}|w${bucket}`);
}

// ---------------------------------------------------------------------------
// Injectable dependency interface (enables unit tests with no network or DB).
// ---------------------------------------------------------------------------

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** iOS app-icon badge count to set on arrival (= number of pending items). */
  badge?: number;
  /** Notification category id → surfaces action buttons on long-press. */
  categoryId?: string;
}

/** A user keyword rule: when `keyword` appears in the SMS, force this category/note. */
export interface SmsRule {
  keyword: string;
  category_slug: string;
  note: string | null;
}

/** A just-ingested SMS that may be one side of an internal card payment. */
export interface InternalTransferCandidate {
  userId: string;
  amount: number;
  type: "expense" | "income";
  transferReference: string;
  occurredAt: string;
  transactionId?: string;
}

/**
 * Extract the bank's stable reference from an SMS. The reference is much safer
 * than amount + timestamp alone: two unrelated payments can legitimately have
 * the same amount on the same day, but a bank reference identifies one transfer.
 */
export function extractTransferReference(text: string): string | null {
  const match = text.match(
    /(?:رقم\s+(?:مرجعي|المعامل[ةه])|reference(?:\s*(?:number|no\.?))?|ref\.?)\s*[:#]?\s*([a-z0-9]+(?:[-/][a-z0-9]+)*)/i,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

/** True for Instapay / instant-payment messages, in Arabic or English. */
export function isInstantTransfer(text: string): boolean {
  return /تحويل\s*لحظي|شبكة\s+المدفوعات\s+اللحظية|instant\s+(?:payment|transfer)|instapay/i.test(text);
}

export interface IngestDeps {
  /** Groq API key (empty string → 500). */
  groqKey: string;
  /**
   * Calls the LLM to categorize an SMS and returns a ParsedTransaction.
   * Matches the signature of `categorize` from _shared/categorize.ts.
   */
  categorizeFn: (
    text: string,
    locale: "ar" | "en",
    apiKey: string,
    extra?: CustomCategory[],
  ) => Promise<ParsedTransaction>;
  /** Fetch the user's custom categories (omitted in tests -> built-ins only). */
  fetchCategoriesFn?: (userId: string | null) => Promise<CustomCategory[]>;
  /**
   * Given a sha256-hex token hash, return the associated user_id, or null if
   * the token does not exist or is revoked.
   */
  lookupUserId: (tokenHash: string) => Promise<string | null>;
  /** Return the user's keyword rules (override category + note on a match). */
  getRules: (userId: string) => Promise<SmsRule[]>;
  /**
   * Insert a pending transaction. Throws on a real DB error.
   * `duplicate` is true when the row lost the unique-index race on
   * (user_id, dedupe_key) — i.e. this message is already stored.
   */
  insertPending: (
    row: Record<string, unknown>,
  ) => Promise<{ id: string | null; duplicate: boolean }>;
  /** Find the opposite side of a reference-matched internal transfer. */
  findMatchingTransfer?: (
    candidate: InternalTransferCandidate,
  ) => Promise<{ id: string } | null>;
  /** Mark both rows as an internal transfer so they do not affect finances. */
  markInternalTransfer?: (ids: string[]) => Promise<void>;
  /**
   * Cheap pre-LLM check: has this exact message already been stored for the
   * user? Catches sequential re-sends (a retried automation) before we spend
   * Groq tokens. Concurrent re-sends slip past it and are caught by the insert.
   */
  seenRecently?: (userId: string, key: string) => Promise<boolean>;
  /** Best-effort: update last_used_at for the token. */
  touchToken: (tokenHash: string) => Promise<void>;
  /** Return Expo push tokens registered for the given user_id. */
  getPushTokens: (userId: string) => Promise<string[]>;
  /** Count the user's pending transactions (for the app-icon badge). */
  countPending: (userId: string) => Promise<number>;
  /** Send one or more Expo push messages (best-effort). */
  sendPush: (messages: ExpoPushMessage[]) => Promise<void>;
  /** Optional observability sink (omitted in tests). */
  logEvent?: (e: AiEvent) => void;
}

// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Pure, injectable request handler — called directly in tests.
// ---------------------------------------------------------------------------

export async function handleIngest(
  req: Request,
  deps: IngestDeps,
): Promise<Response> {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  // Parse JSON body.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "Invalid JSON body." }, 400);
  }

  // --- Validate `token` ---
  const token = typeof body.token === "string" ? body.token : "";
  if (token.length === 0) {
    return json({ error: "Field 'token' is required." }, 401);
  }

  // --- Validate `text` ---
  const text = typeof body.text === "string" ? body.text : "";
  if (text.trim().length === 0) {
    return json({ error: "Field 'text' is required." }, 400);
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json(
      { error: `Field 'text' exceeds ${MAX_TEXT_LENGTH} characters.` },
      413,
    );
  }

  // --- Guard the API key ---
  if (!deps.groqKey) {
    return json({ error: "Server misconfigured: GROQ_API_KEY not set." }, 500);
  }

  // --- Hash the token and look up the user ---
  const tokenHash = await sha256Hex(token);
  const userId = await deps.lookupUserId(tokenHash);
  if (userId === null) {
    return json({ error: "Invalid or revoked token." }, 401);
  }

  // --- Update last_used_at (best-effort; do not fail the request) ---
  deps.touchToken(tokenHash).catch(() => {/* swallow */});

  // --- Categorize the SMS ---
  // Collapse a doubled notification body first, so the amount isn't summed twice.
  const cleanText = collapseRepeatedBody(text);

  // Cheap pre-Groq gate: a message with NO digit at all (Western 0-9 or
  // Arabic-Indic ٠-٩) cannot carry an amount, so it would be dropped as
  // "no_amount" AFTER a wasted LLM call. Skip Groq entirely — this is safe
  // (it can never drop a real transaction) and conserves the daily token quota.
  if (!/[0-9٠-٩]/.test(cleanText)) {
    return json({ ok: true, skipped: true, reason: "no_amount" }, 200);
  }

  // --- Resolve occurred_at ---
  // Resolved before the dedupe key because the key folds in a time bucket for
  // messages that carry no per-transaction reference.
  // Clamp to reject far-future dates (e.g. wrong device clock / replayed SMS).
  const FUTURE_CLAMP_MS = 5 * 60 * 1000; // 5 minutes
  const receivedAt = typeof body.received_at === "string"
    ? body.received_at
    : undefined;
  let occurredAt: string;
  if (receivedAt !== undefined) {
    const d = new Date(receivedAt);
    if (Number.isNaN(d.getTime())) {
      // Unparseable date → fall back to now.
      occurredAt = new Date().toISOString();
    } else if (d.getTime() > Date.now() + FUTURE_CLAMP_MS) {
      // Far-future date → clamp to now.
      occurredAt = new Date().toISOString();
    } else {
      occurredAt = d.toISOString();
    }
  } else {
    occurredAt = new Date().toISOString();
  }

  // --- Idempotency, layer 1: have we already stored this exact message? ---
  // Best-effort and non-fatal: on any error we fall through and let the unique
  // index on (user_id, dedupe_key) be the authority.
  const key = await dedupeKey(text, new Date(occurredAt).getTime());
  if (deps.seenRecently) {
    try {
      if (await deps.seenRecently(userId, key)) {
        return json({ ok: true, duplicate: true }, 200);
      }
    } catch (_e) {
      // Ignore — layer 2 still guarantees correctness.
    }
  }

  const extra = deps.fetchCategoriesFn ? await deps.fetchCategoriesFn(userId) : [];
  const t0 = Date.now();
  let parsed: ParsedTransaction;
  try {
    parsed = await deps.categorizeFn(cleanText, "en", deps.groqKey, extra);
  } catch (e) {
    deps.logEvent?.({
      user_id: userId, fn: "ingest-sms", source: "sms", ok: false,
      error: e instanceof Error ? e.message : String(e),
      latency_ms: Date.now() - t0, input_len: text.length,
    });
    return json({ error: "Failed to categorize SMS text." }, 502);
  }

  // Round amount to 2 decimal places.
  const amount = Math.round((parsed.amount ?? 0) * 100) / 100;

  // The AI part is done — log its outcome (result_count 0 = no amount found).
  deps.logEvent?.({
    user_id: userId, fn: "ingest-sms", source: "sms", ok: true,
    latency_ms: Date.now() - t0,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
    input_len: text.length, result_count: amount > 0 ? 1 : 0,
  });

  // Only a real money movement gets inserted. Skip everything else:
  //  • no usable amount (OTP / balance / info) → amount <= 0 → "no_amount"
  //  • a marketing/promo that merely MENTIONS an amount (cashback, "% off") →
  //    kind:"offer" (e.g. "cashback capped at EGP 1,500")
  //  • an unpaid bill / traffic-fine notice / demand-to-pay with an amount →
  //    kind:"other" (e.g. a النيابة العامة traffic-fine SMS "بقيمه 200 ... ادفع")
  // The LLM defaults to "transaction" when unsure, so only messages it is
  // confident are non-transactions are dropped here.
  if (amount <= 0 || parsed.kind !== "transaction") {
    const reason = amount <= 0 ? "no_amount" : parsed.kind; // "offer" | "other"
    return json({ ok: true, skipped: true, reason }, 200);
  }

  // --- Apply the user's keyword rules (override the AI category + note) ---
  let categorySlug = parsed.category_slug;
  let note = parsed.note;
  let type = parsed.type;
  try {
    const rules = await deps.getRules(userId);
    const lowerText = text.toLowerCase();
    // Longest matching keyword wins, so a specific rule beats a generic one.
    const matched = rules
      .filter((r) => r.keyword && lowerText.includes(r.keyword.toLowerCase()))
      .sort((a, b) => b.keyword.length - a.keyword.length)[0];
    if (matched) {
      categorySlug = matched.category_slug;
      if (matched.note && matched.note.trim().length > 0) note = matched.note;
      // Keep the type consistent with the chosen category's kind.
      type = (INCOME_SLUGS as readonly string[]).includes(matched.category_slug)
        ? "income"
        : "expense";
    }
  } catch (_e) {
    // Rules are best-effort — fall back to the AI parse on any error.
  }

  // Instapay card payments produce two bank messages: an outgoing debit from
  // the funding account and an incoming credit to the card. Keep the bank's
  // reference only for these messages; it is the safe join key for pairing.
  const transferReference = isInstantTransfer(cleanText)
    ? extractTransferReference(cleanText)
    : null;

  // --- Insert the pending transaction row ---
  // Idempotency, layer 2: the insert is ON CONFLICT DO NOTHING against the
  // unique index on (user_id, dedupe_key), so of two concurrent copies of the
  // same message exactly one row survives.
  let txnId: string | null = null;
  try {
    const inserted = await deps.insertPending({
      user_id: userId,
      type,
      amount,
      currency: "EGP",
      category_slug: categorySlug,
      note,
      raw_text: text,
      dedupe_key: key,
      source: "sms",
      status: "pending",
      confidence: parsed.confidence,
      occurred_at: occurredAt,
      ...(transferReference ? { transfer_reference: transferReference } : {}),
    });
    // Already stored by the other copy — do not notify a second time.
    if (inserted.duplicate) return json({ ok: true, duplicate: true }, 200);
    txnId = inserted.id;
  } catch (_e) {
    return json({ error: "Failed to save transaction." }, 502);
  }

  // Pair after insert so concurrent mirrored SMS deliveries can see each
  // other's committed row. A failed best-effort pairing leaves the normal
  // pending transaction intact rather than losing a real payment.
  let paired = false;
  if (txnId && transferReference && deps.findMatchingTransfer && deps.markInternalTransfer) {
    try {
      const match = await deps.findMatchingTransfer({
        userId,
        amount,
        type,
        transferReference,
        occurredAt,
        transactionId: txnId,
      });
      if (match && match.id !== txnId) {
        await deps.markInternalTransfer([match.id, txnId]);
        paired = true;
      }
    } catch (_e) {
      // Pairing is deliberately non-fatal. The row can still be reviewed and
      // a later retry can pair it without blocking SMS ingestion.
    }
  }

  // An internally paired payment must never create a review notification.
  if (paired) return json({ ok: true }, 200);

  // --- Best-effort push notification (never changes the 200 response) ---
  // Give a reference-bearing Instapay message a short pairing window. This
  // prevents a transient notification for the first half of a card payment
  // when the mirrored bank SMS arrives a few seconds later.
  runInBackground((async () => {
    if (transferReference && txnId && deps.findMatchingTransfer && deps.markInternalTransfer) {
      await new Promise<void>((resolve) => setTimeout(resolve, INTERNAL_TRANSFER_NOTIFICATION_DELAY_MS));
      try {
        const lateMatch = await deps.findMatchingTransfer({
          userId,
          amount,
          type,
          transferReference,
          occurredAt,
          transactionId: txnId,
        });
        if (lateMatch && lateMatch.id !== txnId) {
          await deps.markInternalTransfer([lateMatch.id, txnId]);
          return;
        }
      } catch (_e) {
        // Fall through to the normal notification if the delayed lookup fails.
      }
    }

    try {
      const tokens = await deps.getPushTokens(userId);
      if (tokens.length === 0) return;
      // Badge = current pending count, so iOS sets the app-icon badge the moment
      // the notification arrives (even when the app is closed/backgrounded).
      const badge = await deps.countPending(userId).catch(() => undefined);
      const bodyText = `E£ ${amount} · ${note || categorySlug}`;
      const messages: ExpoPushMessage[] = tokens.map((to) => ({
        to,
        title: "New transaction to review",
        body: bodyText,
        // categoryId → long-press shows Confirm / Edit / Reject actions; txnId
        // lets those actions act on this exact transaction (see useNotifications).
        categoryId: "sms_pending",
        data: {
          url: "/(tabs)/pending",
          type: "sms_pending",
          ...(txnId ? { txnId } : {}),
        },
        ...(typeof badge === "number" ? { badge } : {}),
      }));
      await deps.sendPush(messages);
    } catch (_e) {
      // Swallow — push failure must never affect the 200 response.
    }
  })());

  return json({ ok: true }, 200);
}

// ---------------------------------------------------------------------------
// Real runtime wiring — only runs when Deno serves this file directly.
// ---------------------------------------------------------------------------

if (import.meta.main) {
  // Lazy import so deno test never loads the Supabase client.
  const { createClient } = await import("npm:@supabase/supabase-js@2");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";

  // Service-role client bypasses RLS.  This is intentional: we resolved
  // user_id from a validated, hashed token — the write is scoped to that user.
  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const deps: IngestDeps = {
    groqKey,

    categorizeFn: (text, locale, apiKey, extra) =>
      categorize(text, locale, apiKey, { customCategories: extra }),
    fetchCategoriesFn: fetchCustomCategories,

    async lookupUserId(tokenHash) {
      const { data, error } = await sb
        .from("ingest_tokens")
        .select("user_id")
        .eq("token_hash", tokenHash)
        .eq("revoked", false)
        .maybeSingle();
      if (error || !data) return null;
      return (data as { user_id: string }).user_id;
    },

    async getRules(userId) {
      const { data, error } = await sb
        .from("sms_rules")
        .select("keyword, category_slug, note")
        .eq("user_id", userId);
      if (error || !data) return [];
      return data as SmsRule[];
    },

    async seenRecently(userId, key) {
      const { count, error } = await sb
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("dedupe_key", key);
      if (error) throw new Error(`dedupe lookup failed: ${error.message}`);
      return (count ?? 0) > 0;
    },

    async insertPending(row) {
      // ignoreDuplicates → ON CONFLICT (user_id, dedupe_key) DO NOTHING, which
      // returns an EMPTY set when this message was already stored.
      const { data, error } = await sb
        .from("transactions")
        .upsert(row, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`DB insert failed: ${error.message}`);
      const rows = (data ?? []) as { id: string }[];
      if (rows.length === 0) return { id: null, duplicate: true };
      return { id: rows[0].id, duplicate: false };
    },

    async findMatchingTransfer(candidate) {
      const opposite = candidate.type === "income" ? "expense" : "income";
      let query = sb
        .from("transactions")
        .select("id, occurred_at")
        .eq("user_id", candidate.userId)
        .eq("source", "sms")
        .eq("type", opposite)
        .eq("amount", candidate.amount)
        .eq("transfer_reference", candidate.transferReference)
        .eq("is_internal_transfer", false)
        .order("created_at", { ascending: false })
        .limit(10);
      if (candidate.transactionId) query = query.neq("id", candidate.transactionId);
      const { data, error } = await query;
      if (error || !data) return null;
      const targetMs = new Date(candidate.occurredAt).getTime();
      const match = (data as { id: string; occurred_at: string }[]).find((row) => {
        const rowMs = new Date(row.occurred_at).getTime();
        return Number.isFinite(rowMs) && Math.abs(rowMs - targetMs) <= INTERNAL_TRANSFER_PAIR_WINDOW_MS;
      });
      return match ? { id: match.id } : null;
    },

    async markInternalTransfer(ids) {
      const { error } = await sb
        .from("transactions")
        .update({ is_internal_transfer: true, status: "confirmed" })
        .in("id", ids);
      if (error) throw new Error(`Failed to mark internal transfer: ${error.message}`);
    },

    async touchToken(tokenHash) {
      await sb
        .from("ingest_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("token_hash", tokenHash);
    },

    async getPushTokens(userId) {
      const { data, error } = await sb
        .from("push_tokens")
        .select("token")
        .eq("user_id", userId);
      if (error || !data) return [];
      return (data as { token: string }[]).map((r) => r.token);
    },

    async countPending(userId) {
      const { count, error } = await sb
        .from("transactions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "pending");
      if (error) return 0;
      return count ?? 0;
    },

    async sendPush(messages) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(messages),
      });
    },

    logEvent: (e) => void logAiEvent(e),
  };

  Deno.serve(withSentry("ingest-sms", (req) => handleIngest(req, deps)));
}

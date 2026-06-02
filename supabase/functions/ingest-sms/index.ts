// Edge Function: ingest-sms
// PUBLIC endpoint (verify_jwt = false) authenticated by a per-user hashed token.
//
// POST { text: string, token: string, received_at?: string }
//   -> 200 { ok: true }               (transaction inserted as pending)
//   -> 200 { ok: true, skipped: true } (no amount found — OTP / promo / other)
//   -> 401                             (missing or unknown/revoked token)
//   -> 4xx / 5xx                       (validation errors, server faults)
//
// The service-role key is used server-side only; RLS is bypassed intentionally
// so the function can resolve user_id from a validated token and write on their
// behalf.
import { corsHeaders } from "../_shared/cors.ts";
import { categorize, type ParsedTransaction } from "../_shared/categorize.ts";
import { sha256Hex } from "../_shared/hash.ts";

const MAX_TEXT_LENGTH = 2000;

// ---------------------------------------------------------------------------
// Injectable dependency interface (enables unit tests with no network or DB).
// ---------------------------------------------------------------------------

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
  ) => Promise<ParsedTransaction>;
  /**
   * Given a sha256-hex token hash, return the associated user_id, or null if
   * the token does not exist or is revoked.
   */
  lookupUserId: (tokenHash: string) => Promise<string | null>;
  /** Insert a pending transaction row into the DB. Throw on error. */
  insertPending: (row: Record<string, unknown>) => Promise<void>;
  /** Best-effort: update last_used_at for the token. */
  touchToken: (tokenHash: string) => Promise<void>;
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
  let parsed: ParsedTransaction;
  try {
    parsed = await deps.categorizeFn(text, "en", deps.groqKey);
  } catch (_e) {
    return json({ error: "Failed to categorize SMS text." }, 502);
  }

  // Round amount to 2 decimal places.
  const amount = Math.round((parsed.amount ?? 0) * 100) / 100;

  // Non-transaction SMS (OTP, promo, …) — skip without inserting.
  if (amount <= 0) {
    return json({ ok: true, skipped: true }, 200);
  }

  // --- Resolve occurred_at ---
  const receivedAt = typeof body.received_at === "string"
    ? body.received_at
    : undefined;
  let occurredAt: string;
  if (receivedAt !== undefined) {
    const d = new Date(receivedAt);
    occurredAt = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } else {
    occurredAt = new Date().toISOString();
  }

  // --- Insert the pending transaction row ---
  try {
    await deps.insertPending({
      user_id: userId,
      type: parsed.type,
      amount,
      currency: "EGP",
      category_slug: parsed.category_slug,
      note: parsed.note,
      raw_text: text,
      source: "sms",
      status: "pending",
      confidence: parsed.confidence,
      occurred_at: occurredAt,
    });
  } catch (_e) {
    return json({ error: "Failed to save transaction." }, 502);
  }

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

    categorizeFn: (text, locale, apiKey) => categorize(text, locale, apiKey),

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

    async insertPending(row) {
      const { error } = await sb.from("transactions").insert(row);
      if (error) throw new Error(`DB insert failed: ${error.message}`);
    },

    async touchToken(tokenHash) {
      await sb
        .from("ingest_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("token_hash", tokenHash);
    },
  };

  Deno.serve((req) => handleIngest(req, deps));
}

// Shared AI-pipeline observability: every categorize / transcribe / ingest-sms
// call records one ai_events row (metrics + error, NO raw user text). Logging is
// fire-and-forget and never throws — monitoring must never break a user request.

export interface AiEvent {
  user_id: string | null;
  fn: "categorize" | "transcribe" | "ingest-sms";
  source?: "voice" | "text" | "sms" | null;
  model?: string | null;
  ok: boolean;
  error?: string | null;
  latency_ms?: number | null;
  confidence?: number | null;
  input_len?: number | null;
  result_count?: number | null;
}

/**
 * Decode the `sub` (user id) from a Bearer JWT WITHOUT verifying it — the gateway
 * already validated it (verify_jwt = true). Returns null if missing/unparsable.
 */
export function userIdFromAuthHeader(req: Request): string | null {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const sub = JSON.parse(atob(padded))?.sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/** Lowest parsed-item confidence (worst case), or null if no items. */
export function minConfidence(items: { confidence?: number }[]): number | null {
  const vals = items.map((i) => (typeof i.confidence === "number" ? i.confidence : 1));
  return vals.length ? Math.min(...vals) : null;
}

/**
 * Fire-and-forget insert into ai_events using the service role. Best-effort: any
 * failure (incl. missing env) is swallowed so observability can't affect the
 * request. Returns a promise the caller can ignore (do NOT await on the hot path).
 */
export async function logAiEvent(event: AiEvent): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const sb = createClient(url, key, { auth: { persistSession: false } });
    await sb.from("ai_events").insert(event);
  } catch {
    // swallow — monitoring must never break the user request
  }
}

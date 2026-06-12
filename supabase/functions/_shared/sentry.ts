// Server-side crash reporting for the Edge Functions. This is the catch-all
// safety net: the handlers already turn EXPECTED failures (Groq/Whisper errors)
// into graceful 4xx/5xx + an `ai_events` row. An exception that escapes the
// handler is therefore an actual BUG — that's what we send to Sentry.
//
// No-op unless SENTRY_DSN is set (so local dev stays silent). Init is lazy so a
// cold start that never errors pays nothing.
import * as Sentry from "npm:@sentry/deno";

let inited = false;

function ensureInit(): boolean {
  if (inited) return true;
  const dsn = Deno.env.get("SENTRY_DSN");
  if (!dsn) return false;
  Sentry.init({ dsn, tracesSampleRate: 0, defaultIntegrations: false });
  inited = true;
  return true;
}

/**
 * Wrap a `Deno.serve` handler so any UNCAUGHT error is reported to Sentry and
 * turned into a 500 (graceful responses the handler returns itself are passed
 * through untouched). Reporting is best-effort and never throws.
 */
export function withSentry(
  fn: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      return await handler(req);
    } catch (e) {
      try {
        if (ensureInit()) {
          Sentry.setTag("fn", fn);
          Sentry.captureException(e);
          await Sentry.flush(2000);
        }
      } catch {
        // monitoring must never break the response
      }
      return new Response(JSON.stringify({ error: "Internal error." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

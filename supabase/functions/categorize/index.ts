// Edge Function: categorize
// POST { text: string, locale?: 'ar' | 'en' }
//   -> 200 { transactions: ParsedTransaction[], parsed: ParsedTransaction | null }
// One utterance may contain several items -> several transactions. `parsed` is
// kept (= transactions[0]) for backward compatibility with older app builds.
// verify_jwt = true (see supabase/config.toml) — only authenticated app users.
import { corsHeaders } from "../_shared/cors.ts";
import { categorizeMany, type Locale, type ParsedTransaction } from "../_shared/categorize.ts";

const MAX_TEXT_LENGTH = 2000;

/** Injectable dependencies so the handler is unit-testable without network. */
export interface HandlerDeps {
  apiKey: string;
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
export async function handleCategorize(
  req: Request,
  deps: HandlerDeps,
): Promise<Response> {
  // CORS preflight.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  // Parse JSON body.
  let body: { text?: unknown; locale?: unknown };
  try {
    body = await req.json();
  } catch (_e) {
    return json({ error: "Invalid JSON body." }, 400);
  }

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

  const locale: Locale = body.locale === "ar" ? "ar" : "en";

  // Guard the API key (missing secret -> 500).
  if (!deps.apiKey) {
    return json({ error: "Server misconfigured: GROQ_API_KEY not set." }, 500);
  }

  // Call the LLM.
  try {
    const transactions = await deps.categorizeFn(text, locale, deps.apiKey);
    return json({ transactions, parsed: transactions[0] ?? null }, 200);
  } catch (_e) {
    return json({ error: "Failed to categorize text." }, 502);
  }
}

// Wire real dependencies into the runtime server.
// Guard with import.meta.main so the server does not bind during deno test.
if (import.meta.main) {
  Deno.serve((req) =>
    handleCategorize(req, {
      apiKey: Deno.env.get("GROQ_API_KEY") ?? "",
      categorizeFn: (text, locale, apiKey) => categorizeMany(text, locale, apiKey),
    })
  );
}

// Edge Function: gold-price
// Returns the live LOCAL Egyptian gold price (EGP per gram) for 24/21/18 karat,
// scraped from a public page and cached server-side (refresh at most hourly, so
// we don't hit the source on every app open). verify_jwt = true.
//
//   -> 200 { prices: { "24": n, "21": n, "18": n }, fetched_at, stale }
//   -> 503 { error } only if we have neither a fresh scrape NOR any cache.
//
// `stale: true` means the scrape failed and we're returning the last-known cache.
import { corsHeaders } from "../_shared/cors.ts";
import { withSentry } from "../_shared/sentry.ts";

export const KARATS = [24, 21, 18] as const;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const SOURCE_URL = "https://www.gold-price-today.com/egypt/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

export interface CachedPrices {
  prices: Record<string, number>;
  fetched_at: string; // ISO
}

export interface GoldDeps {
  readCache: () => Promise<CachedPrices | null>;
  writeCache: (prices: Record<string, number>) => Promise<void>;
  fetchSource: () => Promise<string>;
  now: () => number;
}

/**
 * PURE parser: extract EGP-per-gram by karat from the source HTML. Each karat
 * row is `عيار {k}</span> … <td>… 7,120 …` — we anchor on the table-cell label
 * (`عيار {k}</span>`, which skips the page's JSON-LD heading "عيار 21 في مصر")
 * and take the first comma-formatted number (the selling price). Class names have
 * bare numbers but no commas, so matching a comma-formatted value is robust.
 */
export function parseGoldPrices(html: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of KARATS) {
    const m = html.match(new RegExp(`عيار\\s*${k}</span>[\\s\\S]*?(\\d{1,3},\\d{3})`));
    if (m) out[String(k)] = parseInt(m[1].replace(/,/g, ""), 10);
  }
  return out;
}

function hasAllKarats(prices: Record<string, number>): boolean {
  return KARATS.every((k) => typeof prices[String(k)] === "number" && prices[String(k)] > 0);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Pure request handler — call directly from tests. */
export async function handleGoldPrice(req: Request, deps: GoldDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const cached = await deps.readCache().catch(() => null);
  const fresh = cached !== null &&
    deps.now() - Date.parse(cached.fetched_at) < CACHE_TTL_MS &&
    hasAllKarats(cached.prices);
  if (fresh) {
    return json({ prices: cached!.prices, fetched_at: cached!.fetched_at, stale: false }, 200);
  }

  // Cache missing/stale → scrape.
  try {
    const html = await deps.fetchSource();
    const prices = parseGoldPrices(html);
    if (!hasAllKarats(prices)) throw new Error("parse incomplete");
    const fetched_at = new Date(deps.now()).toISOString();
    await deps.writeCache(prices).catch(() => {/* best-effort */});
    return json({ prices, fetched_at, stale: false }, 200);
  } catch (_e) {
    // Scrape failed — fall back to last-known cache if we have one.
    if (cached !== null && hasAllKarats(cached.prices)) {
      return json({ prices: cached.prices, fetched_at: cached.fetched_at, stale: true }, 200);
    }
    return json({ error: "Gold price unavailable." }, 503);
  }
}

// Runtime wiring.
if (import.meta.main) {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const deps: GoldDeps = {
    async readCache() {
      const { data } = await sb.from("gold_prices").select("*").eq("id", "egypt").maybeSingle();
      if (!data) return null;
      return {
        prices: { "24": Number(data.price_24), "21": Number(data.price_21), "18": Number(data.price_18) },
        fetched_at: data.fetched_at as string,
      };
    },
    async writeCache(prices) {
      await sb.from("gold_prices").upsert({
        id: "egypt",
        price_24: prices["24"],
        price_21: prices["21"],
        price_18: prices["18"],
        source: SOURCE_URL,
        fetched_at: new Date().toISOString(),
      });
    },
    async fetchSource() {
      const r = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
      if (!r.ok) throw new Error(`source ${r.status}`);
      return await r.text();
    },
    now: () => Date.now(),
  };

  Deno.serve(withSentry("gold-price", (req) => handleGoldPrice(req, deps)));
}

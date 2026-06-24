import { assert, assertEquals } from "@std/assert";
import {
  handleGoldPrice,
  parseGoldPrices,
  type CachedPrices,
  type GoldDeps,
} from "../gold-price/index.ts";

// Minimal fixture mirroring the real page: a JSON-LD heading trap
// ("عيار 21 في مصر" + a stray comma-number 146,113), class names with bare
// numbers (px-3), and the actual table rows we want to read.
const FIXTURE = `
<script type="application/ld+json">{"name":"سعر الذهب عيار 21 في مصر","description":"x","price":"6230","cap":"146,113"}</script>
<table>
  <tr><td><span>عيار 24</span></td><td class="px-3 md:px-5 py-3"><span class="text-lg">7,120 <span>جنيه</span></span></td></tr>
  <tr><td><span>عيار 21</span></td><td class="px-3"><span>6,230 <span>جنيه</span></span></td></tr>
  <tr><td><span>عيار 18</span></td><td class="px-3"><span>5,340 <span>جنيه</span></span></td></tr>
</table>`;

const NOW = 1_700_000_000_000;
const iso = (ms: number) => new Date(ms).toISOString();

Deno.test("parseGoldPrices reads selling price per karat, skipping the JSON-LD trap", () => {
  assertEquals(parseGoldPrices(FIXTURE), { "24": 7120, "21": 6230, "18": 5340 });
});

Deno.test("parseGoldPrices returns only the karats it found", () => {
  const partial = parseGoldPrices(`<td><span>عيار 24</span></td><td><span>7,120</span></td>`);
  assertEquals(partial, { "24": 7120 });
});

function deps(over: Partial<GoldDeps> = {}): { deps: GoldDeps; fetches: number; writes: Record<string, number>[] } {
  let fetches = 0;
  const writes: Record<string, number>[] = [];
  return {
    fetches: 0,
    writes,
    deps: {
      readCache: () => Promise.resolve(null),
      writeCache: (p) => { writes.push(p); return Promise.resolve(); },
      fetchSource: () => { fetches++; return Promise.resolve(FIXTURE); },
      now: () => NOW,
      ...over,
    } as GoldDeps & { _fetches?: () => number },
  };
}

Deno.test("fresh cache (< 1h) is returned without scraping", async () => {
  let fetched = false;
  const cached: CachedPrices = { prices: { "24": 7000, "21": 6100, "18": 5200 }, fetched_at: iso(NOW - 30 * 60_000) };
  const res = await handleGoldPrice(new Request("http://x/gold-price", { method: "POST" }), {
    readCache: () => Promise.resolve(cached),
    writeCache: () => Promise.resolve(),
    fetchSource: () => { fetched = true; return Promise.resolve(FIXTURE); },
    now: () => NOW,
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.stale, false);
  assertEquals(body.prices, cached.prices);
  assertEquals(fetched, false, "should not scrape when cache is fresh");
});

Deno.test("stale cache (> 1h) triggers a scrape + cache write", async () => {
  const cached: CachedPrices = { prices: { "24": 7000, "21": 6100, "18": 5200 }, fetched_at: iso(NOW - 2 * 60 * 60_000) };
  const writes: Record<string, number>[] = [];
  const res = await handleGoldPrice(new Request("http://x/gold-price", { method: "POST" }), {
    readCache: () => Promise.resolve(cached),
    writeCache: (p) => { writes.push(p); return Promise.resolve(); },
    fetchSource: () => Promise.resolve(FIXTURE),
    now: () => NOW,
  });
  const body = await res.json();
  assertEquals(body.stale, false);
  assertEquals(body.prices, { "24": 7120, "21": 6230, "18": 5340 });
  assertEquals(writes.length, 1);
});

Deno.test("scrape failure with a cache → returns last-known flagged stale", async () => {
  const cached: CachedPrices = { prices: { "24": 7000, "21": 6100, "18": 5200 }, fetched_at: iso(NOW - 3 * 60 * 60_000) };
  const res = await handleGoldPrice(new Request("http://x/gold-price", { method: "POST" }), {
    readCache: () => Promise.resolve(cached),
    writeCache: () => Promise.resolve(),
    fetchSource: () => Promise.reject(new Error("network down")),
    now: () => NOW,
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.stale, true);
  assertEquals(body.prices, cached.prices);
});

Deno.test("scrape failure with NO cache → 503", async () => {
  const res = await handleGoldPrice(new Request("http://x/gold-price", { method: "POST" }), {
    readCache: () => Promise.resolve(null),
    writeCache: () => Promise.resolve(),
    fetchSource: () => Promise.reject(new Error("network down")),
    now: () => NOW,
  });
  assertEquals(res.status, 503);
});

Deno.test("OPTIONS preflight → 204", async () => {
  const res = await handleGoldPrice(new Request("http://x/gold-price", { method: "OPTIONS" }), deps().deps);
  assertEquals(res.status, 204);
});

Deno.test("incomplete scrape (missing a karat) + no cache → 503", async () => {
  const res = await handleGoldPrice(new Request("http://x/gold-price", { method: "POST" }), {
    readCache: () => Promise.resolve(null),
    writeCache: () => Promise.resolve(),
    fetchSource: () => Promise.resolve(`<td><span>عيار 24</span></td><td><span>7,120</span></td>`),
    now: () => NOW,
  });
  assertEquals(res.status, 503);
});

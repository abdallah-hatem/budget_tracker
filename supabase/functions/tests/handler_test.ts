import { assert, assertEquals } from "@std/assert";
import { handleCategorize, type HandlerDeps } from "../categorize/index.ts";
import type { ParsedTransaction } from "../_shared/categorize.ts";
import type { AiEvent } from "../_shared/aiEvents.ts";

const SAMPLE: ParsedTransaction = {
  type: "expense",
  amount: 50,
  currency: "EGP",
  category_slug: "food",
  note: "coffee",
  confidence: 0.94,
};

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    apiKey: "test-key",
    categorizeFn: () => Promise.resolve([SAMPLE]),
    ...over,
  };
}

function postReq(body: unknown): Request {
  return new Request("http://localhost/categorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("OPTIONS preflight returns 204 with CORS headers", async () => {
  const res = await handleCategorize(
    new Request("http://localhost/categorize", { method: "OPTIONS" }),
    deps(),
  );
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("non-POST method returns 405", async () => {
  const res = await handleCategorize(
    new Request("http://localhost/categorize", { method: "GET" }),
    deps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("happy path returns 200 { transactions, parsed } with CORS", async () => {
  const res = await handleCategorize(
    postReq({ text: "spent 50 EGP on coffee", locale: "en" }),
    deps(),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  const json = await res.json();
  assertEquals(json, { transactions: [SAMPLE], parsed: SAMPLE });
});

Deno.test("locale defaults to 'en' when omitted", async () => {
  let seenLocale: string | undefined;
  const res = await handleCategorize(
    postReq({ text: "coffee 50" }),
    deps({
      categorizeFn: (_t, locale) => {
        seenLocale = locale;
        return Promise.resolve([SAMPLE]);
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(seenLocale, "en");
});

Deno.test("missing/blank text returns 400", async () => {
  const res = await handleCategorize(postReq({ text: "   " }), deps());
  assertEquals(res.status, 400);
  const json = await res.json();
  assert(typeof json.error === "string");
});

Deno.test("oversized text (> 2000 chars) returns 413", async () => {
  const big = "a".repeat(2001);
  const res = await handleCategorize(postReq({ text: big }), deps());
  assertEquals(res.status, 413);
  const json = await res.json();
  assert(typeof json.error === "string");
});

Deno.test("missing GROQ_API_KEY returns 500", async () => {
  const res = await handleCategorize(
    postReq({ text: "coffee 50", locale: "en" }),
    deps({ apiKey: "" }),
  );
  assertEquals(res.status, 500);
  const json = await res.json();
  assert(typeof json.error === "string");
});

Deno.test("invalid JSON body returns 400", async () => {
  const req = new Request("http://localhost/categorize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  const res = await handleCategorize(req, deps());
  assertEquals(res.status, 400);
});

Deno.test("categorize throwing returns 502", async () => {
  const res = await handleCategorize(
    postReq({ text: "coffee 50", locale: "en" }),
    deps({
      categorizeFn: () => Promise.reject(new Error("groq exploded")),
    }),
  );
  assertEquals(res.status, 502);
  const json = await res.json();
  assert(typeof json.error === "string");
});

Deno.test("observability: success logs one ok ai_event with metrics", async () => {
  const events: AiEvent[] = [];
  await handleCategorize(
    postReq({ text: "spent 50 EGP on coffee", locale: "en" }),
    deps({ logEvent: (e) => events.push(e) }),
  );
  assertEquals(events.length, 1);
  const e = events[0];
  assertEquals(e.fn, "categorize");
  assertEquals(e.source, "text");
  assertEquals(e.ok, true);
  assertEquals(e.result_count, 1);
  assertEquals(e.confidence, 0.94); // minConfidence of the single sample
  assertEquals(e.input_len, "spent 50 EGP on coffee".length);
  assert(typeof e.latency_ms === "number");
});

Deno.test("observability: failure logs one !ok ai_event carrying the error", async () => {
  const events: AiEvent[] = [];
  await handleCategorize(
    postReq({ text: "coffee 50", locale: "en" }),
    deps({
      categorizeFn: () => Promise.reject(new Error("groq exploded")),
      logEvent: (e) => events.push(e),
    }),
  );
  assertEquals(events.length, 1);
  assertEquals(events[0].ok, false);
  assertEquals(events[0].error, "groq exploded");
});

Deno.test("observability: user_id is decoded from the Bearer JWT sub", async () => {
  const events: AiEvent[] = [];
  // JWT with payload {"sub":"user-123"} (signature irrelevant — not verified here).
  const payload = btoa(JSON.stringify({ sub: "user-123" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const req = new Request("http://localhost/categorize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer x.${payload}.y`,
    },
    body: JSON.stringify({ text: "coffee 50", locale: "en" }),
  });
  await handleCategorize(req, deps({ logEvent: (e) => events.push(e) }));
  assertEquals(events[0].user_id, "user-123");
});

// Tests for ingest-sms Edge Function handler.
// All deps are injected fakes — no network, no database.
import { assert, assertEquals } from "@std/assert";
import { handleIngest, type ExpoPushMessage, type IngestDeps } from "../ingest-sms/index.ts";
import type { ParsedTransaction } from "../_shared/categorize.ts";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PARSED: ParsedTransaction = {
  type: "expense",
  amount: 250,
  currency: "EGP",
  category_slug: "food",
  note: "lunch",
  confidence: 0.92,
};

const SAMPLE_PARSED_ZERO: ParsedTransaction = {
  type: "expense",
  amount: 0,
  currency: "EGP",
  category_slug: "other_expense",
  note: "",
  confidence: 0,
};

const VALID_TOKEN = "my-raw-secret-token";
const VALID_USER_ID = "550e8400-e29b-41d4-a716-446655440000";

// Resolve the real sha256 hash of VALID_TOKEN so our fake lookupUserId can
// match against the hashed value that handleIngest computes internally.
import { sha256Hex } from "../_shared/hash.ts";
const VALID_TOKEN_HASH = await sha256Hex(VALID_TOKEN);

/**
 * Build a full IngestDeps with sensible defaults.
 * Override individual fields via the `over` argument.
 */
function makeDeps(over: Partial<IngestDeps> = {}): IngestDeps {
  return {
    groqKey: "test-groq-key",
    categorizeFn: () => Promise.resolve(SAMPLE_PARSED),
    lookupUserId: (hash) =>
      hash === VALID_TOKEN_HASH ? Promise.resolve(VALID_USER_ID) : Promise.resolve(null),
    getRules: () => Promise.resolve([]),
    insertPending: () => Promise.resolve(),
    touchToken: () => Promise.resolve(),
    getPushTokens: () => Promise.resolve([]),
    countPending: () => Promise.resolve(3),
    sendPush: () => Promise.resolve(),
    ...over,
  };
}

/** Build a POST Request with a JSON body. */
function postReq(body: unknown, url = "http://localhost/ingest-sms"): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests: HTTP method routing
// ---------------------------------------------------------------------------

Deno.test("OPTIONS → 204 with CORS headers", async () => {
  const res = await handleIngest(
    new Request("http://localhost/ingest-sms", { method: "OPTIONS" }),
    makeDeps(),
  );
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

Deno.test("GET → 405", async () => {
  const res = await handleIngest(
    new Request("http://localhost/ingest-sms", { method: "GET" }),
    makeDeps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("PUT → 405", async () => {
  const res = await handleIngest(
    new Request("http://localhost/ingest-sms", { method: "PUT" }),
    makeDeps(),
  );
  assertEquals(res.status, 405);
});

// ---------------------------------------------------------------------------
// Tests: JSON parsing
// ---------------------------------------------------------------------------

Deno.test("invalid JSON body → 400", async () => {
  const req = new Request("http://localhost/ingest-sms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json",
  });
  const res = await handleIngest(req, makeDeps());
  assertEquals(res.status, 400);
  const json = await res.json();
  assert(typeof json.error === "string");
});

// ---------------------------------------------------------------------------
// Tests: field validation
// ---------------------------------------------------------------------------

Deno.test("missing token field → 401", async () => {
  const res = await handleIngest(postReq({ text: "spent 100 on lunch" }), makeDeps());
  assertEquals(res.status, 401);
});

Deno.test("empty token string → 401", async () => {
  const res = await handleIngest(
    postReq({ token: "", text: "spent 100 on lunch" }),
    makeDeps(),
  );
  assertEquals(res.status, 401);
});

Deno.test("missing text field → 400", async () => {
  const res = await handleIngest(postReq({ token: VALID_TOKEN }), makeDeps());
  assertEquals(res.status, 400);
});

Deno.test("empty text string → 400", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "   " }),
    makeDeps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("text > 2000 chars → 413", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "a".repeat(2001) }),
    makeDeps(),
  );
  assertEquals(res.status, 413);
  const json = await res.json();
  assert(typeof json.error === "string");
});

Deno.test("text exactly 2000 chars → not 413 (passes length check)", async () => {
  // The 2000-char text will fail at lookupUserId (returns VALID_USER_ID) or
  // categorize — we just need it NOT to be 413.
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "a".repeat(2000) }),
    makeDeps(),
  );
  assertEquals(res.status !== 413, true);
});

// ---------------------------------------------------------------------------
// Tests: server-side guards
// ---------------------------------------------------------------------------

Deno.test("missing groqKey → 500", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "spent 100 on lunch" }),
    makeDeps({ groqKey: "" }),
  );
  assertEquals(res.status, 500);
  const json = await res.json();
  assert(typeof json.error === "string");
});

// ---------------------------------------------------------------------------
// Tests: token authentication
// ---------------------------------------------------------------------------

Deno.test("unknown token (lookupUserId returns null) → 401", async () => {
  const res = await handleIngest(
    postReq({ token: "bad-token-nobody-has", text: "spent 100 on lunch" }),
    makeDeps(),
  );
  assertEquals(res.status, 401);
  const body = await res.json();
  assert(typeof body.error === "string");
});

Deno.test("revoked token (lookupUserId returns null) → 401", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "spent 100 on lunch" }),
    makeDeps({
      // Simulate a revoked token: lookupUserId always returns null.
      lookupUserId: () => Promise.resolve(null),
    }),
  );
  assertEquals(res.status, 401);
});

// ---------------------------------------------------------------------------
// Tests: happy path (amount > 0)
// ---------------------------------------------------------------------------

Deno.test("valid token + amount > 0 → insertPending called once → 200 {ok:true}", async () => {
  let insertCalled = 0;
  let insertedRow: Record<string, unknown> | null = null;

  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
    makeDeps({
      insertPending: (row) => {
        insertCalled++;
        insertedRow = row;
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true });
  assertEquals(insertCalled, 1);

  // Verify required fields in the inserted row.
  assert(insertedRow !== null);
  const row = insertedRow as Record<string, unknown>;
  assertEquals(row.status, "pending");
  assertEquals(row.source, "sms");
  assertEquals(row.user_id, VALID_USER_ID);
  assertEquals(row.amount, 250);
  assertEquals(row.currency, "EGP");
  assert(typeof row.occurred_at === "string");
});

Deno.test("valid token + amount > 0 → CORS header present on 200", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
    makeDeps(),
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
});

// ---------------------------------------------------------------------------
// Tests: user keyword rules override the AI category + note
// ---------------------------------------------------------------------------

Deno.test("a matching keyword rule overrides category + note (amount kept)", async () => {
  let row: Record<string, unknown> | null = null;
  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "VODAFONE bill 250 EGP" }),
    makeDeps({
      getRules: () => Promise.resolve([
        { keyword: "vodafone", category_slug: "bills", note: "Phone" },
      ]),
      insertPending: (r) => { row = r; return Promise.resolve(); },
    }),
  );
  assert(row !== null);
  const x = row as Record<string, unknown>;
  assertEquals(x.category_slug, "bills");
  assertEquals(x.note, "Phone");
  assertEquals(x.amount, 250); // amount still comes from the AI parse
});

Deno.test("longest matching keyword wins", async () => {
  let row: Record<string, unknown> | null = null;
  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "UBER EATS 120 EGP" }),
    makeDeps({
      getRules: () => Promise.resolve([
        { keyword: "uber", category_slug: "transport", note: null },
        { keyword: "uber eats", category_slug: "food", note: "Food delivery" },
      ]),
      insertPending: (r) => { row = r; return Promise.resolve(); },
    }),
  );
  assert(row !== null);
  const x = row as Record<string, unknown>;
  assertEquals(x.category_slug, "food");
  assertEquals(x.note, "Food delivery");
});

Deno.test("a rule with an income category flips type to income", async () => {
  let row: Record<string, unknown> | null = null;
  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "salary deposit 9000 EGP" }),
    makeDeps({
      categorizeFn: () => Promise.resolve({ ...SAMPLE_PARSED, type: "expense", amount: 9000 }),
      getRules: () => Promise.resolve([
        { keyword: "salary deposit", category_slug: "salary", note: null },
      ]),
      insertPending: (r) => { row = r; return Promise.resolve(); },
    }),
  );
  assert(row !== null);
  const x = row as Record<string, unknown>;
  assertEquals(x.category_slug, "salary");
  assertEquals(x.type, "income");
});

Deno.test("no matching rule → AI category/note are used", async () => {
  let row: Record<string, unknown> | null = null;
  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
    makeDeps({
      getRules: () => Promise.resolve([
        { keyword: "vodafone", category_slug: "bills", note: "Phone" },
      ]),
      insertPending: (r) => { row = r; return Promise.resolve(); },
    }),
  );
  assert(row !== null);
  const x = row as Record<string, unknown>;
  assertEquals(x.category_slug, "food");
  assertEquals(x.note, "lunch");
});

// ---------------------------------------------------------------------------
// Tests: amount <= 0 skips insert
// ---------------------------------------------------------------------------

Deno.test("amount === 0 → insertPending NOT called → 200 {ok:true, skipped:true}", async () => {
  let insertCalled = 0;

  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Your OTP is 123456" }),
    makeDeps({
      categorizeFn: () => Promise.resolve(SAMPLE_PARSED_ZERO),
      insertPending: () => {
        insertCalled++;
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true, skipped: true });
  assertEquals(insertCalled, 0);
});

Deno.test("very small positive amount that rounds to 0 → skipped", async () => {
  let insertCalled = 0;

  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "some SMS" }),
    makeDeps({
      categorizeFn: () =>
        Promise.resolve({ ...SAMPLE_PARSED, amount: 0.001 }),
      insertPending: () => {
        insertCalled++;
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  // 0.001 rounds to 0.00 → skipped
  assertEquals(body.skipped, true);
  assertEquals(insertCalled, 0);
});

// ---------------------------------------------------------------------------
// Tests: touchToken is called on a successful (valid-token) request
// ---------------------------------------------------------------------------

Deno.test("touchToken is called when token is valid (amount > 0)", async () => {
  let touchHashSeen: string | null = null;

  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
    makeDeps({
      touchToken: (hash) => {
        touchHashSeen = hash;
        return Promise.resolve();
      },
    }),
  );

  // touchToken should have been called with the sha256 hash of VALID_TOKEN.
  assertEquals(touchHashSeen, VALID_TOKEN_HASH);
});

Deno.test("touchToken is called when token is valid (amount === 0, skipped)", async () => {
  let touchCalled = false;

  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Your OTP is 123456" }),
    makeDeps({
      categorizeFn: () => Promise.resolve(SAMPLE_PARSED_ZERO),
      touchToken: () => {
        touchCalled = true;
        return Promise.resolve();
      },
    }),
  );

  assertEquals(touchCalled, true);
});

// ---------------------------------------------------------------------------
// Tests: received_at handling
// ---------------------------------------------------------------------------

Deno.test("valid received_at is reflected in occurred_at", async () => {
  let insertedRow: Record<string, unknown> | null = null;
  const receivedAt = "2026-01-15T10:30:00.000Z";

  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP", received_at: receivedAt }),
    makeDeps({
      insertPending: (row) => {
        insertedRow = row;
        return Promise.resolve();
      },
    }),
  );

  assertEquals((insertedRow as unknown as Record<string, unknown>).occurred_at, receivedAt);
});

Deno.test("invalid received_at falls back to current time (ISO string)", async () => {
  let insertedRow: Record<string, unknown> | null = null;

  await handleIngest(
    postReq({
      token: VALID_TOKEN,
      text: "Paid 250 EGP",
      received_at: "not-a-date",
    }),
    makeDeps({
      insertPending: (row) => {
        insertedRow = row;
        return Promise.resolve();
      },
    }),
  );

  // Should be a valid ISO timestamp (not "not-a-date").
  const row2 = insertedRow as unknown as Record<string, unknown>;
  assert(typeof row2.occurred_at === "string");
  assert(!Number.isNaN(new Date(row2.occurred_at as string).getTime()));
  assert(row2.occurred_at !== "not-a-date");
});

// ---------------------------------------------------------------------------
// Tests: categorize or insert throwing → 502
// ---------------------------------------------------------------------------

Deno.test("categorizeFn throwing → 502", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP" }),
    makeDeps({
      categorizeFn: () => Promise.reject(new Error("Groq is down")),
    }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assert(typeof body.error === "string");
});

Deno.test("insertPending throwing → 502", async () => {
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP" }),
    makeDeps({
      insertPending: () => Promise.reject(new Error("DB connection refused")),
    }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assert(typeof body.error === "string");
});

// ---------------------------------------------------------------------------
// Tests: amount rounding
// ---------------------------------------------------------------------------

Deno.test("amount is rounded to 2 decimal places before insert", async () => {
  let insertedRow: Record<string, unknown> | null = null;

  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid some amount" }),
    makeDeps({
      categorizeFn: () => Promise.resolve({ ...SAMPLE_PARSED, amount: 99.999 }),
      insertPending: (row) => {
        insertedRow = row;
        return Promise.resolve();
      },
    }),
  );

  // 99.999 rounded to 2dp = 100.00
  assertEquals((insertedRow as unknown as Record<string, unknown>).amount, 100);
});

// ---------------------------------------------------------------------------
// Tests: far-future received_at is clamped to ~now
// ---------------------------------------------------------------------------

Deno.test("far-future received_at is clamped: occurred_at is not in the far future", async () => {
  let insertedRow: Record<string, unknown> | null = null;

  // A date 1 year in the future — well beyond the 5-minute clamp window.
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Paid 250 EGP", received_at: farFuture }),
    makeDeps({
      insertPending: (row) => {
        insertedRow = row;
        return Promise.resolve();
      },
    }),
  );

  assert(insertedRow !== null);
  const row = insertedRow as Record<string, unknown>;
  assert(typeof row.occurred_at === "string");

  const insertedTime = new Date(row.occurred_at as string).getTime();
  // The clamped occurred_at must not be the far-future value.
  const farFutureMs = new Date(farFuture).getTime();
  assert(
    insertedTime < farFutureMs,
    `expected occurred_at (${row.occurred_at}) to be less than far-future (${farFuture})`,
  );
  // And it should be within a generous 60-second window of now.
  const nowMs = Date.now();
  assert(
    Math.abs(insertedTime - nowMs) < 60_000,
    `expected occurred_at to be ~now (within 60 s), got diff ${Math.abs(insertedTime - nowMs)} ms`,
  );
});

// ---------------------------------------------------------------------------
// Tests: push notifications
// ---------------------------------------------------------------------------

const FAKE_PUSH_TOKEN = "ExponentPushToken[test-device-abc]";

Deno.test(
  "push: tokens present → sendPush called once with correct message shape",
  async () => {
    const captured: ExpoPushMessage[][] = [];

    // We need to wait for the fire-and-forget push to complete.
    // Use a Promise that resolves when sendPush is called.
    let resolvePush!: () => void;
    const pushDone = new Promise<void>((r) => (resolvePush = r));

    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
      makeDeps({
        getPushTokens: () => Promise.resolve([FAKE_PUSH_TOKEN]),
        countPending: () => Promise.resolve(4),
        sendPush: (msgs) => {
          captured.push(msgs);
          resolvePush();
          return Promise.resolve();
        },
      }),
    );

    // Response must be 200 regardless.
    assertEquals(res.status, 200);
    assertEquals((await res.json()).ok, true);

    // Wait for the async push fire-and-forget to finish.
    await pushDone;

    assertEquals(captured.length, 1, "sendPush should be called exactly once");
    const msgs = captured[0];
    assertEquals(msgs.length, 1, "one message per token");
    const msg = msgs[0];
    assertEquals(msg.to, FAKE_PUSH_TOKEN);
    assertEquals(msg.title, "New transaction to review");
    assertEquals(msg.data?.url, "/(tabs)/pending");
    assertEquals(msg.data?.type, "sms_pending");
    assertEquals(msg.badge, 4, "app-icon badge = pending count");
    assert(typeof msg.body === "string" && msg.body.length > 0);
  },
);

Deno.test(
  "push: no tokens registered → sendPush NOT called",
  async () => {
    let sendPushCalled = false;

    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
      makeDeps({
        getPushTokens: () => Promise.resolve([]),
        sendPush: () => {
          sendPushCalled = true;
          return Promise.resolve();
        },
      }),
    );

    assertEquals(res.status, 200);
    // Give the fire-and-forget a tick to settle (it returns early when no tokens).
    await Promise.resolve();
    assertEquals(sendPushCalled, false, "sendPush must not be called when no tokens");
  },
);

Deno.test(
  "push: amount <= 0 (skipped path) → sendPush NOT called",
  async () => {
    let sendPushCalled = false;

    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: "Your OTP is 123456" }),
      makeDeps({
        categorizeFn: () => Promise.resolve(SAMPLE_PARSED_ZERO),
        getPushTokens: () => Promise.resolve([FAKE_PUSH_TOKEN]),
        sendPush: () => {
          sendPushCalled = true;
          return Promise.resolve();
        },
      }),
    );

    assertEquals(res.status, 200);
    assertEquals((await res.json()).skipped, true);
    // Give the event loop a few ticks.
    await Promise.resolve();
    assertEquals(sendPushCalled, false, "sendPush must not be called on skip path");
  },
);

Deno.test(
  "push: sendPush throws → still returns 200 {ok:true} (best-effort)",
  async () => {
    let resolvePush!: () => void;
    const pushDone = new Promise<void>((r) => (resolvePush = r));

    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: "Paid 250 EGP for lunch" }),
      makeDeps({
        getPushTokens: () => Promise.resolve([FAKE_PUSH_TOKEN]),
        sendPush: () => {
          resolvePush();
          return Promise.reject(new Error("Expo service unavailable"));
        },
      }),
    );

    // Response must be 200 even though sendPush throws.
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body, { ok: true });

    // Ensure the rejected push promise has been handled (no unhandled rejection).
    await pushDone;
    // Give one more tick for the catch block to run.
    await Promise.resolve();
  },
);

// Tests for ingest-sms Edge Function handler.
// All deps are injected fakes — no network, no database.
import { assert, assertEquals } from "@std/assert";
import {
  handleIngest,
  collapseRepeatedBody,
  dedupeKey,
  hasPerTransactionToken,
  extractTransferReference,
  isInstantTransfer,
  type ExpoPushMessage,
  type IngestDeps,
} from "../ingest-sms/index.ts";
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
  kind: "transaction",
};

const SAMPLE_PARSED_ZERO: ParsedTransaction = {
  type: "expense",
  amount: 0,
  currency: "EGP",
  category_slug: "other_expense",
  note: "",
  confidence: 0,
  kind: "other",
};

// A promo/offer that DOES carry an amount (e.g. "cashback capped at EGP 1,500").
// Passes the amount>0 gate but must be skipped because kind is "offer".
const SAMPLE_PARSED_OFFER: ParsedTransaction = {
  type: "expense",
  amount: 1500,
  currency: "EGP",
  category_slug: "other_expense",
  note: "moneyback",
  confidence: 0.4,
  kind: "offer",
};

// An unpaid bill / traffic-fine notice that lists an amount but is NOT a real
// money movement (e.g. a النيابة العامة "pay your fines" SMS) → kind:"other".
const SAMPLE_PARSED_FINE: ParsedTransaction = {
  type: "expense",
  amount: 200,
  currency: "EGP",
  category_slug: "other_expense",
  note: "traffic fine",
  confidence: 0.3,
  kind: "other",
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
    insertPending: () => Promise.resolve({ id: "txn-id", duplicate: false }),
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
        return Promise.resolve({ id: "txn-id", duplicate: false });
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

Deno.test("extractTransferReference extracts the bank reference from Arabic Instapay SMS", () => {
  assertEquals(
    extractTransferReference(
      "تم ارسال تحويل لحظي بمبلغ 2202.00 بتاريخ 2026-08-02 الساعة 02:44 PM رقم مرجعي 13ee4a0",
    ),
    "13ee4a0",
  );
});

Deno.test("isInstantTransfer recognizes Arabic Instapay wording", () => {
  assertEquals(
    isInstantTransfer("تم إضافة تحويل لحظي عبر شبكة المدفوعات اللحظية"),
    true,
  );
  assertEquals(isInstantTransfer("POS purchase 2202 EGP"), false);
});

Deno.test("matching opposite Instapay SMS rows are marked internal and not pushed", async () => {
  let insertedRows: Record<string, unknown>[] = [];
  let markedIds: string[][] = [];
  let pushCalled = false;

  const res = await handleIngest(
    postReq({
      token: VALID_TOKEN,
      text: "تم ارسال تحويل لحظي بمبلغ 2202.00 بتاريخ 2026-08-02 الساعة 02:44 PM رقم مرجعي 13ee4a0",
      received_at: "2026-08-02T12:44:00.000Z",
    }),
    makeDeps({
      categorizeFn: () => Promise.resolve({
        ...SAMPLE_PARSED,
        type: "expense",
        amount: 2202,
        note: "instapay",
      }),
      insertPending: (row) => {
        insertedRows.push(row);
        return Promise.resolve({ id: "outgoing-id", duplicate: false });
      },
      findMatchingTransfer: () => Promise.resolve({ id: "incoming-id" }),
      markInternalTransfer: (ids) => {
        markedIds.push(ids);
        return Promise.resolve();
      },
      getPushTokens: () => Promise.resolve([FAKE_PUSH_TOKEN]),
      sendPush: () => {
        pushCalled = true;
        return Promise.resolve();
      },
    }),
  );

  assertEquals(res.status, 200);
  assertEquals(insertedRows.length, 1);
  assertEquals(insertedRows[0].transfer_reference, "13ee4a0");
  assertEquals(markedIds, [["incoming-id", "outgoing-id"]]);
  assertEquals(pushCalled, false);
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
      insertPending: (r) => { row = r; return Promise.resolve({ id: "txn-id", duplicate: false }); },
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
      insertPending: (r) => { row = r; return Promise.resolve({ id: "txn-id", duplicate: false }); },
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
      insertPending: (r) => { row = r; return Promise.resolve({ id: "txn-id", duplicate: false }); },
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
      insertPending: (r) => { row = r; return Promise.resolve({ id: "txn-id", duplicate: false }); },
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
        return Promise.resolve({ id: "txn-id", duplicate: false });
      },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true, skipped: true, reason: "no_amount" });
  assertEquals(insertCalled, 0);
});

Deno.test("kind:'offer' with amount > 0 → insertPending NOT called → skipped as offer", async () => {
  let insertCalled = 0;

  const res = await handleIngest(
    postReq({
      token: VALID_TOKEN,
      text: "Enjoy 15% Moneyback on your Zara purchase, capped at EGP 1,500. T&Cs apply.",
    }),
    makeDeps({
      categorizeFn: () => Promise.resolve(SAMPLE_PARSED_OFFER),
      insertPending: () => {
        insertCalled++;
        return Promise.resolve({ id: "txn-id", duplicate: false });
      },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true, skipped: true, reason: "offer" });
  assertEquals(insertCalled, 0);
});

Deno.test("kind:'other' with amount > 0 (unpaid fine/bill) → NOT inserted → skipped", async () => {
  let insertCalled = 0;

  const res = await handleIngest(
    postReq({
      token: VALID_TOKEN,
      text: "النيابة العامة: تم تسجيل مخالفة بقيمه 200.00 - ادفع مخالفاتك",
    }),
    makeDeps({
      categorizeFn: () => Promise.resolve(SAMPLE_PARSED_FINE),
      insertPending: () => {
        insertCalled++;
        return Promise.resolve({ id: "txn-id", duplicate: false });
      },
    }),
  );

  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { ok: true, skipped: true, reason: "other" });
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
        return Promise.resolve({ id: "txn-id", duplicate: false });
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
        return Promise.resolve({ id: "txn-id", duplicate: false });
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
        return Promise.resolve({ id: "txn-id", duplicate: false });
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
    postReq({ token: VALID_TOKEN, text: "POS purchase EGP 99.999" }),
    makeDeps({
      categorizeFn: () => Promise.resolve({ ...SAMPLE_PARSED, amount: 99.999 }),
      insertPending: (row) => {
        insertedRow = row;
        return Promise.resolve({ id: "txn-id", duplicate: false });
      },
    }),
  );

  // 99.999 rounded to 2dp = 100.00
  assertEquals((insertedRow as unknown as Record<string, unknown>).amount, 100);
});

Deno.test("no-digit text is skipped BEFORE Groq (saves a token quota call)", async () => {
  let categorizeCalled = false;
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "Your verification code has been sent" }),
    makeDeps({
      categorizeFn: () => {
        categorizeCalled = true;
        return Promise.resolve(SAMPLE_PARSED);
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true, skipped: true, reason: "no_amount" });
  assertEquals(categorizeCalled, false); // never hit Groq
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
        return Promise.resolve({ id: "txn-id", duplicate: false });
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
    // Long-press actions: category + the txn id the actions act on.
    assertEquals(msg.categoryId, "sms_pending");
    assertEquals(msg.data?.txnId, "txn-id");
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

// ---------------------------------------------------------------------------
// Tests: doubled-notification-body collapse (Android BIG_TEXT + TEXT dedup)
// ---------------------------------------------------------------------------

Deno.test("collapseRepeatedBody: drops a truncated line contained in the full one", () => {
  const t = "تم خصم 250 من حسابك\nتم خصم 250 من حسابك رقم xxxx1234 لدى كارفور";
  assertEquals(collapseRepeatedBody(t), "تم خصم 250 من حسابك رقم xxxx1234 لدى كارفور");
});

Deno.test("collapseRepeatedBody: drops an exact-duplicate line", () => {
  assertEquals(collapseRepeatedBody("Purchase EGP 250\nPurchase EGP 250"), "Purchase EGP 250");
});

Deno.test("collapseRepeatedBody: single-line body is returned unchanged (iOS no-op)", () => {
  const t = "Purchase EGP 250 at Carrefour on card ending 1234";
  assertEquals(collapseRepeatedBody(t), t);
});

Deno.test("ingest: a doubled notification body is collapsed BEFORE categorize", async () => {
  let seenByLlm = "";
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: "خصم 250\nخصم 250 من حسابك رقم xxxx1234" }),
    makeDeps({
      categorizeFn: (txt) => {
        seenByLlm = txt;
        return Promise.resolve(SAMPLE_PARSED);
      },
    }),
  );
  assertEquals(res.status, 200);
  // The LLM must see the amount only ONCE (the truncated first line is dropped),
  // so it can't sum 250 + 250 into 500.
  assertEquals(seenByLlm, "خصم 250 من حسابك رقم xxxx1234");
});

// ---------------------------------------------------------------------------
// Tests: idempotency / duplicate suppression
// ---------------------------------------------------------------------------

const ARABIC_INSTAPAY =
  "يرجى العلم انه تم تنفيذ تحويل لحظي بمبلغ 800.00 جم إلى حسابك المنتهي بـ ********1354 " +
  "من AMR ADLY FAHEEM ALY برقم مرجعي 0896a475 بتاريخ 31-07-2026 01:09 للمزيد، برجاء الاتصال بـ 19666";

const T0 = Date.UTC(2026, 6, 31, 1, 9, 0);

Deno.test("dedupeKey: identical text → identical key", async () => {
  assertEquals(await dedupeKey(ARABIC_INSTAPAY, T0), await dedupeKey(ARABIC_INSTAPAY, T0));
});

Deno.test("dedupeKey: whitespace-only differences collapse to the same key", async () => {
  const a = await dedupeKey(ARABIC_INSTAPAY, T0);
  const b = await dedupeKey(`  ${ARABIC_INSTAPAY.replace(/ /g, "  ")}\n\n `, T0);
  assertEquals(a, b);
});

Deno.test("dedupeKey: a different reference number → different key", async () => {
  const a = await dedupeKey(ARABIC_INSTAPAY, T0);
  const b = await dedupeKey(ARABIC_INSTAPAY.replace("0896a475", "0896a476"), T0);
  assertEquals(a === b, false);
});

Deno.test("ingest: dedupe_key is written on the inserted row", async () => {
  let row: Record<string, unknown> = {};
  const res = await handleIngest(
    postReq({ token: VALID_TOKEN, text: ARABIC_INSTAPAY }),
    makeDeps({
      insertPending: (r) => {
        row = r;
        return Promise.resolve({ id: "txn-id", duplicate: false });
      },
    }),
  );
  assertEquals(res.status, 200);
  assert(typeof row.dedupe_key === "string" && (row.dedupe_key as string).length === 64);
});

Deno.test(
  "ingest: insert reports a conflict → 200 {ok:true, duplicate:true}",
  async () => {
    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: ARABIC_INSTAPAY }),
      makeDeps({
        insertPending: () => Promise.resolve({ id: null, duplicate: true }),
      }),
    );
    assertEquals(res.status, 200);
    const json = await res.json();
    assertEquals(json, { ok: true, duplicate: true });
  },
);

Deno.test(
  "ingest: a conflicting insert must NOT send a push notification",
  async () => {
    let sendPushCalled = false;
    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: ARABIC_INSTAPAY }),
      makeDeps({
        insertPending: () => Promise.resolve({ id: null, duplicate: true }),
        getPushTokens: () => Promise.resolve(["ExponentPushToken[xxx]"]),
        sendPush: () => {
          sendPushCalled = true;
          return Promise.resolve();
        },
      }),
    );
    assertEquals(res.status, 200);
    // Give the fire-and-forget push block a turn to run.
    await new Promise((r) => setTimeout(r, 10));
    assertEquals(sendPushCalled, false, "duplicate must not re-notify");
  },
);

Deno.test(
  "ingest: an already-ingested text short-circuits BEFORE the LLM call",
  async () => {
    let categorizeCalled = false;
    let insertCalled = false;
    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: ARABIC_INSTAPAY }),
      makeDeps({
        seenRecently: () => Promise.resolve(true),
        categorizeFn: () => {
          categorizeCalled = true;
          return Promise.resolve(SAMPLE_PARSED);
        },
        insertPending: () => {
          insertCalled = true;
          return Promise.resolve({ id: "txn-id", duplicate: false });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true, duplicate: true });
    assertEquals(categorizeCalled, false, "must not spend Groq tokens on a known duplicate");
    assertEquals(insertCalled, false);
  },
);

Deno.test(
  "ingest: seenRecently failing is non-fatal — the message still ingests",
  async () => {
    const res = await handleIngest(
      postReq({ token: VALID_TOKEN, text: ARABIC_INSTAPAY }),
      makeDeps({
        seenRecently: () => Promise.reject(new Error("DB unavailable")),
        insertPending: () => Promise.resolve({ id: "txn-id", duplicate: false }),
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true });
  },
);

// ---------------------------------------------------------------------------
// Tests: messages that carry NO per-transaction reference
//
// Production data contains three byte-identical copies of the message below,
// 20 HOURS apart — three real 15 EGP transfers, not one message re-delivered.
// The format has no reference number and no time of day, only a date, so it
// must never be deduplicated outside a short window.
// ---------------------------------------------------------------------------

const NO_REF_SMS =
  "تم تحويل مبلغ 15EGP من حساب رقم xxx0328 فى 26-JUL-2026 عن طريق التحويل اللحظي";

Deno.test("hasPerTransactionToken: a reference number counts", () => {
  assertEquals(hasPerTransactionToken(ARABIC_INSTAPAY), true);
});

Deno.test("hasPerTransactionToken: ALEXBANK's رقم المعاملة counts", () => {
  assertEquals(
    hasPerTransactionToken(
      "ALEXBANK قمت بتحويل لحظي بمبلغ 720.00 جم من حسابك 9001 يوم 7/1/26 في 13:16 رقم المعاملة a65363bf",
    ),
    true,
  );
});

Deno.test("hasPerTransactionToken: date-only message has no token", () => {
  assertEquals(hasPerTransactionToken(NO_REF_SMS), false);
});

Deno.test(
  "dedupeKey: a message WITH a reference dedupes regardless of time",
  async () => {
    const a = await dedupeKey(ARABIC_INSTAPAY, T0);
    const b = await dedupeKey(ARABIC_INSTAPAY, T0 + 48 * 60 * 60 * 1000);
    assertEquals(a, b, "a referenced message is self-unique — always the same key");
  },
);

Deno.test(
  "dedupeKey: two copies of a date-only message seconds apart share a key",
  async () => {
    const a = await dedupeKey(NO_REF_SMS, T0);
    const b = await dedupeKey(NO_REF_SMS, T0 + 200);
    assertEquals(a, b, "a re-delivered copy must still be caught");
  },
);

Deno.test(
  "dedupeKey: REGRESSION — two real date-only transfers hours apart must NOT collide",
  async () => {
    const a = await dedupeKey(NO_REF_SMS, T0);
    const b = await dedupeKey(NO_REF_SMS, T0 + 20 * 60 * 60 * 1000);
    assertEquals(a === b, false, "this would silently swallow a real transaction");
  },
);

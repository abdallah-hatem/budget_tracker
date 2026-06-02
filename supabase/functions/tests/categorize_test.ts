import { assert, assertEquals } from "@std/assert";
import {
  categorize,
  type ChatCompletionResponse,
  type CreateCompletion,
  GROQ_MODEL,
} from "../_shared/categorize.ts";

// Build a fake Groq (OpenAI-compatible) chat completion whose message content is
// the JSON object the model would emit in JSON mode.
function fakeCompletion(
  input: Record<string, unknown>,
): ChatCompletionResponse {
  return {
    id: "chatcmpl_test",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content: JSON.stringify(input) },
      },
    ],
  };
}

// A spy createCompletion that records the request body and returns a canned response.
function stub(
  response: ChatCompletionResponse,
): { create: CreateCompletion; calls: unknown[] } {
  const calls: unknown[] = [];
  const create: CreateCompletion = (body) => {
    calls.push(body);
    return Promise.resolve(response);
  };
  return { create, calls };
}

Deno.test("maps a well-formed English completion to ParsedTransaction", async () => {
  const { create, calls } = stub(
    fakeCompletion({
      type: "expense",
      amount: 50,
      currency: "EGP",
      category_slug: "food",
      note: "coffee",
      confidence: 0.94,
    }),
  );

  const parsed = await categorize("spent 50 EGP on coffee", "en", "fake-key", {
    createCompletion: create,
  });

  assertEquals(parsed, {
    type: "expense",
    amount: 50,
    currency: "EGP",
    category_slug: "food",
    note: "coffee",
    confidence: 0.94,
  });

  // Verify the request we sent Groq: model, max_tokens, JSON mode, system+user.
  const body = calls[0] as Record<string, unknown>;
  assertEquals(body.model, GROQ_MODEL);
  assertEquals(body.max_tokens, 256);
  assertEquals(body.response_format, { type: "json_object" });
  const messages = body.messages as Array<Record<string, unknown>>;
  assertEquals(messages.length, 2);
  assertEquals(messages[0].role, "system");
  assertEquals(messages[1].role, "user");
  assertEquals(messages[1].content, "spent 50 EGP on coffee");
  // The system prompt enumerates the allowed category slugs.
  const sys = messages[0].content as string;
  for (const slug of ["food", "salary", "transfer_in", "other_expense", "other_income"]) {
    assert(sys.includes(slug), `system prompt should list slug ${slug}`);
  }
});

Deno.test("maps an Arabic utterance and passes occurred_at through", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "expense",
      amount: 50,
      currency: "EGP",
      category_slug: "food",
      note: "قهوة",
      confidence: 0.9,
      occurred_at: "2026-06-01T10:00:00.000Z",
    }),
  );

  const parsed = await categorize("اشتريت قهوة بـ ٥٠ جنيه", "ar", "fake-key", {
    createCompletion: create,
  });

  assertEquals(parsed.note, "قهوة");
  assertEquals(parsed.category_slug, "food");
  assertEquals(parsed.occurred_at, "2026-06-01T10:00:00.000Z");
});

Deno.test("unknown slug falls back to other_expense for an expense", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "expense",
      amount: 30,
      currency: "EGP",
      category_slug: "rocket_fuel", // not in the enum
      note: "mystery",
      confidence: 0.4,
    }),
  );

  const parsed = await categorize("spent 30 on something weird", "en", "k", {
    createCompletion: create,
  });

  assertEquals(parsed.category_slug, "other_expense");
});

Deno.test("unknown slug falls back to other_income for income", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "income",
      amount: 1000,
      currency: "EGP",
      category_slug: "mystery_money",
      note: "bonus",
      confidence: 0.5,
    }),
  );

  const parsed = await categorize("got 1000", "en", "k", {
    createCompletion: create,
  });

  assertEquals(parsed.type, "income");
  assertEquals(parsed.category_slug, "other_income");
});

Deno.test("missing/zero amount -> amount 0 and confidence 0", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "expense",
      // no amount field at all
      currency: "EGP",
      category_slug: "food",
      note: "coffee",
      confidence: 0.8,
    }),
  );

  const parsed = await categorize("bought coffee", "en", "k", {
    createCompletion: create,
  });

  assertEquals(parsed.amount, 0);
  assertEquals(parsed.confidence, 0);
});

Deno.test("currency defaults to EGP and note defaults to empty string", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "expense",
      amount: 12,
      category_slug: "transport",
      confidence: 0.7,
      // no currency, no note
    }),
  );

  const parsed = await categorize("uber 12", "en", "k", {
    createCompletion: create,
  });

  assertEquals(parsed.currency, "EGP");
  assertEquals(parsed.note, "");
});

Deno.test("invalid type defaults to expense and clamps confidence to [0,1]", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "spend", // invalid
      amount: 5,
      currency: "EGP",
      category_slug: "food",
      note: "gum",
      confidence: 5, // out of range
    }),
  );

  const parsed = await categorize("gum 5", "en", "k", {
    createCompletion: create,
  });

  assertEquals(parsed.type, "expense");
  assertEquals(parsed.confidence, 1);
});

Deno.test("tolerates a ```json fenced object in the content", async () => {
  const { create } = stub({
    id: "chatcmpl_test",
    choices: [
      {
        message: {
          role: "assistant",
          content: '```json\n{"type":"expense","amount":7,"currency":"EGP",' +
            '"category_slug":"food","note":"snack","confidence":0.6}\n```',
        },
      },
    ],
  });

  const parsed = await categorize("snack 7", "en", "k", { createCompletion: create });
  assertEquals(parsed.amount, 7);
  assertEquals(parsed.category_slug, "food");
});

Deno.test("throws when the completion content is not valid JSON", async () => {
  const { create } = stub({
    id: "chatcmpl_test",
    choices: [{ message: { role: "assistant", content: "I cannot do that." } }],
  });

  let threw = false;
  try {
    await categorize("hi", "en", "k", { createCompletion: create });
  } catch (_e) {
    threw = true;
  }
  assert(threw, "expected categorize to throw on non-JSON content");
});

Deno.test("throws when the completion content is empty", async () => {
  const { create } = stub({
    id: "chatcmpl_test",
    choices: [{ message: { role: "assistant", content: "" } }],
  });

  let threw = false;
  try {
    await categorize("hi", "en", "k", { createCompletion: create });
  } catch (_e) {
    threw = true;
  }
  assert(threw, "expected categorize to throw on empty content");
});

Deno.test("coerceOccurredAt: garbage date string -> occurred_at omitted", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "expense",
      amount: 20,
      currency: "EGP",
      category_slug: "food",
      note: "test",
      confidence: 0.8,
      occurred_at: "not-a-date-at-all",
    }),
  );

  const parsed = await categorize("test", "en", "k", { createCompletion: create });
  assertEquals(parsed.occurred_at, undefined);
});

Deno.test("coerceOccurredAt: valid ISO date -> normalised ISO string", async () => {
  const { create } = stub(
    fakeCompletion({
      type: "expense",
      amount: 20,
      currency: "EGP",
      category_slug: "food",
      note: "test",
      confidence: 0.8,
      occurred_at: "2026-06-01",
    }),
  );

  const parsed = await categorize("test", "en", "k", { createCompletion: create });
  assertEquals(typeof parsed.occurred_at, "string");
  assertEquals((parsed.occurred_at ?? "").startsWith("2026-06-0"), true);
});

import { assert, assertEquals } from "@std/assert";
import {
  type AnthropicMessageResponse,
  categorize,
  type CreateMessage,
} from "../_shared/categorize.ts";

// Build a fake Anthropic Messages response whose only content block is a
// tool_use for `record_transaction` with the given input object.
function fakeToolUse(
  input: Record<string, unknown>,
): AnthropicMessageResponse {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    stop_reason: "tool_use",
    content: [
      {
        type: "tool_use",
        id: "toolu_test",
        name: "record_transaction",
        input,
      },
    ],
  };
}

// A spy createMessage that records the request body and returns a canned response.
function stub(
  response: AnthropicMessageResponse,
): { create: CreateMessage; calls: unknown[] } {
  const calls: unknown[] = [];
  const create: CreateMessage = (body) => {
    calls.push(body);
    return Promise.resolve(response);
  };
  return { create, calls };
}

Deno.test("maps a well-formed English tool_use to ParsedTransaction", async () => {
  const { create, calls } = stub(
    fakeToolUse({
      type: "expense",
      amount: 50,
      currency: "EGP",
      category_slug: "food",
      note: "coffee",
      confidence: 0.94,
    }),
  );

  const parsed = await categorize("spent 50 EGP on coffee", "en", "fake-key", {
    createMessage: create,
  });

  assertEquals(parsed, {
    type: "expense",
    amount: 50,
    currency: "EGP",
    category_slug: "food",
    note: "coffee",
    confidence: 0.94,
  });

  // Verify the request we sent Claude: model, max_tokens, forced single tool.
  const body = calls[0] as Record<string, unknown>;
  assertEquals(body.model, "claude-haiku-4-5");
  assertEquals(body.max_tokens, 256);
  assertEquals(body.tool_choice, {
    type: "tool",
    name: "record_transaction",
  });
  const tools = body.tools as Array<Record<string, unknown>>;
  assertEquals(tools.length, 1);
  assertEquals(tools[0].name, "record_transaction");
  assertEquals(tools[0].strict, true);
  const schema = tools[0].input_schema as Record<string, unknown>;
  assertEquals(schema.additionalProperties, false);
  const props = schema.properties as Record<string, Record<string, unknown>>;
  // category_slug is an enum of the 17 slugs.
  assertEquals((props.category_slug.enum as string[]).length, 17);
  assert((props.category_slug.enum as string[]).includes("food"));
  assertEquals(props.type.enum, ["expense", "income"]);
});

Deno.test("maps an Arabic utterance and passes occurred_at through", async () => {
  const { create } = stub(
    fakeToolUse({
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
    createMessage: create,
  });

  assertEquals(parsed.note, "قهوة");
  assertEquals(parsed.category_slug, "food");
  assertEquals(parsed.occurred_at, "2026-06-01T10:00:00.000Z");
});

Deno.test("unknown slug falls back to other_expense for an expense", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "expense",
      amount: 30,
      currency: "EGP",
      category_slug: "rocket_fuel", // not in the enum
      note: "mystery",
      confidence: 0.4,
    }),
  );

  const parsed = await categorize("spent 30 on something weird", "en", "k", {
    createMessage: create,
  });

  assertEquals(parsed.category_slug, "other_expense");
});

Deno.test("unknown slug falls back to other_income for income", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "income",
      amount: 1000,
      currency: "EGP",
      category_slug: "mystery_money",
      note: "bonus",
      confidence: 0.5,
    }),
  );

  const parsed = await categorize("got 1000", "en", "k", {
    createMessage: create,
  });

  assertEquals(parsed.type, "income");
  assertEquals(parsed.category_slug, "other_income");
});

Deno.test("missing/zero amount -> amount 0 and confidence 0", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "expense",
      // no amount field at all
      currency: "EGP",
      category_slug: "food",
      note: "coffee",
      confidence: 0.8,
    }),
  );

  const parsed = await categorize("bought coffee", "en", "k", {
    createMessage: create,
  });

  assertEquals(parsed.amount, 0);
  assertEquals(parsed.confidence, 0);
});

Deno.test("currency defaults to EGP and note defaults to empty string", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "expense",
      amount: 12,
      category_slug: "transport",
      confidence: 0.7,
      // no currency, no note
    }),
  );

  const parsed = await categorize("uber 12", "en", "k", {
    createMessage: create,
  });

  assertEquals(parsed.currency, "EGP");
  assertEquals(parsed.note, "");
});

Deno.test("invalid type defaults to expense and clamps confidence to [0,1]", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "spend", // invalid
      amount: 5,
      currency: "EGP",
      category_slug: "food",
      note: "gum",
      confidence: 5, // out of range
    }),
  );

  const parsed = await categorize("gum 5", "en", "k", {
    createMessage: create,
  });

  assertEquals(parsed.type, "expense");
  assertEquals(parsed.confidence, 1);
});

Deno.test("throws when the response has no tool_use block", async () => {
  const { create } = stub({
    id: "msg_test",
    type: "message",
    role: "assistant",
    stop_reason: "end_turn",
    content: [{ type: "text", text: "I cannot do that." }],
  });

  let threw = false;
  try {
    await categorize("hi", "en", "k", { createMessage: create });
  } catch (_e) {
    threw = true;
  }
  assert(threw, "expected categorize to throw when no tool_use block present");
});

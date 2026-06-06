import { assert, assertEquals } from "@std/assert";
import { handleTranscribe, type HandlerDeps } from "../transcribe/index.ts";
import type { ParsedTransaction } from "../_shared/categorize.ts";

const parsed: ParsedTransaction = {
  type: "expense",
  amount: 50,
  currency: "EGP",
  category_slug: "food",
  note: "coffee",
  confidence: 0.9,
};

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    apiKey: "gsk_test",
    transcribeFn: () => Promise.resolve("coffee 50 pounds"),
    categorizeFn: () => Promise.resolve([parsed]),
    ...over,
  };
}

const wav = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" });

function audioRequest(opts: { file?: Blob; locale?: string } = {}): Request {
  const fd = new FormData();
  if (opts.file !== undefined) fd.append("file", opts.file, "audio.wav");
  if (opts.locale) fd.append("locale", opts.locale);
  return new Request("http://localhost/transcribe", { method: "POST", body: fd });
}

Deno.test("transcribe: audio -> transcript + parsed transactions", async () => {
  const res = await handleTranscribe(audioRequest({ file: wav() }), deps());
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.text, "coffee 50 pounds");
  assertEquals(body.transactions.length, 1);
  assertEquals(body.transactions[0].amount, 50);
  assertEquals(body.parsed.category_slug, "food"); // back-compat alias
});

Deno.test("transcribe: splits a multi-item utterance into several transactions", async () => {
  const res = await handleTranscribe(
    audioRequest({ file: wav() }),
    deps({
      categorizeFn: () =>
        Promise.resolve([
          parsed,
          { ...parsed, amount: 20, note: "tea" },
          { ...parsed, amount: 40, category_slug: "transport", note: "taxi" },
        ]),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.transactions.length, 3);
  assertEquals(body.transactions[2].category_slug, "transport");
});

Deno.test("transcribe: passes locale through to the categorizer", async () => {
  let seen = "";
  const res = await handleTranscribe(
    audioRequest({ file: wav(), locale: "ar" }),
    deps({
      categorizeFn: (_t, locale) => {
        seen = locale;
        return Promise.resolve([parsed]);
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(seen, "ar");
});

Deno.test("transcribe: missing file -> 400", async () => {
  assertEquals((await handleTranscribe(audioRequest({}), deps())).status, 400);
});

Deno.test("transcribe: empty audio -> 400", async () => {
  const res = await handleTranscribe(
    audioRequest({ file: new Blob([], { type: "audio/wav" }) }),
    deps(),
  );
  assertEquals(res.status, 400);
});

Deno.test("transcribe: no speech detected -> 422", async () => {
  const res = await handleTranscribe(
    audioRequest({ file: wav() }),
    deps({ transcribeFn: () => Promise.resolve("   ") }),
  );
  assertEquals(res.status, 422);
});

Deno.test("transcribe: Whisper failure -> 502", async () => {
  const res = await handleTranscribe(
    audioRequest({ file: wav() }),
    deps({
      transcribeFn: () => Promise.reject(new Error("Whisper error 500")),
    }),
  );
  assertEquals(res.status, 502);
  const body = await res.json();
  assert(String(body.error).includes("Whisper"));
});

Deno.test("transcribe: missing api key -> 500", async () => {
  assertEquals(
    (await handleTranscribe(audioRequest({ file: wav() }), deps({ apiKey: "" }))).status,
    500,
  );
});

Deno.test("transcribe: GET -> 405", async () => {
  const res = await handleTranscribe(
    new Request("http://localhost/transcribe", { method: "GET" }),
    deps(),
  );
  assertEquals(res.status, 405);
});

Deno.test("transcribe: OPTIONS -> 204 (CORS preflight)", async () => {
  const res = await handleTranscribe(
    new Request("http://localhost/transcribe", { method: "OPTIONS" }),
    deps(),
  );
  assertEquals(res.status, 204);
});

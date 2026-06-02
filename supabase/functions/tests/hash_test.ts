import { assertEquals } from "@std/assert";
import { sha256Hex } from "../_shared/hash.ts";

Deno.test("sha256Hex('abc') matches known NIST vector", async () => {
  const result = await sha256Hex("abc");
  assertEquals(
    result,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

Deno.test("sha256Hex('') matches known empty-string digest", async () => {
  const result = await sha256Hex("");
  assertEquals(
    result,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

Deno.test("sha256Hex output is 64 lowercase hex characters", async () => {
  const result = await sha256Hex("hello world");
  assertEquals(result.length, 64);
  assertEquals(result, result.toLowerCase());
  // Must only contain hex characters
  assertEquals(/^[0-9a-f]+$/.test(result), true);
});

Deno.test("sha256Hex is deterministic — same input yields same output", async () => {
  const a = await sha256Hex("budget-tracker-token");
  const b = await sha256Hex("budget-tracker-token");
  assertEquals(a, b);
});

Deno.test("sha256Hex produces different digests for different inputs", async () => {
  const a = await sha256Hex("token-one");
  const b = await sha256Hex("token-two");
  assertEquals(a !== b, true);
});

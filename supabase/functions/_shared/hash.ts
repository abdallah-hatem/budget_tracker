// Shared crypto helper — Web Crypto sha256.
// No dependencies; works in Deno, browsers, and Deno Deploy (Edge Functions).

/**
 * Returns the lowercase hex-encoded SHA-256 digest of `input`.
 *
 * Uses the Web Crypto API (`crypto.subtle`) which is available natively in
 * Deno and all modern runtimes — no external dependencies required.
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

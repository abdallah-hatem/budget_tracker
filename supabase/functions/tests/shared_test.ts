import { assert, assertEquals } from "@std/assert";
import { CATEGORY_SLUGS } from "../_shared/categories.ts";
import { corsHeaders } from "../_shared/cors.ts";

Deno.test("CATEGORY_SLUGS contains exactly the 18 source-of-truth slugs", () => {
  const expected = [
    // expense (13)
    "food",
    "groceries",
    "transport",
    "clothes",
    "bills",
    "health",
    "entertainment",
    "sports",
    "education",
    "home",
    "travel",
    "shopping",
    "other_expense",
    // income (5)
    "salary",
    "transfer_in",
    "gift",
    "refund",
    "other_income",
  ];
  assertEquals(CATEGORY_SLUGS.length, 18);
  assertEquals([...CATEGORY_SLUGS].sort(), [...expected].sort());
});

Deno.test("CATEGORY_SLUGS has no duplicates", () => {
  assertEquals(new Set(CATEGORY_SLUGS).size, CATEGORY_SLUGS.length);
});

Deno.test("corsHeaders allows the headers functions.invoke sends", () => {
  assertEquals(corsHeaders["Access-Control-Allow-Origin"], "*");
  const allowed = corsHeaders["Access-Control-Allow-Headers"].toLowerCase();
  assert(allowed.includes("authorization"));
  assert(allowed.includes("apikey"));
  assert(allowed.includes("x-client-info"));
  assert(allowed.includes("content-type"));
});

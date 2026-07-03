// Tests for the deterministic SMS detector (_shared/smsDetect.ts).
import { assert, assertEquals } from "@std/assert";
import { extractCard, looksLikeTransaction } from "../_shared/smsDetect.ts";

// Real sample texts the user provided.
const WITH_CARD =
  "تم تحويل مبلغ 600EGP من حساب رقم xxx8889 فى 25-JUN-2026 عن طريق التحويل اللحظي";
const INSTANT_NO_CARD =
  "تم ارسال تحويل لحظي بمبلغ 600.00 من خلال شبكة المدفوعات اللحظية بتاريخ 2026-06-26 الساعة 03:10 AM رقم مرجعي a0967d1. لمزيد من الاستفسارات، برجاء الاتصال على 16222";
const PREPAID =
  "تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 400.00 جم إلى هبه ح*** ا**** رقم مرجعي 887829149444 يوم 06-23 الساعة 20:54 للمزيد اتصل بـ 19623";

Deno.test("looksLikeTransaction: true for all three bank samples", () => {
  assert(looksLikeTransaction(WITH_CARD));
  assert(looksLikeTransaction(INSTANT_NO_CARD));
  assert(looksLikeTransaction(PREPAID));
});

Deno.test("looksLikeTransaction: incoming credit (money added) — full + minimal", () => {
  const full =
    "تم اضافة مبلغ 100EGP الى حساب رقم xxx8889 فى 23-JUN-2026 عن طريق التحويل اللحظي";
  assert(looksLikeTransaction(full));
  assert(looksLikeTransaction(full, { strict: true }));
  // Minimal variant whose ONLY verb signal is the "addition" word.
  const minimal = "تم اضافة 100 الى حسابك";
  assert(looksLikeTransaction(minimal, { strict: true }));
});

Deno.test("extractCard: incoming credit also resolves the masked account", () => {
  const c = extractCard(
    "تم اضافة مبلغ 100EGP الى حساب رقم xxx8889 عن طريق التحويل اللحظي",
  );
  assertEquals(c.fingerprint, "acct:8889");
});

Deno.test("looksLikeTransaction: English transaction text", () => {
  assert(looksLikeTransaction("Your card was debited EGP 250.00 at Cafe"));
  assert(looksLikeTransaction("You spent 50 EGP"));
});

Deno.test("looksLikeTransaction: false for OTP / promo / chit-chat", () => {
  assertEquals(looksLikeTransaction("Your verification code is 123456"), false);
  assertEquals(looksLikeTransaction("مرحبا كيف حالك"), false);
  assertEquals(looksLikeTransaction("50% off this weekend only!"), false);
  assertEquals(looksLikeTransaction(""), false);
});

Deno.test("promo guard: percentage with no currency → false in both modes", () => {
  assertEquals(looksLikeTransaction("خصم 30% على مشترياتك اليوم"), false);
  assertEquals(looksLikeTransaction("خصم 30% على مشترياتك اليوم", { strict: true }), false);
});

Deno.test("strict (device): currency alone is NOT enough; a verb is required", () => {
  // Balance notice: amount + currency, no movement verb.
  const balance = "رصيدك الحالي 500 جم";
  assertEquals(looksLikeTransaction(balance), true); // lenient (server) accepts
  assertEquals(looksLikeTransaction(balance, { strict: true }), false); // device rejects
});

Deno.test("strict (device): real bank alerts still pass (all have a verb)", () => {
  assert(looksLikeTransaction(WITH_CARD, { strict: true }));
  assert(looksLikeTransaction(INSTANT_NO_CARD, { strict: true })); // no currency, but has تحويل/مبلغ
  assert(looksLikeTransaction(PREPAID, { strict: true }));
  assert(looksLikeTransaction("You spent 50 EGP", { strict: true }));
});

Deno.test("extractCard: masked account number → acct:<tail>", () => {
  const c = extractCard(WITH_CARD);
  assertEquals(c.fingerprint, "acct:8889");
  assertEquals(c.label, "•••• 8889");
});

Deno.test("extractCard: prepaid card (does NOT mistake the reference number)", () => {
  const c = extractCard(PREPAID);
  assertEquals(c.fingerprint, "prepaid");
  assert(c.label.length > 0);
});

Deno.test("extractCard: reference-only instant transfer → not acct:<ref>", () => {
  const c = extractCard(INSTANT_NO_CARD);
  // The long reference number must NOT be parsed as a card tail.
  assert(c.fingerprint !== "acct:a0967d1");
  assert(!c.fingerprint.startsWith("acct:"));
});

Deno.test("extractCard: Arabic-Indic digit mask normalizes", () => {
  // ****٨٨٨٩ (Arabic-Indic) should normalize to tail 8889.
  const c = extractCard("خصم من بطاقتك ****٨٨٨٩ بمبلغ ١٠٠ جم");
  assertEquals(c.fingerprint, "acct:8889");
});

Deno.test("extractCard: nothing identifiable → unknown bucket", () => {
  const c = extractCard("تم استلام مبلغ 100 جم");
  assertEquals(c.fingerprint, "unknown");
});

// --- Hardened tail extraction: every masking style collapses to one card ---

Deno.test("extractCard: leading-zero tail is preserved (0328, not 328)", () => {
  const c = extractCard("Purchase EGP 50 on card ****0328");
  assertEquals(c.fingerprint, "acct:0328");
  assertEquals(c.label, "•••• 0328");
});

Deno.test("extractCard: mask variants all map to the same fingerprint", () => {
  const variants = [
    "خصم من بطاقتك xxxx0328 بمبلغ 50",
    "خصم من بطاقتك ****0328 بمبلغ 50",
    "خصم من بطاقتك ••••0328 بمبلغ 50",
    "purchase on card ...0328",
    "purchase on card ----0328",
    "بطاقة ٭٭٭٭0328",
    "**** **** **** 0328 charged",
  ];
  for (const v of variants) {
    assertEquals(extractCard(v).fingerprint, "acct:0328", v);
  }
});

Deno.test("extractCard: keyword tail with NO mask glyph (ending / رقم)", () => {
  assertEquals(extractCard("Your card ending 4321 was charged EGP 90").fingerprint, "acct:4321");
  assertEquals(extractCard("card ending in 4321").fingerprint, "acct:4321");
  assertEquals(extractCard("تم إضافة مبلغ 100 إلى حساب رقم 8889").fingerprint, "acct:8889");
});

Deno.test("extractCard: a date/decimal is NOT mistaken for a card tail", () => {
  // Single dash date + a decimal amount, no mask run, no card keyword+4-digits.
  const c = extractCard("قسط مستحق بتاريخ 2026-07-10 بقيمة 3200.00");
  assert(!c.fingerprint.startsWith("acct:"));
});

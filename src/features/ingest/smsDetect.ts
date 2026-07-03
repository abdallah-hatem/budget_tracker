// smsDetect.ts (React Native) — deterministic, no-LLM detection helpers for
// bank messages. The Android headless task uses looksLikeTransaction() to decide
// whether to forward a notification when the user has NOT set any keyword.
//
// IMPORTANT: a byte-for-byte copy lives at supabase/functions/_shared/smsDetect.ts
// for the Edge Function (which also uses extractCard). Deno cannot import app
// source, so the two are kept in sync by hand — change BOTH together.

// Currency tokens (Arabic + English) that mark a money amount.
const CURRENCY = /\b(?:EGP|LE)\b|جنيه|ج\.?م|\bجم\b|pounds?/i;

// Money-movement verbs/phrases that signal an actual transaction (transfer,
// debit, purchase, …). Used as the SOLE required signal in strict mode, so the
// list is intentionally broad across Arabic + English.
const VERBS =
  /تحويل|حوالة|مبلغ|إضافة|اضافة|خصم|دفع|سداد|شراء|سحب|إيداع|ايداع|استلام|المدفوعات اللحظية|مسبقة الدفع|debit(?:ed)?|credit(?:ed)?|withdraw(?:n|al)?|purchase|payment|paid|spent|spend|transfer(?:red)?|\bsent\b|\breceived\b|deposit|charged/i;

// A monetary amount: 1+ digits with optional thousands separators and up to 2
// decimals. (Arabic-Indic digits are normalized to Western first.)
const AMOUNT = /\d{1,3}(?:[,٬]\d{3})*(?:[.٫]\d{1,2})?|\d+(?:[.٫]\d{1,2})?/;

// Marketing/discount guard: a percentage with no currency token (e.g. "50% off",
// "خصم 30%") is almost always a promo, not a transaction.
const PERCENT = /[%٪]/;

// Arabic-Indic (٠-٩) and Eastern-Arabic-Indic digits → Western.
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * True when `text` looks like a bank transaction.
 *
 * - Default (lenient — used server-side): amount AND (currency OR verb).
 * - `strict: true` (used on-device, Android): amount AND a money-movement VERB.
 *   A currency mention alone is NOT enough, so less text leaves the phone (a
 *   balance notice or currency-only promo is dropped before it's forwarded).
 *   Real bank alerts always describe an action, so they still pass.
 *
 * Both modes reject percentage promos ("50% off", "خصم 30%").
 */
export function looksLikeTransaction(
  text: string,
  opts: { strict?: boolean } = {},
): boolean {
  if (!text) return false;
  const t = normalizeDigits(text);
  if (!AMOUNT.test(t)) return false;
  const hasCurrency = CURRENCY.test(t);
  // Percentage with no currency → marketing/discount, not a transaction.
  if (PERCENT.test(t) && !hasCurrency) return false;
  const hasVerb = VERBS.test(t);
  if (opts.strict) return hasVerb;
  return hasCurrency || hasVerb;
}

export interface CardInfo {
  fingerprint: string;
  label: string;
}

const PREPAID = /مسبقة الدفع|prepaid/i;

// Mask glyphs banks use to redact the leading digits of a card/account number:
// latin x, asterisk, bullets, middle dot, Arabic star (٭), bullet operator (∙).
const MASK_GLYPH = "xX*•·٭∙";

// A MASKED tail: a run of >=2 mask glyphs (optionally space-separated) then the
// 2-6 visible tail digits — "xxx8889", "**** 8889", "•••• 0328". The masked
// prefix is what distinguishes a card number from a full reference number (which
// banks print unmasked, e.g. "رقم مرجعي 887829149444").
const MASKED_RUN = new RegExp(`(?:[${MASK_GLYPH}]\\s?){2,}(\\d{2,6})\\b`);
// A run of dots/dashes (or a single ellipsis char) then the tail — "…0328",
// "----0328". 2+ dots/dashes, so a decimal ("200.00") or a date ("2026-07-10")
// with single separators never matches.
const DOTDASH_RUN = /(?:\.{2,}|…|[-–—]{2,})\s?(\d{2,6})\b/;
// Keyword-anchored tail: an account/card word then optional separator/mask then
// exactly 4 visible digits, even with NO mask glyph — "card ending 4321",
// "رقم 8889". Only separators/mask chars may sit between the keyword and the
// digits, so a following WORD ("رقم مرجعي 8878…") blocks the match — reference
// numbers are not mistaken for cards.
const KEYWORD_TAIL =
  /(?:ending(?:\s+in)?|acct\.?|account|card|رقم|بطاقة|حساب)\s*(?:no\.?|#|:)?\s*[xX*•·٭∙.\-–—]*\s?(\d{4})\b/i;
// Account/card context words (used only as a weak fallback signal).
const ACCOUNT_CTX = /حساب|بطاقة|\baccount\b|\bcard\b/i;

function isArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

/** Canonical per-card key from a card's visible tail digits: the LAST 4, zero-
 *  padded. So "xxx0328", "****0328", "…0328" and a manually-typed "0328" all
 *  collapse to the SAME fingerprint `acct:0328`. Shared by extractCard and the
 *  manual "add card" form, so a typed card matches its future messages. */
export function fingerprintFromDigits(
  digits: string,
): { fingerprint: string; last4: string } {
  const last4 = digits.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return { fingerprint: `acct:${last4}`, last4 };
}

/** Parse a card/account fingerprint + default label. Always returns something. */
export function extractCard(text: string): CardInfo {
  const ar = isArabic(text);
  const t = normalizeDigits(text);

  if (PREPAID.test(t)) {
    return { fingerprint: "prepaid", label: ar ? "بطاقة مسبقة الدفع" : "Prepaid card" };
  }

  // Masked / keyworded number → group by its visible tail, normalized to the
  // last 4 digits so every masking style maps to one card.
  const tail = t.match(MASKED_RUN) ?? t.match(DOTDASH_RUN) ?? t.match(KEYWORD_TAIL);
  if (tail) {
    const { fingerprint, last4 } = fingerprintFromDigits(tail[1]);
    return { fingerprint, label: `•••• ${last4}` };
  }

  if (ACCOUNT_CTX.test(t)) {
    return { fingerprint: "account", label: ar ? "حساب" : "Account" };
  }

  return { fingerprint: "unknown", label: ar ? "بطاقة غير معروفة" : "Unknown card" };
}

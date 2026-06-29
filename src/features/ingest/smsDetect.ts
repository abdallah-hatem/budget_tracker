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
const MASKED_TAIL = /[x*•·]{2,}\s?(\d{2,6})\b/i;
const ACCOUNT_CTX = /حساب|بطاقة|\baccount\b|\bcard\b/i;

function isArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

/** Parse a card/account fingerprint + default label. Always returns something. */
export function extractCard(text: string): CardInfo {
  const ar = isArabic(text);
  const t = normalizeDigits(text);

  if (PREPAID.test(t)) {
    return { fingerprint: "prepaid", label: ar ? "بطاقة مسبقة الدفع" : "Prepaid card" };
  }

  const masked = t.match(MASKED_TAIL);
  if (masked) {
    const tail = masked[1].replace(/^0+(?=\d)/, "");
    return { fingerprint: `acct:${tail}`, label: `•••• ${tail}` };
  }

  if (ACCOUNT_CTX.test(t)) {
    return { fingerprint: "account", label: ar ? "حساب" : "Account" };
  }

  return { fingerprint: "unknown", label: ar ? "بطاقة غير معروفة" : "Unknown card" };
}

// smsDetect.ts (Deno / Edge) — deterministic, no-LLM detection helpers for bank
// messages. Two jobs:
//   1. looksLikeTransaction(text): cheap "is this a money movement?" pre-filter,
//      so we can skip the LLM (and on Android decide whether to forward at all)
//      WITHOUT requiring the user to configure a keyword.
//   2. extractCard(text): parse a stable per-user card/account fingerprint so
//      transactions can be grouped under a Card the user manages.
//
// IMPORTANT: a byte-for-byte copy lives at src/features/ingest/smsDetect.ts for
// the React Native side (the Android headless pre-filter). Deno cannot import
// app source, so the two are kept in sync by hand — change BOTH together.

// Currency tokens (Arabic + English) that mark a money amount.
const CURRENCY = /\b(?:EGP|LE)\b|جنيه|ج\.?م|\bجم\b|pounds?/i;

// Money-movement verbs/phrases that signal an actual transaction (transfer,
// debit, purchase, …). Used as the SOLE required signal in strict mode, so the
// list is intentionally broad across Arabic + English.
const VERBS =
  /تحويل|حوالة|مبلغ|إضافة|اضافة|خصم|دفع|سداد|شراء|سحب|إيداع|ايداع|استلام|المدفوعات اللحظية|مسبقة الدفع|debit(?:ed)?|credit(?:ed)?|withdraw(?:n|al)?|purchase|payment|paid|spent|spend|transfer(?:red)?|\bsent\b|\breceived\b|deposit|charged/i;

// A monetary amount: 1+ digits with optional thousands separators and up to 2
// decimals. Matches "600", "600.00", "1,250.50". (Arabic-Indic digits are
// normalized to Western first — see normalizeDigits.)
const AMOUNT = /\d{1,3}(?:[,٬]\d{3})*(?:[.٫]\d{1,2})?|\d+(?:[.٫]\d{1,2})?/;

// Marketing/discount guard: a percentage with no currency token (e.g. "50% off",
// "خصم 30%") is almost always a promo, not a transaction.
const PERCENT = /[%٪]/;

// Arabic-Indic (٠-٩) and Eastern-Arabic-Indic digits → Western, so the amount /
// card-number regexes work uniformly.
function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * True when `text` looks like a bank transaction.
 *
 * - Default (lenient — used server-side): amount AND (currency OR verb). The LLM
 *   still authoritatively extracts the amount, so this just avoids charging for
 *   obvious non-transactions (OTP, promo).
 * - `strict: true` (used on-device, Android): amount AND a money-movement VERB.
 *   A currency mention alone is NOT enough, so less text leaves the phone — a
 *   balance notice ("رصيدك 500 جم") or a currency-only promo is dropped before
 *   it's ever forwarded. Real bank alerts always describe an action, so they
 *   still pass.
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
  /** Stable per-user key used to find/create the Card row. */
  fingerprint: string;
  /** Human default label (the user can rename it). Localized to the text. */
  label: string;
}

const PREPAID = /مسبقة الدفع|prepaid/i;
// A MASKED account/card number: a run of mask chars (x/*/•/·) then the visible
// tail digits — e.g. "xxx8889", "****8889". A masked prefix is what
// distinguishes a card/account number from a plain reference number (which
// banks print in full, e.g. "رقم مرجعي 887829149444").
const MASKED_TAIL = /[x*•·]{2,}\s?(\d{2,6})\b/i;
// Account/card context words (used only as a weak fallback signal).
const ACCOUNT_CTX = /حساب|بطاقة|\baccount\b|\bcard\b/i;

function isArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}

/**
 * Parse a card/account fingerprint + default label from a bank message. Always
 * returns something — falls back to a generic "Unknown card" bucket so every
 * captured txn still groups under a manageable Card.
 */
export function extractCard(text: string): CardInfo {
  const ar = isArabic(text);
  const t = normalizeDigits(text);

  // 1. Prepaid card.
  if (PREPAID.test(t)) {
    return { fingerprint: "prepaid", label: ar ? "بطاقة مسبقة الدفع" : "Prepaid card" };
  }

  // 2. Masked account/card number → group by its visible tail.
  const masked = t.match(MASKED_TAIL);
  if (masked) {
    const tail = masked[1].replace(/^0+(?=\d)/, "");
    return { fingerprint: `acct:${tail}`, label: `•••• ${tail}` };
  }

  // 3. Weak fallback: an account/card word with no parseable number.
  if (ACCOUNT_CTX.test(t)) {
    return { fingerprint: "account", label: ar ? "حساب" : "Account" };
  }

  // 4. Nothing identifiable.
  return { fingerprint: "unknown", label: ar ? "بطاقة غير معروفة" : "Unknown card" };
}

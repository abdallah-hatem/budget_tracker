import type {
  NewTransaction,
  ParsedTransaction,
  TxnSource,
  TxnStatus,
} from '../../types';

/**
 * Map Claude's ParsedTransaction onto a NewTransaction row.
 * Currency is forced to EGP (MVP is EGP-only). `rawText` is the original
 * voice/typed text kept for audit and re-categorization. An empty note
 * becomes null. occurred_at falls back to now() if Claude did not provide one.
 */
export function buildCaptureRow(
  parsed: ParsedTransaction,
  rawText: string,
  source: TxnSource,
  userId: string,
  status: TxnStatus,
): NewTransaction {
  const note = parsed.note.trim();
  return {
    user_id: userId,
    type: parsed.type,
    amount: parsed.amount,
    currency: 'EGP',
    category_slug: parsed.category_slug,
    note: note.length > 0 ? note : null,
    raw_text: rawText.length > 0 ? rawText : null,
    source,
    status,
    confidence: parsed.confidence,
    occurred_at: parsed.occurred_at ?? new Date().toISOString(),
  };
}

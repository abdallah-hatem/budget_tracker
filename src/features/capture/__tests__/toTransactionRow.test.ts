import { buildCaptureRow } from '../toTransactionRow';
import type { ParsedTransaction } from '../../../types';

const parsed: ParsedTransaction = {
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  confidence: 0.91,
};

describe('buildCaptureRow', () => {
  it('maps a ParsedTransaction to a NewTransaction', () => {
    const row = buildCaptureRow(parsed, 'spent 50 on coffee', 'text', 'user-1', 'confirmed');
    expect(row).toMatchObject({
      user_id: 'user-1',
      type: 'expense',
      amount: 50,
      currency: 'EGP',
      category_slug: 'food',
      note: 'coffee',
      raw_text: 'spent 50 on coffee',
      source: 'text',
      status: 'confirmed',
      confidence: 0.91,
    });
  });

  it('forces currency to EGP regardless of the parsed value', () => {
    const row = buildCaptureRow(
      { ...parsed, currency: 'USD' },
      'raw',
      'voice',
      'user-1',
      'confirmed',
    );
    expect(row.currency).toBe('EGP');
  });

  it('uses parsed.occurred_at when present', () => {
    const row = buildCaptureRow(
      { ...parsed, occurred_at: '2026-05-01T12:00:00.000Z' },
      'raw',
      'text',
      'user-1',
      'confirmed',
    );
    expect(row.occurred_at).toBe('2026-05-01T12:00:00.000Z');
  });

  it('defaults occurred_at to a valid ISO timestamp when missing', () => {
    const row = buildCaptureRow(parsed, 'raw', 'text', 'user-1', 'confirmed');
    expect(Number.isNaN(Date.parse(row.occurred_at))).toBe(false);
  });

  it('converts an empty note to null', () => {
    const row = buildCaptureRow({ ...parsed, note: '' }, 'raw', 'text', 'user-1', 'confirmed');
    expect(row.note).toBeNull();
  });

  it('passes through the given status (pending is never used by callers but is honored)', () => {
    const row = buildCaptureRow(parsed, 'raw', 'sms', 'user-1', 'pending');
    expect(row.status).toBe('pending');
  });
});

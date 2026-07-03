import { looksLikeTransaction, extractCard } from '../smsDetect';

const WITH_CARD =
  'تم تحويل مبلغ 600EGP من حساب رقم xxx8889 فى 25-JUN-2026 عن طريق التحويل اللحظي';
const PREPAID =
  'تم تنفيذ تحويل لحظي من بطاقتكم مسبقة الدفع بمبلغ 400.00 جم رقم مرجعي 887829149444';

describe('smsDetect (RN copy)', () => {
  it('flags real bank transactions', () => {
    expect(looksLikeTransaction(WITH_CARD)).toBe(true);
    expect(looksLikeTransaction(PREPAID)).toBe(true);
    expect(looksLikeTransaction('You spent 50 EGP')).toBe(true);
  });

  it('flags incoming credit (money added), incl. minimal "اضافة" variant', () => {
    expect(
      looksLikeTransaction('تم اضافة مبلغ 100EGP الى حساب رقم xxx8889', { strict: true }),
    ).toBe(true);
    expect(looksLikeTransaction('تم اضافة 100 الى حسابك', { strict: true })).toBe(true);
  });

  it('ignores OTP / promo / chit-chat', () => {
    expect(looksLikeTransaction('Your verification code is 123456')).toBe(false);
    expect(looksLikeTransaction('مرحبا')).toBe(false);
    expect(looksLikeTransaction('')).toBe(false);
  });

  it('strict (device): requires a verb; currency-only is dropped, real alerts kept', () => {
    // currency + amount but no movement verb → lenient yes, strict no
    expect(looksLikeTransaction('رصيدك الحالي 500 جم')).toBe(true);
    expect(looksLikeTransaction('رصيدك الحالي 500 جم', { strict: true })).toBe(false);
    // real alert with a verb → strict still passes
    expect(looksLikeTransaction(WITH_CARD, { strict: true })).toBe(true);
    expect(looksLikeTransaction('You spent 50 EGP', { strict: true })).toBe(true);
  });

  it('extracts a masked account tail', () => {
    expect(extractCard(WITH_CARD)).toEqual({ fingerprint: 'acct:8889', label: '•••• 8889' });
  });

  it('detects prepaid without mistaking the reference number', () => {
    const c = extractCard(PREPAID);
    expect(c.fingerprint).toBe('prepaid');
  });

  it('falls back to unknown bucket', () => {
    expect(extractCard('تم استلام مبلغ 100 جم').fingerprint).toBe('unknown');
  });

  it('preserves a leading-zero tail (0328, not 328)', () => {
    expect(extractCard('Purchase EGP 50 on card ****0328')).toEqual({
      fingerprint: 'acct:0328',
      label: '•••• 0328',
    });
  });

  it('maps every masking style to the same fingerprint', () => {
    const variants = [
      'خصم من بطاقتك xxxx0328 بمبلغ 50',
      'خصم من بطاقتك ****0328 بمبلغ 50',
      'خصم من بطاقتك ••••0328 بمبلغ 50',
      'purchase on card ...0328',
      'purchase on card ----0328',
      'بطاقة ٭٭٭٭0328',
      '**** **** **** 0328 charged',
    ];
    for (const v of variants) {
      expect(extractCard(v).fingerprint).toBe('acct:0328');
    }
  });

  it('extracts a keyword tail with no mask glyph (ending / رقم)', () => {
    expect(extractCard('Your card ending 4321 was charged EGP 90').fingerprint).toBe('acct:4321');
    expect(extractCard('تم إضافة مبلغ 100 إلى حساب رقم 8889').fingerprint).toBe('acct:8889');
  });

  it('does not mistake a date/decimal for a card tail', () => {
    const c = extractCard('قسط مستحق بتاريخ 2026-07-10 بقيمة 3200.00');
    expect(c.fingerprint.startsWith('acct:')).toBe(false);
  });
});

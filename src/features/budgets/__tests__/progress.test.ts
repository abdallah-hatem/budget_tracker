import { computeProgress, atRisk } from '../progress';
import type { Budget } from '../types';

const b = (over: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  user_id: 'u1',
  scope: 'category',
  category_slug: 'food',
  period: 'monthly',
  amount: 1000,
  warn_pct: 80,
  ...over,
});

describe('computeProgress', () => {
  it('computes pct, remaining and an ok tone below the warning line', () => {
    const p = computeProgress(b(), 400);
    expect(p.pct).toBe(40);
    expect(p.remaining).toBe(600);
    expect(p.tone).toBe('ok');
  });

  it('flags warn at the warning threshold', () => {
    expect(computeProgress(b(), 800).tone).toBe('warn');
  });

  it('flags over at and beyond the cap', () => {
    expect(computeProgress(b(), 1000).tone).toBe('over');
    expect(computeProgress(b(), 1500).tone).toBe('over');
  });

  it('clamps remaining at zero when overspent', () => {
    expect(computeProgress(b(), 1500).remaining).toBe(0);
  });

  it('reports pct above 100 when overspent (bar caps separately)', () => {
    expect(computeProgress(b(), 1500).pct).toBe(150);
  });

  it('handles a zero-spend budget', () => {
    const p = computeProgress(b(), 0);
    expect(p.pct).toBe(0);
    expect(p.tone).toBe('ok');
  });

  it('does not warn early just because the rounded pct hits the threshold (799/1000, warn at 80)', () => {
    expect(computeProgress(b(), 799).tone).toBe('ok');
  });

  it('still warns exactly at the threshold (800/1000, warn at 80)', () => {
    expect(computeProgress(b(), 800).tone).toBe('warn');
  });

  it('clamps pct to 99 while under the cap, even though it warns (999/1000)', () => {
    const p = computeProgress(b(), 999);
    expect(p.tone).toBe('warn');
    expect(p.pct).toBe(99);
  });

  it('treats a floating-point artifact of the cap as over, matching the server\'s cent comparison', () => {
    // 999.9999999999998 is what a float sum of numeric(12,2) rows lands on
    // for a "true" 1000 spend against a 1000 cap.
    expect(computeProgress(b(), 999.9999999999998).tone).toBe('over');
  });

  it('reports over and pct 100 exactly at the cap', () => {
    const p = computeProgress(b(), 1000);
    expect(p.tone).toBe('over');
    expect(p.pct).toBe(100);
  });

  it('reports over, pct 150, and remaining 0 well past the cap', () => {
    const p = computeProgress(b(), 1500);
    expect(p.tone).toBe('over');
    expect(p.pct).toBe(150);
    expect(p.remaining).toBe(0);
  });
});

describe('atRisk', () => {
  it('returns the highest-pct budgets first, limited', () => {
    const list = [
      computeProgress(b({ id: '1' }), 200),
      computeProgress(b({ id: '2' }), 950),
      computeProgress(b({ id: '3' }), 1400),
    ];
    const out = atRisk(list, 2);
    expect(out.map((p) => p.budget.id)).toEqual(['3', '2']);
  });

  it('excludes budgets that are not near their cap', () => {
    const list = [computeProgress(b({ id: '1' }), 100)];
    expect(atRisk(list)).toEqual([]);
  });
});

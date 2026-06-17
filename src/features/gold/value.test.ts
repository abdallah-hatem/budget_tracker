import { holdingValue, goldTotalValue, goldTotalGrams, netWorth } from './value';

const PRICES = { '24': 7120, '21': 6230, '18': 5340 };

describe('holdingValue', () => {
  it('values a holding at grams × price[karat]', () => {
    expect(holdingValue({ grams: 10, karat: 21 }, PRICES)).toBe(62300);
    expect(holdingValue({ grams: 2.5, karat: 24 }, PRICES)).toBe(17800);
  });
  it('returns 0 when the karat has no price', () => {
    expect(holdingValue({ grams: 10, karat: 14 }, PRICES)).toBe(0);
  });
});

describe('goldTotalValue', () => {
  it('sums all holdings', () => {
    const holdings = [
      { grams: 10, karat: 21 }, // 62300
      { grams: 5, karat: 18 }, // 26700
    ];
    expect(goldTotalValue(holdings, PRICES)).toBe(89000);
  });
  it('is 0 for no holdings', () => {
    expect(goldTotalValue([], PRICES)).toBe(0);
  });
});

describe('goldTotalGrams', () => {
  it('sums grams across karats', () => {
    expect(goldTotalGrams([{ grams: 10.5 }, { grams: 4.25 }])).toBe(14.75);
  });
});

describe('netWorth', () => {
  it('adds cash + gold', () => {
    expect(netWorth(15000, 89000)).toBe(104000);
  });
});

import {
  initConfirmState,
  confirmReducer,
  type ConfirmState,
} from '../confirmReducer';
import type { ParsedTransaction } from '../../../types';

const parsed: ParsedTransaction = {
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  confidence: 0.9,
};

describe('initConfirmState', () => {
  it('seeds editable fields from the parsed result', () => {
    const state = initConfirmState(parsed);
    expect(state).toEqual<ConfirmState>({
      type: 'expense',
      amountText: '50',
      category_slug: 'food',
      note: 'coffee',
    });
  });

  it('renders amount 0 as an empty string for editing', () => {
    const state = initConfirmState({ ...parsed, amount: 0 });
    expect(state.amountText).toBe('');
  });

  it('renders an empty note as an empty string', () => {
    const state = initConfirmState({ ...parsed, note: '' });
    expect(state.note).toBe('');
  });
});

describe('confirmReducer', () => {
  const base = initConfirmState(parsed);

  it('SET_TYPE switches the type and resets category to other_expense for expense', () => {
    const next = confirmReducer(base, { kind: 'SET_TYPE', value: 'income' });
    expect(next.type).toBe('income');
    expect(next.category_slug).toBe('other_income');
  });

  it('SET_TYPE back to expense resets category to other_expense', () => {
    const income = confirmReducer(base, { kind: 'SET_TYPE', value: 'income' });
    const back = confirmReducer(income, { kind: 'SET_TYPE', value: 'expense' });
    expect(back.category_slug).toBe('other_expense');
  });

  it('SET_AMOUNT strips non-numeric characters and keeps one dot', () => {
    const next = confirmReducer(base, { kind: 'SET_AMOUNT', value: '12a.3.4' });
    expect(next.amountText).toBe('12.34');
  });

  it('SET_CATEGORY updates the slug', () => {
    const next = confirmReducer(base, { kind: 'SET_CATEGORY', value: 'transport' });
    expect(next.category_slug).toBe('transport');
  });

  it('SET_NOTE updates the note', () => {
    const next = confirmReducer(base, { kind: 'SET_NOTE', value: 'taxi' });
    expect(next.note).toBe('taxi');
  });
});

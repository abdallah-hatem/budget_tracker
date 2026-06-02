import type { ParsedTransaction, TxnType } from '../../types';

export interface ConfirmState {
  type: TxnType;
  amountText: string;
  category_slug: string;
  note: string;
}

export type ConfirmAction =
  | { kind: 'SET_TYPE'; value: TxnType }
  | { kind: 'SET_AMOUNT'; value: string }
  | { kind: 'SET_CATEGORY'; value: string }
  | { kind: 'SET_NOTE'; value: string };

export function initConfirmState(parsed: ParsedTransaction): ConfirmState {
  return {
    type: parsed.type,
    amountText: parsed.amount > 0 ? String(parsed.amount) : '',
    category_slug: parsed.category_slug,
    note: parsed.note,
  };
}

// Keep digits and a single decimal point.
function sanitizeAmount(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const head = cleaned.slice(0, firstDot + 1);
  const tail = cleaned.slice(firstDot + 1).replace(/\./g, '');
  return head + tail;
}

export function confirmReducer(
  state: ConfirmState,
  action: ConfirmAction,
): ConfirmState {
  switch (action.kind) {
    case 'SET_TYPE':
      return {
        ...state,
        type: action.value,
        // category list differs by kind; reset to the safe default for the new kind
        category_slug:
          action.value === 'income' ? 'other_income' : 'other_expense',
      };
    case 'SET_AMOUNT':
      return { ...state, amountText: sanitizeAmount(action.value) };
    case 'SET_CATEGORY':
      return { ...state, category_slug: action.value };
    case 'SET_NOTE':
      return { ...state, note: action.value };
    default:
      return state;
  }
}

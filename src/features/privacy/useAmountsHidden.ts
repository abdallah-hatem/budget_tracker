import { useSyncExternalStore } from 'react';
import {
  subscribeAmountVisibility,
  getAmountsHidden,
} from './amountVisibility';

/**
 * Re-render the calling component whenever the global "hide amounts" toggle
 * changes. Returns true when monetary amounts should be masked.
 */
export function useAmountsHidden(): boolean {
  return useSyncExternalStore(
    subscribeAmountVisibility,
    getAmountsHidden,
    getAmountsHidden,
  );
}

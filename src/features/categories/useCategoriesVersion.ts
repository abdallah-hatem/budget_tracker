import { useSyncExternalStore } from 'react';
import { subscribeCategories, getCategoriesVersion } from '../../lib/categories';

/**
 * Re-render the calling component whenever the custom-category registry changes
 * (e.g. the user's categories finish loading after sign-in). Returns the current
 * registry version — feed it into useMemo deps that resolve category slugs so
 * they recompute once custom categories are available, instead of rendering the
 * raw "c_…" fallback until the next unrelated re-render.
 */
export function useCategoriesVersion(): number {
  return useSyncExternalStore(
    subscribeCategories,
    getCategoriesVersion,
    getCategoriesVersion,
  );
}

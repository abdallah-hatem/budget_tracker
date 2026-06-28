// Global "hide amounts" privacy toggle.
//
// When on, every monetary amount in the app (dashboard hero, accounts,
// by-category, donut center, recent transactions, …) is masked with dots so the
// user can open the app in public without revealing balances. The flag is a
// device-level preference persisted in AsyncStorage — no server migration, ships
// via OTA, and is independent of the signed-in user.
//
// Implemented as a module-level reactive store (useSyncExternalStore-compatible)
// rather than a Provider so leaf components like <Money>/<Hero> can read it
// directly without prop-drilling or wrapping every screen.

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'amounts_hidden_v1';

/** The placeholder shown in place of a masked amount. Asterisks (not bullets —
 *  the Sora number font has no • glyph, which renders as tofu boxes). */
export const MASK = '****';

let hidden = false;
let hydrated = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

/** Subscribe to visibility changes. Returns an unsubscribe fn. */
export function subscribeAmountVisibility(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Current snapshot — true when amounts should be masked. */
export function getAmountsHidden(): boolean {
  return hidden;
}

function setHidden(next: boolean) {
  if (hidden === next) return;
  hidden = next;
  notify();
  AsyncStorage.setItem(KEY, next ? '1' : '0').catch(() => {});
}

/** Flip the toggle. */
export function toggleAmountsHidden(): void {
  setHidden(!hidden);
}

/**
 * Read the persisted value once on app start. Safe to call multiple times — only
 * the first call hits storage. Fire-and-forget; resolves when done.
 */
export async function hydrateAmountVisibility(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === '1' && !hidden) {
      hidden = true;
      notify();
    }
  } catch {
    /* leave default (visible) */
  }
}

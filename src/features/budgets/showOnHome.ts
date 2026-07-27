/**
 * "Show budgets on the home screen" preference.
 *
 * The dashboard is deliberately uncluttered, so the budget summary card is
 * OPT-IN: hidden by default, revealed by a switch on the Budgets screen. This
 * is a per-device display preference (not account state), so it lives in
 * AsyncStorage rather than the profile — the same treatment as the month-start
 * day's local copy.
 *
 * A module-level cache + listener set lets the dashboard card re-render the
 * moment the switch is flipped on the Budgets screen, without a provider.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'budgets_show_on_home_v1';

/** Hidden until the user opts in. */
const DEFAULT = false;

let cache: boolean | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export async function getShowOnHome(): Promise<boolean> {
  if (cache !== null) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw === null ? DEFAULT : raw === 'true';
  } catch {
    cache = DEFAULT;
  }
  return cache;
}

export async function setShowOnHome(next: boolean): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, String(next));
  } catch {
    /* best-effort — the in-memory value still applies for this session */
  }
  emit();
}

/** Test seam: drop the cached value so the next read hits storage. */
export function resetShowOnHomeCache(): void {
  cache = null;
}

/**
 * Subscribe to the preference. Returns the current value, defaulting to hidden
 * until the stored value has loaded, so the card never flashes on at launch.
 */
export function useShowOnHome(): boolean {
  const [value, setValue] = useState<boolean>(cache ?? DEFAULT);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void getShowOnHome().then((v) => {
        if (alive) setValue(v);
      });
    };
    read();
    listeners.add(read);
    return () => {
      alive = false;
      listeners.delete(read);
    };
  }, []);

  return value;
}

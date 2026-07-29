/**
 * "Hide this category everywhere" preference.
 *
 * Distinct from HiddenCategoriesProvider (`hidden_home_categories`), which only
 * declutters the HOME dashboard breakdown while the category stays fully
 * usable elsewhere. This store is the stronger concept: a category hidden
 * here disappears from every PICKER (capture, manual add, edit, budgets,
 * rules, notification quick-actions, the transactions filter chips) — the
 * user is saying "I never use this built-in category." Display of existing
 * data (labels, icons, colors on already-recorded transactions) is untouched;
 * only the pickers a user chooses FROM are filtered.
 *
 * Device-level preference, stored in AsyncStorage — no server migration,
 * ships via OTA. Built-in and custom slugs alike.
 *
 * Provider-free by design (mirrors src/features/budgets/showOnHome.ts): a
 * module-level cache + listener set lets every screen react instantly to a
 * toggle in Settings, without needing a provider mounted above it — several
 * pickers (e.g. app/budgets.tsx) live on the root stack, outside the (tabs)
 * layout where HiddenCategoriesProvider is mounted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import type { Category } from '../../types';

const KEY = 'hidden_categories_v1';

/** Nothing hidden until the user opts in. */
const DEFAULT: Set<string> = new Set();

let cache: Set<string> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

function parseStored(raw: string | null): Set<string> {
  if (!raw) return new Set(DEFAULT);
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set(arr.filter((s) => typeof s === 'string'));
  } catch {
    /* corrupt value — treat as nothing hidden */
  }
  return new Set(DEFAULT);
}

export async function getHiddenCategories(): Promise<Set<string>> {
  if (cache !== null) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = parseStored(raw);
  } catch {
    cache = new Set(DEFAULT);
  }
  return cache;
}

export async function setCategoryHidden(slug: string, hidden: boolean): Promise<void> {
  const current = await getHiddenCategories();
  const next = new Set(current);
  if (hidden) next.add(slug);
  else next.delete(slug);
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    /* best-effort — the in-memory value still applies for this session */
  }
  emit();
}

/** Test seam: drop the cached value so the next read hits storage. */
export function resetHiddenCategoriesCache(): void {
  cache = null;
}

/**
 * Subscribe to the hidden-category set. Returns the current value, defaulting
 * to "nothing hidden" until the stored value has loaded, so pickers never
 * flash a category away and back on launch.
 */
export function useHiddenCategories(): Set<string> {
  const [value, setValue] = useState<Set<string>>(cache ?? DEFAULT);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void getHiddenCategories().then((v) => {
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

/**
 * Pure filter: drop hidden slugs from `list`, except `keepSlug` — always kept
 * even when hidden, so a picker can still represent a row's CURRENT value
 * (e.g. editing a transaction already filed under a category the user has
 * since hidden). Exported standalone so it's trivially unit-testable without
 * mounting a component.
 */
export function filterVisibleCategories(
  list: Category[],
  hidden: Set<string>,
  keepSlug?: string | null,
): Category[] {
  return list.filter((c) => !hidden.has(c.slug) || c.slug === keepSlug);
}

/**
 * Reactive picker source: `expenseCategories()` / `incomeCategories()` minus
 * hidden slugs, always keeping `keepSlug` (the picker's current value) even
 * if it's hidden. Every category picker in the app should render from this
 * hook instead of calling `expenseCategories()`/`incomeCategories()` directly.
 */
export function useVisibleCategories(
  kind: 'expense' | 'income',
  keepSlug?: string | null,
): Category[] {
  const hidden = useHiddenCategories();
  const list = kind === 'income' ? incomeCategories() : expenseCategories();
  return filterVisibleCategories(list, hidden, keepSlug);
}

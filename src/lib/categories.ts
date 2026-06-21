// src/lib/categories.ts — in-app mirror of supabase/seed.sql (kept in sync by tests).
// IMPORTANT: This list MUST stay in sync with supabase/seed.sql and
// supabase/functions/_shared/categories.ts. The unit test guards this contract.
import type { Category } from '../types';

export const CATEGORIES: Category[] = [
  // Expense
  { slug: 'food',          name_en: 'Food & Drink',      name_ar: 'طعام وشراب',    kind: 'expense', icon: 'food',             color: '#F97316', sort_order: 10 },
  { slug: 'groceries',     name_en: 'Groceries',         name_ar: 'بقالة',         kind: 'expense', icon: 'cart',             color: '#22C55E', sort_order: 20 },
  { slug: 'transport',     name_en: 'Transport',         name_ar: 'مواصلات',       kind: 'expense', icon: 'car',              color: '#3B82F6', sort_order: 30 },
  { slug: 'clothes',       name_en: 'Clothes',           name_ar: 'ملابس',         kind: 'expense', icon: 'tshirt-crew',      color: '#EC4899', sort_order: 40 },
  { slug: 'bills',         name_en: 'Bills & Utilities', name_ar: 'فواتير ومرافق', kind: 'expense', icon: 'file-document',    color: '#EAB308', sort_order: 50 },
  { slug: 'health',        name_en: 'Health',            name_ar: 'صحة',           kind: 'expense', icon: 'heart-pulse',      color: '#EF4444', sort_order: 60 },
  { slug: 'entertainment', name_en: 'Entertainment',     name_ar: 'ترفيه',         kind: 'expense', icon: 'gamepad-variant',  color: '#A855F7', sort_order: 70 },
  { slug: 'sports',        name_en: 'Sports',            name_ar: 'رياضة',         kind: 'expense', icon: 'soccer',           color: '#84CC16', sort_order: 75 },
  { slug: 'education',     name_en: 'Education',         name_ar: 'تعليم',         kind: 'expense', icon: 'school',           color: '#06B6D4', sort_order: 80 },
  { slug: 'home',          name_en: 'Home',              name_ar: 'منزل',          kind: 'expense', icon: 'home',             color: '#14B8A6', sort_order: 90 },
  { slug: 'travel',        name_en: 'Travel',            name_ar: 'سفر',           kind: 'expense', icon: 'airplane',         color: '#0EA5E9', sort_order: 100 },
  { slug: 'shopping',      name_en: 'Shopping',          name_ar: 'تسوق',          kind: 'expense', icon: 'shopping',         color: '#F43F5E', sort_order: 110 },
  { slug: 'other_expense', name_en: 'Other',             name_ar: 'أخرى',          kind: 'expense', icon: 'dots-horizontal',  color: '#94A3B8', sort_order: 120 },
  // Income
  { slug: 'salary',        name_en: 'Salary',            name_ar: 'راتب',          kind: 'income',  icon: 'cash-multiple',    color: '#16A34A', sort_order: 10 },
  { slug: 'transfer_in',   name_en: 'Transfer In',       name_ar: 'تحويل وارد',    kind: 'income',  icon: 'bank-transfer-in', color: '#0D9488', sort_order: 20 },
  { slug: 'gift',          name_en: 'Gift',              name_ar: 'هدية',          kind: 'income',  icon: 'gift',             color: '#D946EF', sort_order: 30 },
  { slug: 'refund',        name_en: 'Refund',            name_ar: 'استرداد',       kind: 'income',  icon: 'cash-refund',      color: '#10B981', sort_order: 40 },
  { slug: 'other_income',  name_en: 'Other',             name_ar: 'أخرى',          kind: 'income',  icon: 'dots-horizontal',  color: '#64748B', sort_order: 50 },
];

// ---------------------------------------------------------------------------
// Runtime registry: built-ins (above) + the signed-in user's CUSTOM categories,
// loaded from the DB by CategoriesProvider. All lookups below resolve against
// both, so every slug-based call site (rows, donut, pickers, avatar) renders
// custom categories without changes. Custom slugs are opaque ("c_…").
// ---------------------------------------------------------------------------
let customCategories: Category[] = [];

function indexBySlug(list: Category[]): Record<string, Category> {
  return Object.fromEntries(list.map((c) => [c.slug, c]));
}

let bySlug: Record<string, Category> = indexBySlug(CATEGORIES);

// The registry is a mutable module-level store read during render by slug-based
// lookups. Because the user's custom categories load asynchronously, components
// must re-render when it changes — otherwise a custom slug renders as its raw
// "c_…" fallback until some other re-render happens. Expose a tiny external
// store (useSyncExternalStore-compatible) so React subscribers stay in sync.
let version = 0;
const listeners = new Set<() => void>();

function emitChange(): void {
  version += 1;
  listeners.forEach((l) => l());
}

/** Subscribe to registry changes. Returns an unsubscribe fn. */
export function subscribeCategories(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Monotonic version, bumped whenever the registry changes (snapshot). */
export function getCategoriesVersion(): number {
  return version;
}

/** Replace the registered custom categories (called on load + after CRUD). */
export function setCustomCategories(list: Category[]): void {
  customCategories = list;
  bySlug = indexBySlug([...CATEGORIES, ...list]);
  emitChange();
}

/** Drop all custom categories (sign-out / tests). */
export function clearCustomCategories(): void {
  setCustomCategories([]);
}

/** True if the slug belongs to a registered custom category. */
export function isCustomSlug(slug: string): boolean {
  return customCategories.some((c) => c.slug === slug);
}

function allCategories(): Category[] {
  return [...CATEGORIES, ...customCategories];
}

// The built-in "Other" catch-all should always sit at the very end of a list,
// after the user's custom categories (which carry a large sort_order). Pin it
// last so custom categories stay visible instead of being buried past "Other".
const CATCH_ALL_SLUGS = new Set(['other_expense', 'other_income']);

function byDisplayOrder(a: Category, b: Category): number {
  const aCatchAll = CATCH_ALL_SLUGS.has(a.slug) ? 1 : 0;
  const bCatchAll = CATCH_ALL_SLUGS.has(b.slug) ? 1 : 0;
  if (aCatchAll !== bCatchAll) return aCatchAll - bCatchAll;
  return a.sort_order - b.sort_order;
}

export function categoryBySlug(slug: string): Category | undefined {
  return bySlug[slug];
}

export function expenseCategories(): Category[] {
  return allCategories()
    .filter((c) => c.kind === 'expense')
    .sort(byDisplayOrder);
}

export function incomeCategories(): Category[] {
  return allCategories()
    .filter((c) => c.kind === 'income')
    .sort(byDisplayOrder);
}

export function categorySlugs(): string[] {
  return allCategories().map((c) => c.slug);
}

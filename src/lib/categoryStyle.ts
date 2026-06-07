/**
 * categoryStyle — returns the vector icon, emoji, and fixed hue color for a
 * category slug. `icon` is a MaterialCommunityIcons name (the professional look,
 * sourced from the canonical category list); `emoji` is kept as a fallback.
 * Color tints the avatar + donut slice — NEVER income/expense direction.
 */
import { categoryBySlug } from './categories';

export interface CategoryStyleResult {
  /** MaterialCommunityIcons glyph name (what the UI renders). */
  icon: string;
  /** Legacy emoji fallback. */
  emoji: string;
  color: string;
}

const DEFAULT_ICON = 'credit-card-outline';

const CATEGORY_STYLES: Record<string, { emoji: string; color: string }> = {
  food:           { emoji: '🍔', color: '#F97316' },
  groceries:      { emoji: '🛒', color: '#22C55E' },
  transport:      { emoji: '🚗', color: '#3B82F6' },
  clothes:        { emoji: '👕', color: '#A855F7' },
  bills:          { emoji: '🧾', color: '#EAB308' },
  health:         { emoji: '💊', color: '#EC4899' },
  entertainment:  { emoji: '🎮', color: '#14B8A6' },
  sports:         { emoji: '🎾', color: '#84CC16' },
  education:      { emoji: '📚', color: '#6366F1' },
  home:           { emoji: '🏠', color: '#0EA5E9' },
  travel:         { emoji: '✈️', color: '#F43F5E' },
  shopping:       { emoji: '🛍️', color: '#D946EF' },
  other_expense:  { emoji: '💸', color: '#64748B' },
  salary:         { emoji: '💰', color: '#2BD98E' },
  transfer_in:    { emoji: '🔁', color: '#14B8A6' },
  gift:           { emoji: '🎁', color: '#F59E0B' },
  refund:         { emoji: '↩️', color: '#38BDF8' },
  other_income:   { emoji: '➕', color: '#64748B' },
};

const DEFAULT_STYLE = { emoji: '💳', color: '#6B7672' };

export function categoryStyle(slug: string): CategoryStyleResult {
  const base = CATEGORY_STYLES[slug] ?? DEFAULT_STYLE;
  return { ...base, icon: categoryBySlug(slug)?.icon ?? DEFAULT_ICON };
}

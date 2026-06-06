/**
 * categoryStyle — returns the emoji and fixed hue color for a category slug.
 * Color is used ONLY for the category avatar tint + donut slice,
 * NEVER to indicate income/expense direction.
 */

export interface CategoryStyleResult {
  emoji: string;
  color: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyleResult> = {
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

const DEFAULT_STYLE: CategoryStyleResult = { emoji: '💳', color: '#6B7672' };

export function categoryStyle(slug: string): CategoryStyleResult {
  return CATEGORY_STYLES[slug] ?? DEFAULT_STYLE;
}

import { supabase } from '../../lib/supabase';
import type { Category, CategoryKind } from '../../types';

const COLS = 'slug, name_en, name_ar, kind, icon, color, sort_order, user_id';

/** Custom categories owned by the signed-in user, in display order. */
export async function listCustomCategories(): Promise<Category[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('categories')
    .select(COLS)
    .eq('user_id', uid)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export interface NewCustomCategory {
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
}

// Custom categories sort after the built-ins (which are < 1000).
async function nextSortOrder(uid: string): Promise<number> {
  const { data } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('user_id', uid)
    .order('sort_order', { ascending: false })
    .limit(1);
  const max = (data?.[0]?.sort_order as number | undefined) ?? 990;
  return Math.max(max + 10, 1000);
}

export async function createCustomCategory(input: NewCustomCategory): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error('Not authenticated');
  const name = input.name.trim();
  if (!name) throw new Error('Name is required');
  const sort_order = await nextSortOrder(uid);
  // slug is omitted on purpose — the DB default generates an opaque "c_…" slug.
  const { error } = await supabase.from('categories').insert({
    user_id: uid,
    name_en: name,
    name_ar: name,
    kind: input.kind,
    icon: input.icon,
    color: input.color,
    sort_order,
  });
  if (error) throw new Error(error.message);
}

export async function updateCustomCategory(
  slug: string,
  patch: Partial<NewCustomCategory>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    row.name_en = name;
    row.name_ar = name;
  }
  if (patch.kind !== undefined) row.kind = patch.kind;
  if (patch.icon !== undefined) row.icon = patch.icon;
  if (patch.color !== undefined) row.color = patch.color;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from('categories').update(row).eq('slug', slug);
  if (error) throw new Error(error.message);
}

/** Delete a custom category; its transactions are reassigned to Other (RPC). */
export async function deleteCustomCategory(slug: string): Promise<void> {
  const { error } = await supabase.rpc('delete_custom_category', { p_slug: slug });
  if (error) throw new Error(error.message);
}

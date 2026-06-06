-- 0006_add_sports_category.sql — add the "sports" expense category.
-- transactions.category_slug has an FK to categories(slug), so this row must
-- exist before any transaction can be categorized as sports. Idempotent so it
-- ships safely via `supabase db push`. Mirrors src/lib/categories.ts,
-- supabase/seed.sql and supabase/functions/_shared/categories.ts (sort_order 75,
-- between entertainment 70 and education 80).

insert into public.categories (slug, name_en, name_ar, kind, icon, color, sort_order) values
  ('sports', 'Sports', 'رياضة', 'expense', 'tennis', '#84CC16', 75)
on conflict (slug) do update set
  name_en    = excluded.name_en,
  name_ar    = excluded.name_ar,
  kind       = excluded.kind,
  icon       = excluded.icon,
  color      = excluded.color,
  sort_order = excluded.sort_order;

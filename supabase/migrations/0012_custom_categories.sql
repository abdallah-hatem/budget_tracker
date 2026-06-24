-- ---------------------------------------------------------------------------
-- 0012_custom_categories — user-owned custom categories
--
-- Extends the GLOBAL public.categories table (rather than a separate table) so
-- the transactions.category_slug FK keeps working unchanged.
--   user_id IS NULL          -> built-in / global category (the seeded 18)
--   user_id = auth.uid()     -> a user's own custom category
-- ---------------------------------------------------------------------------

alter table public.categories
  add column if not exists user_id uuid references auth.users (id) on delete cascade,
  add column if not exists created_at timestamptz not null default now();

-- Custom slugs are opaque, globally unique, and FK-safe. They are never shown to
-- the user (the UI shows name_en/name_ar). Built-ins keep their explicit slugs.
alter table public.categories
  alter column slug set default ('c_' || replace(gen_random_uuid()::text, '-', ''));

create index if not exists categories_user_idx on public.categories (user_id);

-- ---------------------------------------------------------------------------
-- RLS: built-ins are world-readable; custom rows are private to their owner.
-- Replaces the old permissive "categories_select_all" (which exposed every row).
-- ---------------------------------------------------------------------------
drop policy if exists "categories_select_all" on public.categories;

create policy "categories_select_visible"
  on public.categories for select
  to anon, authenticated
  using ( user_id is null or user_id = auth.uid() );

-- Writes are limited to the caller's OWN custom rows. A null user_id (built-in)
-- fails the WITH CHECK, so clients can never create/alter a global category.
create policy "categories_insert_own"
  on public.categories for insert
  to authenticated
  with check ( user_id = auth.uid() );

create policy "categories_update_own"
  on public.categories for update
  to authenticated
  using ( user_id = auth.uid() )
  with check ( user_id = auth.uid() );

create policy "categories_delete_own"
  on public.categories for delete
  to authenticated
  using ( user_id = auth.uid() );

-- ---------------------------------------------------------------------------
-- delete_custom_category — atomically reassign a custom category's transactions
-- to the matching Other bucket, then delete the category. SECURITY INVOKER so it
-- runs under the caller's RLS (auth.uid() = the caller).
-- ---------------------------------------------------------------------------
create or replace function public.delete_custom_category(p_slug text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_kind     text;
  v_fallback text;
begin
  select kind into v_kind
    from public.categories
   where slug = p_slug and user_id = auth.uid();

  if v_kind is null then
    raise exception 'category % not found or not owned by caller', p_slug;
  end if;

  v_fallback := case when v_kind = 'income' then 'other_income' else 'other_expense' end;

  update public.transactions
     set category_slug = v_fallback
   where category_slug = p_slug and user_id = auth.uid();

  delete from public.categories
   where slug = p_slug and user_id = auth.uid();
end;
$$;

grant execute on function public.delete_custom_category(text) to authenticated;

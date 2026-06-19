# Custom Categories — Design

**Date:** 2026-06-19
**Status:** Approved, in implementation
**Branch:** `feat/custom-categories` (JS + DB + edge — OTA-able, no native module)

## Goal

Let users create their own spending/income categories with a selectable icon and
color. Custom categories must:
- Coexist with the 18 built-in categories (which stay untouched).
- Be assignable by the AI categorizer (voice / typing / SMS), not just manually.
- Work everywhere a built-in does (transaction rows, donut, pickers, avatar).

## Scope (locked)

- **AI-aware:** edge functions feed the user's custom categories to the model.
- **Built-ins untouched:** v1 = add / edit / delete your OWN custom categories only.
  No hiding/renaming/reordering built-ins.
- **Both kinds:** custom categories can be `expense` or `income`.
- **Delete → reassign:** deleting a custom category reassigns its transactions to
  `other_expense` / `other_income` (by kind). No data loss.
- **Icon set:** curated ~50 MaterialCommunityIcons glyphs (not the full set) + ~12
  preset colors from the app palette.

## 1. Data model — one migration

Extend the existing **global** `categories` table (don't add a separate table) so
the `transactions.category_slug` FK keeps working unchanged.

```sql
alter table public.categories
  add column user_id uuid references auth.users(id) on delete cascade,   -- null = built-in
  add column created_at timestamptz not null default now();

-- custom slugs are opaque + globally unique + FK-safe; never shown in the UI
alter table public.categories
  alter column slug set default ('c_' || replace(gen_random_uuid()::text, '-', ''));
```

- `user_id IS NULL` ⇒ built-in/global. `user_id = auth.uid()` ⇒ user's custom.
- One **name** field in the UI; stored to BOTH `name_en` and `name_ar` (no
  bilingual authoring in v1 — the typed label shows regardless of locale).
- Custom `sort_order` = `1000 + n` so custom sort after built-ins.

### RLS (replace `categories_select_all`)

- **select:** `user_id IS NULL OR user_id = auth.uid()`
- **insert / update / delete:** `user_id = auth.uid()` (cannot touch built-ins or
  others' categories; cannot insert a global with `user_id null`).

## 2. Delete → reassign (RPC)

`delete_custom_category(p_slug text)` — `SECURITY INVOKER`, runs under the caller's
RLS — atomically:
1. `update transactions set category_slug = <other_expense|other_income by kind>
   where category_slug = p_slug and user_id = auth.uid()`
2. `delete from categories where slug = p_slug and user_id = auth.uid()`

## 3. App — runtime category registry (the key refactor)

`src/lib/categories.ts` stays the built-in source of truth. Add a thin runtime
layer so the existing slug-based call sites keep working with custom slugs:

- **Module-level registry** holding the built-ins + a settable custom set
  (`setCustomCategories(list)` / reset for tests).
- `categoryBySlug` / `categoryStyle` / `categoryLabel` / `expenseCategories` /
  `incomeCategories` resolve against built-ins **+** registered custom rows
  (custom icon + color come from the row).
- **`CategoriesProvider`** (React context) loads the user's custom categories on
  sign-in, pushes them into the registry, and exposes `useCustomCategories()`
  (list + refresh) for the manage UI. Re-registers on add/edit/delete.

This means transaction rows, the donut, and the edit/manual pickers render custom
categories without touching each call site.

## 4. Manage UI — Settings → Categories (new `CollapsibleCard`)

```
 Categories
 ─ Your categories ──────────────
   🎾 Padel            expense   Edit  Delete
   💻 Freelance        income    Edit  Delete
   + New category
 ─ Built-in ─────────────────────  (read-only)
   🍔 Food & Drink   🛒 Groceries  …
```

Create/edit form: **name** input · **expense / income** toggle · **icon grid**
(curated ~50 MCI glyphs, scrollable) · **color row** (~12 presets). Delete confirms
("its transactions move to Other").

## 5. AI-aware categorizer (edge functions)

`categorize` / `transcribe` / `ingest-sms` fetch the requesting user's custom
categories (`slug, name, kind`) per request and merge them into BOTH:
- the **prompt catalog** — presented as `slug — "user name" (kind)` so the model
  can map "padel" → the custom slug; and
- the **`coerceSlug` allow-set** — so a custom slug validates instead of falling
  back to Other.

Then redeploy the three functions. Built-in-only behavior is unchanged when the
user has no custom categories. (Planning note: confirm `ingest-sms`'s auth path
carries the user context needed to scope the fetch.)

## 6. Tests

- Parity tests (`categories.ts` ↔ `seed.sql` ↔ `_shared/categories.ts`) **unchanged**
  — they still guard only the 18 built-ins.
- New: registry merge/resolve, CRUD api, the `delete_custom_category` RPC, and the
  edge dynamic-slug catalog + `coerceSlug` with a custom allow-set.

## 7. Shipping

All JS + DB + edge, no native module → OTA-able. At ship time: push the migration →
deploy the 3 functions → merge to `main` → OTA. No rebuild.

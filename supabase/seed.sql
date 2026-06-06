-- seed.sql — global category reference data (bilingual). Runs on `supabase db reset`.
-- Source of truth mirrored by src/lib/categories.ts (kept in sync via a unit test).
-- Slug set MUST match src/lib/categories.ts and supabase/functions/_shared/categories.ts

insert into public.categories (slug, name_en, name_ar, kind, icon, color, sort_order) values
  -- Expense
  ('food',          'Food & Drink',       'طعام وشراب',     'expense', 'food',                '#F97316', 10),
  ('groceries',     'Groceries',          'بقالة',          'expense', 'cart',                '#22C55E', 20),
  ('transport',     'Transport',          'مواصلات',        'expense', 'car',                 '#3B82F6', 30),
  ('clothes',       'Clothes',            'ملابس',          'expense', 'tshirt-crew',         '#EC4899', 40),
  ('bills',         'Bills & Utilities',  'فواتير ومرافق',  'expense', 'file-document',       '#EAB308', 50),
  ('health',        'Health',             'صحة',            'expense', 'heart-pulse',         '#EF4444', 60),
  ('entertainment', 'Entertainment',      'ترفيه',          'expense', 'movie-open',          '#A855F7', 70),
  ('sports',        'Sports',             'رياضة',          'expense', 'tennis',              '#84CC16', 75),
  ('education',     'Education',           'تعليم',          'expense', 'school',              '#06B6D4', 80),
  ('home',          'Home',               'منزل',           'expense', 'home',                '#14B8A6', 90),
  ('travel',        'Travel',             'سفر',            'expense', 'airplane',            '#0EA5E9', 100),
  ('shopping',      'Shopping',           'تسوق',           'expense', 'shopping',            '#F43F5E', 110),
  ('other_expense', 'Other',              'أخرى',           'expense', 'dots-horizontal',     '#94A3B8', 120),
  -- Income
  ('salary',        'Salary',             'راتب',           'income',  'cash-multiple',       '#16A34A', 10),
  ('transfer_in',   'Transfer In',        'تحويل وارد',     'income',  'bank-transfer-in',    '#0D9488', 20),
  ('gift',          'Gift',               'هدية',           'income',  'gift',                '#D946EF', 30),
  ('refund',        'Refund',             'استرداد',        'income',  'cash-refund',         '#10B981', 40),
  ('other_income',  'Other',              'أخرى',           'income',  'dots-horizontal',     '#64748B', 50)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 0021_rename_other_categories — disambiguate the two catch-all categories.
--
-- `other_expense` and `other_income` were BOTH labelled "Other" / "أخرى", so
-- any picker listing expense + income together (Settings → Categories, SMS
-- rules, notification quick actions) showed two identical "Other" chips with
-- no way to tell them apart. Slugs are unchanged, so every existing
-- transaction keeps its category — only the display names change.
-- ---------------------------------------------------------------------------
update public.categories
   set name_en = 'Other expense', name_ar = 'مصروفات أخرى'
 where slug = 'other_expense' and user_id is null;

update public.categories
   set name_en = 'Other income', name_ar = 'دخل آخر'
 where slug = 'other_income' and user_id is null;

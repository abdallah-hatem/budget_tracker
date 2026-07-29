-- ---------------------------------------------------------------------------
-- 0022 — give other_income its own colour.
--
-- other_expense and other_income both rendered as the same slate (#64748B), so
-- side by side in a picker they looked identical. other_income becomes a muted
-- sage (#5B8C7B) — distinct in hue and closer to the income family — while
-- other_expense stays cool slate. Display-only; slugs untouched.
-- ---------------------------------------------------------------------------
update public.categories set color = '#94A3B8'
 where slug = 'other_expense' and user_id is null;

update public.categories set color = '#5B8C7B'
 where slug = 'other_income' and user_id is null;

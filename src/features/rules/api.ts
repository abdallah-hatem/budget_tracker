import { supabase } from '../../lib/supabase';

/**
 * A user keyword rule for SMS auto-categorization. When an incoming bank SMS
 * contains `keyword` (case-insensitive), ingest-sms forces this category (and
 * `note`, when set) onto the pending transaction.
 */
export interface SmsRule {
  id: string;
  keyword: string;
  category_slug: string;
  note: string | null;
  created_at: string;
}

export interface NewSmsRule {
  keyword: string;
  category_slug: string;
  note: string | null;
}

export async function listSmsRules(): Promise<SmsRule[]> {
  const { data, error } = await supabase
    .from('sms_rules')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SmsRule[];
}

/** Insert a rule. `user_id` is filled server-side (column default auth.uid()). */
export async function createSmsRule(input: NewSmsRule): Promise<SmsRule> {
  const { data, error } = await supabase
    .from('sms_rules')
    .insert({
      keyword: input.keyword.trim(),
      category_slug: input.category_slug,
      note: input.note && input.note.trim() ? input.note.trim() : null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SmsRule;
}

export async function deleteSmsRule(id: string): Promise<void> {
  const { error } = await supabase.from('sms_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

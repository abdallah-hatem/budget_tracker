import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { Locale, ParsedTransaction } from '../../types';

/**
 * Calls the `categorize` Edge Function (verify_jwt=true; the user JWT is
 * attached automatically by functions.invoke) and returns the parsed result.
 * Throws an Error carrying the server-provided message on failure.
 */
export async function requestCategorize(
  text: string,
  locale: Locale,
): Promise<ParsedTransaction> {
  const { data, error } = await supabase.functions.invoke('categorize', {
    body: { text, locale },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string } | null = null;
      try { body = await error.context.json(); } catch { /* non-JSON body */ }
      throw new Error(body?.error ?? 'Categorization failed');
    }
    throw new Error(error.message || 'Categorization failed');
  }

  const parsed = (data as { parsed?: ParsedTransaction } | null)?.parsed;
  if (!parsed) {
    throw new Error('Categorization returned no result');
  }
  return parsed;
}

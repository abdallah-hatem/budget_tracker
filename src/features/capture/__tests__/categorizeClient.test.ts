import { requestCategorize } from '../categorizeClient';
import { supabase } from '../../../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ParsedTransaction } from '../../../types';

jest.mock('../../../lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
}));

const mockedInvoke = supabase.functions.invoke as unknown as jest.Mock;

const parsed: ParsedTransaction = {
  type: 'expense',
  amount: 50,
  currency: 'EGP',
  category_slug: 'food',
  note: 'coffee',
  confidence: 0.9,
};

afterEach(() => jest.clearAllMocks());

it('invokes the categorize function with text + locale and returns parsed', async () => {
  mockedInvoke.mockResolvedValue({ data: { parsed }, error: null });

  const result = await requestCategorize('spent 50 on coffee', 'en');

  expect(mockedInvoke).toHaveBeenCalledWith('categorize', {
    body: { text: 'spent 50 on coffee', locale: 'en' },
  });
  expect(result).toEqual(parsed);
});

it('throws with the JSON error body on a FunctionsHttpError', async () => {
  const httpError = new FunctionsHttpError(
    new Response(JSON.stringify({ error: 'too long' }), { status: 413 }),
  );
  mockedInvoke.mockResolvedValue({ data: null, error: httpError });

  await expect(requestCategorize('x'.repeat(99999), 'en')).rejects.toThrow('too long');
});

it('throws a generic message on a non-HTTP error', async () => {
  mockedInvoke.mockResolvedValue({ data: null, error: new Error('network down') });

  await expect(requestCategorize('hi', 'ar')).rejects.toThrow('network down');
});

it('throws when the response payload has no parsed field', async () => {
  mockedInvoke.mockResolvedValue({ data: {}, error: null });

  await expect(requestCategorize('hi', 'en')).rejects.toThrow();
});

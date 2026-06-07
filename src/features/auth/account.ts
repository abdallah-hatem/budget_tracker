import { supabase } from '@/src/lib/supabase';

/**
 * Soft-delete the signed-in user's account: marks their profile deleted (data is
 * retained server-side, so it's recoverable by an admin) and signs them out. The
 * SessionProvider gate then refuses any future session whose profile is
 * soft-deleted, so they can't sign back in.
 */
export async function softDeleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('soft_delete_account');
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}

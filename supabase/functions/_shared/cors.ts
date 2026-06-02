// CORS headers shared by all Edge Functions in this project.
// Includes every header that supabase-js `functions.invoke` attaches so that the
// browser/native preflight (OPTIONS) succeeds.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

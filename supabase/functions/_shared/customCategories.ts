// Fetches a user's custom categories so the categorizer can assign them by name.
// Uses the service role (the user_id is already validated by the caller). Best
// effort: any failure returns [] so the AI flow degrades to built-ins only.
import type { CustomCategory } from "./categorize.ts";

export async function fetchCustomCategories(
  userId: string | null,
): Promise<CustomCategory[]> {
  if (!userId) return [];
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return [];
    const { createClient } = await import("npm:@supabase/supabase-js@2");
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("categories")
      .select("slug, name_en, kind")
      .eq("user_id", userId);
    if (error || !data) return [];
    return (data as { slug: string; name_en: string; kind: string }[]).map((r) => ({
      slug: r.slug,
      name: r.name_en,
      kind: r.kind === "income" ? "income" : "expense",
    }));
  } catch {
    return [];
  }
}

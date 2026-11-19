import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null tant que Supabase n'est pas configuré : l'application reste alors 100 % « invité ». */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
export const googleEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH === "1";

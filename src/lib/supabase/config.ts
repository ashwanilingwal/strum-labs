/**
 * Supabase is optional. Without these env vars the app runs exactly as it
 * does now — local storage, no account — and the sign-in control simply isn't
 * offered rather than appearing and then failing.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

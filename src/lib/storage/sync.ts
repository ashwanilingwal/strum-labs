/**
 * Cloud copy of the local state, for signed-in players.
 *
 * The merge rule is intentionally simple and one-directional on first contact:
 * whichever side was written more recently wins the whole document. Patterns
 * are small, edits happen on one device at a time, and a field-level merge
 * would be a lot of machinery to resolve a conflict that barely occurs. What
 * matters is that signing in never silently discards local work — if the
 * remote copy is older, the local one is pushed up instead of pulled down.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { reviveState, type AppState } from "./settings";

export interface RemoteRow {
  state: unknown;
  updated_at: string;
}

export async function pullState(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ state: AppState; updatedAt: number } | null> {
  const { data, error } = await supabase
    .from("strum_state")
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return {
    state: reviveState((data as RemoteRow).state),
    updatedAt: Date.parse((data as RemoteRow).updated_at) || 0,
  };
}

export async function pushState(
  supabase: SupabaseClient,
  userId: string,
  state: AppState,
): Promise<boolean> {
  const { error } = await supabase
    .from("strum_state")
    .upsert(
      { user_id: userId, state, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return !error;
}

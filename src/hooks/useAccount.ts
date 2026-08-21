"use client";

/**
 * Optional account. Signing in adds a synced copy of your settings; it never
 * gates anything. If Supabase isn't configured the hook reports `configured:
 * false` and the UI simply doesn't offer sign-in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { appStore, type AppState } from "@/lib/storage/settings";
import { pullState, pushState } from "@/lib/storage/sync";

const STAMP_KEY = "strumlab:v1:updatedAt";

export type SyncStatus = "local" | "syncing" | "synced" | "error";

export function localStamp(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(STAMP_KEY) ?? 0);
}

export function touchLocal() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STAMP_KEY, String(Date.now()));
}

export function useAccount(state: AppState) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SyncStatus>("local");
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adopting = useRef(false);

  useEffect(() => {
    if (!configured) return;
    const supabase = supabaseBrowser();
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) =>
      setUser(data.session?.user ?? null),
    );
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  // First contact after signing in: newest copy wins, and local work is never
  // silently dropped — if local is newer it gets pushed instead of overwritten.
  useEffect(() => {
    if (!user) return;
    const supabase = supabaseBrowser();
    if (!supabase) return;
    let cancelled = false;

    (async () => {
      setStatus("syncing");
      const remote = await pullState(supabase, user.id);
      if (cancelled) return;
      if (remote && remote.updatedAt > localStamp()) {
        adopting.current = true;
        appStore.set(remote.state);
        touchLocal();
        adopting.current = false;
      } else {
        await pushState(supabase, user.id, appStore.get());
      }
      if (!cancelled) setStatus("synced");
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Debounced push. Editing a pattern fires a lot of small changes; there is
  // no reason for each one to be a round trip.
  useEffect(() => {
    if (!user || adopting.current) return;
    const supabase = supabaseBrowser();
    if (!supabase) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(async () => {
      setStatus("syncing");
      const ok = await pushState(supabase, user.id, state);
      setStatus(ok ? "synced" : "error");
    }, 1200);
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, [state, user]);

  const signIn = useCallback(async () => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }, []);

  const signOut = useCallback(async () => {
    const supabase = supabaseBrowser();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setStatus("local");
  }, []);

  return { configured, user, status, signIn, signOut };
}

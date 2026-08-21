/**
 * A tiny localStorage-backed external store.
 *
 * Loading persisted state in an effect and calling setState is the obvious
 * approach and the wrong one: it costs a second render pass and, worse, makes
 * the server-rendered HTML disagree with the first client render. React's
 * `useSyncExternalStore` exists for exactly this — it renders
 * `getServerSnapshot()` during SSR and hydration, then swaps to the real value.
 */

export interface ExternalStore<T> {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  get: () => T;
  set: (updater: T | ((prev: T) => T)) => void;
}

export function createLocalStore<T>(
  key: string,
  initial: T,
  revive: (raw: unknown) => T = (raw) => raw as T,
): ExternalStore<T> {
  let cache: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());

  const load = () => {
    try {
      const raw = localStorage.getItem(key);
      cache = raw ? revive(JSON.parse(raw)) : initial;
    } catch {
      cache = initial;
    }
    loaded = true;
  };

  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(cache));
    } catch {
      // Private browsing or a full quota. The app keeps working in memory.
    }
  };

  if (typeof window !== "undefined") {
    // Another tab editing the same key should be reflected here.
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      load();
      emit();
    });
  }

  const ensure = () => {
    if (!loaded && typeof window !== "undefined") load();
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      ensure();
      // Must be referentially stable between calls or React re-renders forever.
      return cache;
    },
    getServerSnapshot() {
      return initial;
    },
    get() {
      ensure();
      return cache;
    },
    set(updater) {
      ensure();
      cache = typeof updater === "function" ? (updater as (p: T) => T)(cache) : updater;
      persist();
      emit();
    },
  };
}

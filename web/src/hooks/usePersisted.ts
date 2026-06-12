import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

// useState that mirrors to localStorage so the value survives reloads.
export function usePersisted<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota / private mode */
    }
    // storage events only fire in OTHER tabs, so signal same-tab instances of this key too
    try {
      window.dispatchEvent(new CustomEvent(`persist:${key}`, { detail: value }));
    } catch {
      /* ignore */
    }
  }, [key, value]);

  // keep instances of the same key in sync: same tab (custom event) + other tabs (storage)
  useEffect(() => {
    const apply = (v: T) => setValue((cur) => (JSON.stringify(cur) === JSON.stringify(v) ? cur : v));
    const onCustom = (e: Event) => apply((e as CustomEvent).detail as T);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        apply(JSON.parse(e.newValue) as T);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener(`persist:${key}`, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(`persist:${key}`, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, [key]);

  return [value, setValue];
}

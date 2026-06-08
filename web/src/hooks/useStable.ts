import { useEffect, useState } from "react";

/**
 * Smooths a boolean flag: turns true immediately, but waits `falseDelayMs` before
 * reporting false. Used for the connection indicator so a brief reconnect doesn't
 * flash "RECONNECTING/OFFLINE" red for a fraction of a second.
 */
export function useStable(value: boolean, falseDelayMs = 2500): boolean {
  const [v, setV] = useState(value);
  useEffect(() => {
    if (value) {
      setV(true);
      return;
    }
    const id = setTimeout(() => setV(false), falseDelayMs);
    return () => clearTimeout(id);
  }, [value, falseDelayMs]);
  return v;
}

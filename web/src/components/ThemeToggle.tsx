import { useEffect } from "react";
import { Sun, Moon } from "lucide-react";
import { usePersisted } from "../hooks/usePersisted";

/**
 * Light/dark toggle for the cockpit. Dark is the default; the overlay forces
 * dark regardless. Adds/removes the `light` class on <html> and persists.
 */
export function ThemeToggle() {
  const [theme, setTheme] = usePersisted<"dark" | "light">("tape.theme", "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-elevated/80 text-fg-dim outline-none transition hover:bg-overlay hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
    >
      {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}

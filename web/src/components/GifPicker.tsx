import { useEffect, useRef, useState } from "react";
import { Film, Loader2 } from "lucide-react";
import { trendingGifs, searchGifs, type Gif } from "../lib/gifs";
import { SearchInput } from "./ui";

/**
 * GIF picker for the Desk tab — trending by default, live search, click to play.
 * Clicking a GIF broadcasts it (via the ws reaction relay) to the overlay, where
 * it plays semi-transparent over the stream. Powered by Tenor.
 */
export function GifPicker({ onGif }: { onGif?: (url: string) => void }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [hit, setHit] = useState<string | null>(null);
  const tmr = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLoading(true);
    if (tmr.current) clearTimeout(tmr.current);
    const run = async () => {
      const res = q.trim() ? await searchGifs(q.trim()) : await trendingGifs();
      setGifs(res);
      setLoading(false);
    };
    tmr.current = setTimeout(run, q.trim() ? 350 : 0);
    return () => {
      if (tmr.current) clearTimeout(tmr.current);
    };
  }, [q]);

  function fire(g: Gif) {
    onGif?.(g.full);
    setHit(g.id);
    setTimeout(() => setHit((h) => (h === g.id ? null : h)), 250);
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Film size={12} /> GIFs
      </h3>
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search GIFs…"
        aria-label="Search GIFs"
        className="mb-2"
      />
      <div className="grid max-h-72 grid-cols-2 gap-1.5 overflow-y-auto">
        {loading && gifs.length === 0 && (
          <div className="col-span-2 flex items-center justify-center py-6 text-fg-muted">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
        {!loading && gifs.length === 0 && (
          <p className="col-span-2 px-1 py-4 text-center font-mono text-[10px] text-fg-muted">no gifs found</p>
        )}
        {gifs.map((g) => (
          <button
            key={g.id}
            onClick={() => fire(g)}
            aria-label={`Play GIF: ${g.desc}`}
            className={`overflow-hidden rounded-md border bg-elevated/40 outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
              hit === g.id ? "scale-95 border-accent" : "border-line hover:border-accent/40"
            }`}
          >
            <img src={g.preview} alt="" loading="lazy" className="h-20 w-full object-cover" />
          </button>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-right font-mono text-[9px] text-fg-muted">click to play on the overlay · via Tenor</p>
    </section>
  );
}

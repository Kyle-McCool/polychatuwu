import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import type { NewsItem } from "../lib/types";
import { PlatformIcon } from "./ui";

function rel(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function hue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/**
 * Streamer side-panel newswire — the live, unthrottled feed of auto-monitored
 * crypto X accounts + breaking-news headlines. (The overlay shows a throttled
 * toast of the same items; this panel shows everything for the streamer.)
 */
export function Newswire({ news }: { news: NewsItem[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Newspaper size={12} /> Newswire
        <span className="ml-1 flex items-center gap-1 font-mono text-[9px] text-pos">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pos" /> auto
        </span>
      </h3>
      <div className="flex flex-col gap-1.5">
        {news.length === 0 && (
          <p className="px-1 font-mono text-[11px] text-fg-muted">monitoring crypto X + breaking news…</p>
        )}
        {news.slice(0, 40).map((n) => (
          <a
            key={n.id}
            href={n.url || undefined}
            target="_blank"
            rel="noreferrer"
            className="group block rounded-lg border border-white/5 bg-elevated/40 px-2.5 py-2 transition hover:border-accent/40 hover:bg-elevated/70"
          >
            <div className="mb-1 flex items-center gap-1.5">
              {n.kind === "tweet" ? (
                <>
                  <span
                    className="relative grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full text-[8px] font-bold text-white"
                    style={{ background: `hsl(${hue(n.name)}, 58%, 45%)` }}
                  >
                    {n.name.slice(0, 1).toUpperCase()}
                    {n.avatar && (
                      <img
                        src={n.avatar}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                        }}
                      />
                    )}
                  </span>
                  <span className="truncate text-[11px] font-semibold text-fg">{n.name}</span>
                  <span className="truncate font-mono text-[10px] text-fg-muted">@{n.handle}</span>
                  <PlatformIcon platform="x" size={9} className="shrink-0 opacity-60" />
                </>
              ) : (
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide"
                  style={{ background: `hsl(${hue(n.source)}, 55%, 20%)`, color: `hsl(${hue(n.source)}, 75%, 72%)` }}
                >
                  {n.source}
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-[9px] tabular-nums text-fg-muted">{rel(n.ts, now)}</span>
            </div>
            <p className="line-clamp-3 text-[12px] leading-snug text-fg-dim transition group-hover:text-fg">{n.text}</p>
          </a>
        ))}
      </div>
    </section>
  );
}

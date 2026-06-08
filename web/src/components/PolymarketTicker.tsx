import { useEffect, useState } from "react";
import { fetchOdds, PM_BLUE, PM_WORDMARK, type PMItem } from "../lib/polymarket";

const CAT_COLOR: Record<string, string> = {
  Crypto: "var(--color-accent)",
  Sports: "var(--color-pos)",
  Politics: PM_BLUE,
  Hot: "var(--color-neg)",
};

function Chip({ it }: { it: PMItem }) {
  return (
    <a
      href={it.url}
      target="_blank"
      rel="noreferrer"
      className="flex shrink-0 items-center gap-2 font-mono text-[12px] transition hover:opacity-80"
    >
      <span
        className="text-[9px] font-bold uppercase tracking-wider"
        style={{ color: CAT_COLOR[it.cat] || "var(--color-fg-muted)" }}
      >
        {it.cat}
      </span>
      {it.image && <img src={it.image} alt="" width={16} height={16} className="rounded-full" loading="lazy" />}
      <span className="max-w-[300px] truncate text-fg-dim">{it.label}</span>
      <span className={`font-semibold tabular-nums ${it.yesPct >= 50 ? "text-pos" : "text-neg"}`}>{it.yesPct}%</span>
    </a>
  );
}

export function PolymarketTicker() {
  const [items, setItems] = useState<PMItem[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchOdds()
        .then((x) => {
          if (alive && x.length) setItems(x);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 25000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (items.length === 0) return null;
  const doubled = [...items, ...items];

  return (
    <div
      className="flex items-center gap-3 border-t px-3 py-2"
      style={{ borderColor: `${PM_BLUE}55`, background: `linear-gradient(90deg, ${PM_BLUE}1f, ${PM_BLUE}0a 30%, transparent)` }}
    >
      <a
        href="https://polymarket.com"
        target="_blank"
        rel="noreferrer"
        className="flex shrink-0 items-center gap-2"
        title="Markets by Polymarket"
      >
        <img src={PM_WORDMARK} alt="Polymarket" height={16} style={{ height: 16, width: "auto" }} />
        <span className="hidden font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-fg-muted sm:inline">
          live odds
        </span>
      </a>
      <div className="h-5 w-px shrink-0" style={{ background: `${PM_BLUE}66` }} />
      <div className="relative flex-1 overflow-hidden">
        <div className="marquee-track flex w-max items-center gap-7">
          {doubled.map((it, i) => (
            <Chip key={i} it={it} />
          ))}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Radio, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { fetchOdds, PM_BLUE, type PMItem } from "../lib/polymarket";
import { EmptyState } from "./ui";

const MOVE_PTS = 4; // |24h change| ≥ this (points) = a "big move" breaking highlight
// Polymarket-specific widget → category tags all carry Polymarket blue (the label text
// still tells the categories apart). Red/green stays reserved for 24h move direction.
const CAT_COLOR: Record<string, string> = {
  Crypto: PM_BLUE,
  Sports: PM_BLUE,
  Politics: PM_BLUE,
  Hot: PM_BLUE,
};

/**
 * Polymarket wire — a live, rotating feed of popular bets that refreshes on its
 * own and surfaces big 24h market swings as "BIG MOVE" breaking highlights.
 * (Replaced the old crypto news/Farcaster wire — this is all Polymarket now.)
 */
export function PolymarketWire() {
  const [items, setItems] = useState<PMItem[]>([]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchOdds()
        .then((m) => {
          if (alive && m.length) setItems(m);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 45000); // rotate / refresh
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const movers = items
    .filter((i) => Math.abs(i.dayChange) >= MOVE_PTS)
    .sort((a, b) => Math.abs(b.dayChange) - Math.abs(a.dayChange))
    .slice(0, 3);
  const moverIds = new Set(movers.map((m) => m.id));
  const trending = items.filter((i) => !moverIds.has(i.id)).slice(0, 14);

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Radio size={12} /> Polymarket wire
      </h3>
      {items.length === 0 ? (
        <EmptyState size={52}>tapping Polymarket for popular bets &amp; big moves…</EmptyState>
      ) : (
        <div className="flex flex-col gap-1.5">
          {movers.map((m) => (
            <BreakingRow key={m.id} m={m} />
          ))}
          {trending.map((m) => (
            <BetRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function BreakingRow({ m }: { m: PMItem }) {
  const up = m.dayChange >= 0;
  const col = up ? "#2FD39E" : "#F0616D";
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noreferrer"
      className="flash-in block rounded-md border-l-2 bg-elevated/50 px-2 py-1.5 transition hover:bg-elevated"
      style={{ borderColor: col }}
    >
      <div className="mb-0.5 flex items-center gap-1.5">
        <span
          className="flex items-center gap-1 rounded px-1 font-mono text-[9px] font-bold uppercase tracking-wider"
          style={{ background: `${col}22`, color: col }}
        >
          <Zap size={9} /> Big move
        </span>
        <span className="ml-auto flex items-center gap-0.5 font-mono text-[11px] font-bold tabular-nums" style={{ color: col }}>
          {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {up ? "+" : ""}
          {m.dayChange}% · 24h
        </span>
      </div>
      <p className="line-clamp-2 text-[12px] font-medium leading-snug text-fg">{m.label}</p>
      <div className="mt-0.5 font-mono text-[10px] text-fg-muted">now {m.yesPct}% YES</div>
    </a>
  );
}

function BetRow({ m }: { m: PMItem }) {
  const col = CAT_COLOR[m.cat] || PM_BLUE;
  const dc = m.dayChange;
  return (
    <a href={m.url} target="_blank" rel="noreferrer" className="block rounded-md bg-elevated/40 px-2 py-1.5 transition hover:bg-elevated">
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 rounded px-1 font-mono text-[9px] font-bold uppercase tracking-wider" style={{ background: `${col}22`, color: col }}>
          {m.cat}
        </span>
        <span className="ml-auto font-mono text-[11px] font-bold tabular-nums" style={{ color: PM_BLUE }}>
          {m.yesPct}% YES
        </span>
        {Math.abs(dc) >= 1 && (
          <span className="flex items-center font-mono text-[10px] tabular-nums" style={{ color: dc >= 0 ? "#2FD39E" : "#F0616D" }}>
            {dc >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {Math.abs(dc)}
          </span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 font-mono text-[10px] leading-snug text-fg-dim">{m.label}</p>
    </a>
  );
}

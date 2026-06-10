import type { PriceItem } from "../lib/types";

function fmt(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

/** "MARKET WATCH" broadcast tape — top crypto, memecoins, and stocks. */
export function PriceTicker({ prices, className = "" }: { prices: PriceItem[]; className?: string }) {
  if (!prices.length) return null;
  const doubled = [...prices, ...prices]; // duplicated for a seamless marquee loop

  return (
    <div className={`relative flex items-center overflow-hidden border-y border-white/15 bg-surface/95 ${className}`}>
      <span
        className="z-10 flex shrink-0 items-center bg-white/[0.08] py-1.5 pl-3 pr-6 font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg"
        style={{ clipPath: "polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)" }}
      >
        Market Watch
      </span>
      <div className="overflow-hidden">
        <div className="marquee-track flex w-max items-center whitespace-nowrap py-1.5">
          {doubled.map((item, i) => {
            const up = item.change >= 0;
            return (
              <span key={item.symbol + i} className="mx-3.5 inline-flex items-center gap-1.5 font-mono text-[12px]">
                <span className="font-bold text-fg">{item.symbol}</span>
                <span className="tabular-nums text-fg-dim">${fmt(item.price)}</span>
                <span className={`tabular-nums ${up ? "text-pos" : "text-neg"}`}>
                  {up ? "▲" : "▼"}
                  {Math.abs(item.change).toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

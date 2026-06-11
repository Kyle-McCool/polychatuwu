// Coin price lookup for cashtag hover cards. Seeded instantly from the live price
// ticker (sock.prices); falls back to CoinGecko (keyless, CORS-open) for any other
// $TICKER, cached. Common symbols are pre-mapped so the search call is skipped.
export type Coin = { price: number; change: number };

const ID_MAP: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", HYPE: "hyperliquid", WIF: "dogwifcoin",
  PEPE: "pepe", BONK: "bonk", DOGE: "dogecoin", SHIB: "shiba-inu", XRP: "ripple",
  BNB: "binancecoin", LINK: "chainlink", ADA: "cardano", AVAX: "avalanche-2", DOT: "polkadot",
  TRX: "tron", TON: "the-open-network", SUI: "sui", APT: "aptos", ARB: "arbitrum",
  OP: "optimism", INJ: "injective-protocol", POPCAT: "popcat", FLOKI: "floki", MOG: "mog-coin",
  TRUMP: "official-trump", FARTCOIN: "fartcoin", PENGU: "pudgy-penguins",
};

const ticker = new Map<string, Coin>(); // from the live price feed — instant, no fetch
const cache = new Map<string, { v: Coin | null; ts: number }>();

export function setTickerPrices(items: { symbol: string; price: number; change: number }[]) {
  for (const i of items) ticker.set(i.symbol.toUpperCase(), { price: i.price, change: i.change });
}

// Throws on a network error or a non-ok response (rate limit) so the caller can treat it
// as transient; returns null only for a genuine "no such coin" (empty results).
async function searchId(sym: string): Promise<string | null> {
  const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(sym)}`);
  if (!r.ok) throw new Error(`search ${r.status}`);
  const j = await r.json();
  const coins = j.coins || [];
  const exact = coins.find((c: any) => (c.symbol || "").toUpperCase() === sym.toUpperCase());
  return (exact || coins[0])?.id || null;
}

export async function getCoin(sym: string): Promise<Coin | null> {
  const S = sym.toUpperCase();
  const t = ticker.get(S);
  if (t) return t;
  const c = cache.get(S);
  if (c && Date.now() - c.ts < 120000) return c.v;
  try {
    let v: Coin | null = null;
    const id = ID_MAP[S] || (await searchId(S));
    if (id) {
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
      if (!r.ok) throw new Error(`price ${r.status}`);
      const j = await r.json();
      const d = j[id];
      if (d && typeof d.usd === "number") v = { price: d.usd, change: d.usd_24h_change || 0 };
    }
    // only cache a completed lookup (found, or genuinely not found) — never a transient failure
    cache.set(S, { v, ts: Date.now() });
    return v;
  } catch {
    return null; // network / rate-limit blip: don't cache, let the next hover retry
  }
}

export function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

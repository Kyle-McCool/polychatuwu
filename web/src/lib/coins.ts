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

// Rich market data for the Coins terminal (keyless CoinGecko /coins/markets): price, 1h/24h/7d
// change, market cap, volume, a 7-day sparkline, and the coin icon. Cached + shared.
export type MarketCoin = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  image: string;
  ch1h: number;
  ch24h: number;
  ch7d: number;
  mcap: number;
  vol: number;
  spark: number[];
};

let marketsCache: { at: number; data: MarketCoin[] } | null = null;

export async function fetchMarkets(): Promise<MarketCoin[]> {
  if (marketsCache && Date.now() - marketsCache.at < 60000) return marketsCache.data;
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=1h%2C24h%2C7d",
    );
    if (!r.ok) throw new Error(`markets ${r.status}`);
    const j = await r.json();
    const data: MarketCoin[] = (Array.isArray(j) ? j : []).map((c: any) => ({
      id: c.id,
      symbol: (c.symbol || "").toUpperCase(),
      name: c.name || "",
      price: c.current_price ?? 0,
      image: c.image || "",
      ch1h: c.price_change_percentage_1h_in_currency ?? 0,
      ch24h: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h ?? 0,
      ch7d: c.price_change_percentage_7d_in_currency ?? 0,
      mcap: c.market_cap ?? 0,
      vol: c.total_volume ?? 0,
      spark: ((c.sparkline_in_7d && c.sparkline_in_7d.price) || []).filter((x: number) => Number.isFinite(x)),
    }));
    if (data.length) marketsCache = { at: Date.now(), data };
    return data;
  } catch {
    return marketsCache?.data ?? []; // keep last good data on a transient failure
  }
}

export function fmtPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

import type { PriceItem } from "../types";

/**
 * Live price ticker — top crypto + memecoins (CoinGecko, keyless) and stocks
 * (Yahoo v8 chart, keyless). Polled server-side so there are no browser CORS
 * issues, then relayed to all clients. Verified keyless June 2026.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// CoinGecko id, ticker, kind — order = display order
const COINS: [string, string, "crypto" | "meme"][] = [
  ["bitcoin", "BTC", "crypto"],
  ["ethereum", "ETH", "crypto"],
  ["solana", "SOL", "crypto"],
  ["hyperliquid", "HYPE", "crypto"],
  ["ripple", "XRP", "crypto"],
  ["binancecoin", "BNB", "crypto"],
  ["chainlink", "LINK", "crypto"],
  ["dogecoin", "DOGE", "meme"],
  ["dogwifcoin", "WIF", "meme"],
  ["pepe", "PEPE", "meme"],
  ["bonk", "BONK", "meme"],
  ["popcat", "POPCAT", "meme"],
];
const STOCKS = ["TSLA", "NVDA", "COIN", "MSTR", "AAPL", "SPY"];

const POLL_MS = 30_000;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchCrypto(): Promise<PriceItem[]> {
  const ids = COINS.map((c) => c[0]).join(",");
  const data = await fetchJson(
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`,
  );
  if (!Array.isArray(data)) return [];
  const byId = new Map<string, any>(data.map((d: any) => [d.id, d]));
  const out: PriceItem[] = [];
  for (const [id, symbol, kind] of COINS) {
    const d = byId.get(id);
    if (!d || typeof d.current_price !== "number") continue;
    out.push({ symbol, price: d.current_price, change: Number(d.price_change_percentage_24h) || 0, kind });
  }
  return out;
}

async function fetchStocks(): Promise<PriceItem[]> {
  const settled = await Promise.allSettled(
    STOCKS.map((sym) => fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}`)),
  );
  const out: PriceItem[] = [];
  settled.forEach((s, i) => {
    if (s.status !== "fulfilled" || !s.value) return;
    const m = s.value?.chart?.result?.[0]?.meta;
    const price = m?.regularMarketPrice;
    const prev = m?.chartPreviousClose ?? m?.previousClose;
    if (typeof price !== "number" || !prev) return;
    out.push({ symbol: STOCKS[i], price, change: ((price - prev) / prev) * 100, kind: "stock" });
  });
  return out;
}

export class Prices {
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  constructor(private onUpdate: (items: PriceItem[]) => void) {}

  start() {
    if (this.started) return;
    this.started = true;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), POLL_MS);
  }
  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  private async tick() {
    const [crypto, stocks] = await Promise.all([fetchCrypto(), fetchStocks()]);
    const items = [...crypto, ...stocks];
    if (items.length) this.onUpdate(items);
  }
}

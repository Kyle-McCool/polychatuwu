// Free Polymarket Gamma API — public, no auth, CORS-open (fetch direct from browser).
import { deDash } from "./text";

export const PM_BLUE = "#2E5CFF";
export const PM_WORDMARK = "https://polymarket.com/images/brand/logo-blue.png";
export const PM_ICON = "https://polymarket.com/images/brand/icon-white.png";

export type PMItem = {
  id: string; // event slug — stable, used to re-look-up odds later
  label: string;
  yesPct: number;
  image: string;
  url: string;
  vol: number;
  cat: string;
  binary: boolean; // true = single Yes/No market (ideal for chat YES/NO comparison)
  dayChange: number; // 24h YES-price change in points (signed) — for "big move" alerts
};

// Polymarket grouped-event titles carry a blank ("Bitcoin above ___ on June 7?")
// meant to be filled with the chosen strike. Fill it; if there is no blank, append.
function fillBlank(title: string, strike: string): string {
  if (!strike) return title;
  if (/_{2,}|…|\.\.\./.test(title)) return title.replace(/_{2,}|…|\.\.\./, strike);
  return `${title} · ${strike}`;
}

function eventToItem(ev: any, cat: string): PMItem | null {
  const markets = (ev?.markets || []).filter((m: any) => m.active && !m.closed && m.outcomePrices);
  if (!markets.length) return null;
  try {
    let label = ev.title;
    let yesPct: number;
    let dayChange = 0;
    const binary = markets.length === 1;
    if (binary) {
      const outcomes = JSON.parse(markets[0].outcomes);
      const prices = JSON.parse(markets[0].outcomePrices);
      const yi = Math.max(0, outcomes.indexOf("Yes"));
      yesPct = Math.round(parseFloat(prices[yi]) * 100);
      dayChange = Math.round((parseFloat(markets[0].oneDayPriceChange) || 0) * 100);
    } else {
      // grouped event = one question, many strike markets. Pick the MOST CONTESTED
      // strike (closest to 50%) so the overlay shows a live, undecided bet instead of
      // a ~100% lock, and fill the title's blank with that strike.
      let bestDist = Infinity;
      let chosen: { y: number; label: string; dc: number } | null = null;
      for (const m of markets) {
        const outcomes = JSON.parse(m.outcomes);
        const prices = JSON.parse(m.outcomePrices);
        const yi = Math.max(0, outcomes.indexOf("Yes"));
        const y = Math.round(parseFloat(prices[yi]) * 100);
        if (!Number.isFinite(y)) continue;
        const dist = Math.abs(y - 50);
        if (dist < bestDist) {
          bestDist = dist;
          chosen = { y, label: m.groupItemTitle || "", dc: parseFloat(m.oneDayPriceChange) || 0 };
        }
      }
      if (!chosen) return null;
      yesPct = chosen.y;
      dayChange = Math.round(chosen.dc * 100);
      label = fillBlank(ev.title, chosen.label);
    }
    if (!Number.isFinite(yesPct)) return null;
    return {
      id: ev.slug,
      label: deDash(label),
      yesPct,
      image: ev.icon || ev.image || markets[0].icon || "",
      url: `https://polymarket.com/event/${ev.slug}`,
      vol: ev.volume24hr || 0,
      cat,
      binary,
      dayChange,
    };
  } catch {
    return null;
  }
}

const VARIETY: { slug: string; cat: string; n: number }[] = [
  { slug: "crypto", cat: "Crypto", n: 6 },
  { slug: "sports", cat: "Sports", n: 6 },
  { slug: "politics", cat: "Politics", n: 6 },
  { slug: "", cat: "Hot", n: 8 },
];

/** Variety mix across categories for the scrolling ticker. */
export async function fetchOdds(): Promise<PMItem[]> {
  const lists = await Promise.all(
    VARIETY.map((s) => {
      const tag = s.slug ? `&tag_slug=${s.slug}` : "";
      const url = `https://gamma-api.polymarket.com/events?active=true&closed=false${tag}&order=volume24hr&ascending=false&limit=${s.n}`;
      return fetch(url)
        .then((r) => r.json())
        .catch(() => []);
    }),
  );
  const seen = new Set<string>();
  const buckets: PMItem[][] = lists.map((events, i) => {
    const arr: PMItem[] = [];
    for (const ev of events || []) {
      if (!ev?.slug || seen.has(ev.slug)) continue;
      const it = eventToItem(ev, VARIETY[i].cat);
      if (it) {
        seen.add(ev.slug);
        arr.push(it);
      }
    }
    return arr;
  });
  const out: PMItem[] = [];
  const max = Math.max(0, ...buckets.map((b) => b.length));
  for (let i = 0; i < max; i += 1) for (const b of buckets) if (b[i]) out.push(b[i]);
  return out.slice(0, 30);
}

/** Top crypto markets, binary (Yes/No) ones first — for CROWD vs MARKET. */
export async function fetchCryptoMarkets(limit = 16): Promise<PMItem[]> {
  const url = `https://gamma-api.polymarket.com/events?active=true&closed=false&tag_slug=crypto&order=volume24hr&ascending=false&limit=${limit}`;
  const events = await fetch(url)
    .then((r) => r.json())
    .catch(() => []);
  const out: PMItem[] = [];
  const seen = new Set<string>();
  for (const ev of events || []) {
    if (!ev?.slug || seen.has(ev.slug)) continue;
    const it = eventToItem(ev, "Crypto");
    if (it) {
      seen.add(ev.slug);
      out.push(it);
    }
  }
  // live, contested markets first (so the overlay shows a real bet, not a 0/100 lock),
  // then clean binary YES/NO, then by 24h volume.
  const live = (it: PMItem) => (it.yesPct >= 5 && it.yesPct <= 95 ? 1 : 0);
  return out.sort((a, b) => live(b) - live(a) || Number(b.binary) - Number(a.binary) || b.vol - a.vol);
}

/** Free-text search across Polymarket (for the streamer to pick an overlay bet). */
export async function searchMarkets(q: string, limit = 10): Promise<PMItem[]> {
  const url = `https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=${limit}&events_status=active`;
  const res = await fetch(url)
    .then((r) => r.json())
    .catch(() => null);
  const events = res?.events || [];
  const out: PMItem[] = [];
  const seen = new Set<string>();
  for (const ev of events) {
    if (!ev?.slug || seen.has(ev.slug)) continue;
    const it = eventToItem(ev, ev.tags?.[0]?.label || "Market");
    if (it) {
      seen.add(ev.slug);
      out.push(it);
    }
  }
  // clean binary YES/NO markets first, then by 24h volume
  return out.sort((a, b) => Number(b.binary) - Number(a.binary) || b.vol - a.vol);
}

/** Full current snapshot of one market by slug (for the pinned overlay bet). */
export async function fetchMarketBySlug(slug: string): Promise<PMItem | null> {
  const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug)}`;
  const events = await fetch(url)
    .then((r) => r.json())
    .catch(() => null);
  const ev = Array.isArray(events) ? events[0] : null;
  return ev ? eventToItem(ev, "Market") : null;
}

/** Re-fetch one market's current YES% by id (to check if it moved toward chat). */
export async function fetchMarketYes(id: string): Promise<number | null> {
  const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(id)}`;
  const events = await fetch(url)
    .then((r) => r.json())
    .catch(() => null);
  const ev = Array.isArray(events) ? events[0] : null;
  if (!ev) return null;
  const it = eventToItem(ev, "Crypto");
  return it ? it.yesPct : null;
}

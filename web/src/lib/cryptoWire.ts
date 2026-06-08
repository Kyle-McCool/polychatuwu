// Crypto Wire — a live "what crypto + prediction markets are doing right now" feed.
// All three sources are FREE, keyless, and CORS-open, so they fetch straight from
// the browser (verified June 2026): Polymarket data-api, Farcaster (Pinata hub),
// CoinTelegraph RSS. No login, no scraping, no server proxy needed.

export type WireSource = "poly" | "farcaster" | "news";
export type WireItem = {
  id: string;
  source: WireSource;
  text: string;
  meta: string;
  url?: string;
  ts: number; // unix ms
};

// ── Polymarket live trades — the on-thesis "market chatter" ──────────────────
async function fetchPolyTrades(): Promise<WireItem[]> {
  try {
    const r = await fetch("https://data-api.polymarket.com/trades?limit=25");
    const arr = await r.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t: any): WireItem | null => {
        if (!t?.title) return null;
        const size = Math.round(Number(t.size) || 0);
        const who = t.pseudonym || "trader";
        return {
          id: `poly_${t.transactionHash || `${t.timestamp}_${t.asset}`}`,
          source: "poly",
          text: t.title,
          meta: `${t.side === "BUY" ? "▲ BUY" : "▼ SELL"} ${t.outcome ?? ""} · $${size.toLocaleString()} · ${who}`,
          url: t.eventSlug ? `https://polymarket.com/event/${t.eventSlug}` : undefined,
          ts: (Number(t.timestamp) || 0) * 1000,
        };
      })
      .filter(Boolean) as WireItem[];
  } catch {
    return [];
  }
}

// ── Farcaster — crypto-native social voices ─────────────────────────────────
const FC_EPOCH = 1609459200; // Farcaster timestamps are seconds since 2021-01-01
// High-signal crypto Farcaster accounts (display names self-correct from the hub,
// so even if a FID maps to someone unexpected the label is still accurate).
const FC_FIDS = [3, 5650, 2, 99, 576, 1317];
const fcName = new Map<number, string>();

async function resolveFcName(fid: number): Promise<string> {
  if (fcName.has(fid)) return fcName.get(fid)!;
  try {
    const r = await fetch(`https://hub.pinata.cloud/v1/userDataByFid?fid=${fid}&user_data_type=6`);
    const j = await r.json();
    const v = j?.messages?.[0]?.data?.userDataBody?.value || `fid:${fid}`;
    fcName.set(fid, v);
    return v;
  } catch {
    return `fid:${fid}`;
  }
}

async function fetchFarcaster(): Promise<WireItem[]> {
  const out: WireItem[] = [];
  await Promise.all(
    FC_FIDS.map(async (fid) => {
      try {
        const r = await fetch(`https://hub.pinata.cloud/v1/castsByFid?fid=${fid}&pageSize=3&reverse=true`);
        const j = await r.json();
        const name = await resolveFcName(fid);
        for (const m of j?.messages || []) {
          const b = m?.data?.castAddBody;
          const text = (b?.text || "").trim();
          if (!text || b?.parentCastId) continue; // top-level casts only
          out.push({
            id: `fc_${m.hash}`,
            source: "farcaster",
            text,
            meta: `@${name}`,
            ts: ((Number(m?.data?.timestamp) || 0) + FC_EPOCH) * 1000,
          });
        }
      } catch {
        /* skip this fid */
      }
    }),
  );
  return out;
}

// ── CoinTelegraph headlines (RSS, parsed in-browser) ────────────────────────
async function fetchNews(): Promise<WireItem[]> {
  try {
    const r = await fetch("https://cointelegraph.com/rss");
    const xml = await r.text();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    return [...doc.querySelectorAll("item")]
      .slice(0, 15)
      .map((it): WireItem | null => {
        const text = it.querySelector("title")?.textContent?.trim() || "";
        if (!text) return null;
        const url = it.querySelector("link")?.textContent?.trim() || undefined;
        const pub = it.querySelector("pubDate")?.textContent || "";
        const parsed = pub ? Date.parse(pub) : NaN;
        return {
          id: `news_${url || text}`,
          source: "news",
          text,
          meta: "CoinTelegraph",
          url,
          ts: Number.isFinite(parsed) ? parsed : Date.now(),
        };
      })
      .filter(Boolean) as WireItem[];
  } catch {
    return [];
  }
}

/** Merge all sources, newest first, deduped. */
export async function fetchWire(): Promise<WireItem[]> {
  const [poly, fc, news] = await Promise.all([fetchPolyTrades(), fetchFarcaster(), fetchNews()]);
  const seen = new Set<string>();
  return [...poly, ...fc, ...news]
    .filter((x) => (seen.has(x.id) ? false : seen.add(x.id)))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 80);
}

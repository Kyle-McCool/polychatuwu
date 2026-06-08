import type { NewsItem } from "../types";
import { deDash } from "../text";

/**
 * Auto crypto newswire — NO api keys, NO login, NO user input.
 *  • top crypto/news X accounts via the keyless Twitter *syndication* endpoint
 *    (https://syndication.twitter.com/srv/timeline-profile/screen-name/<h>) which
 *    returns recent tweets in a __NEXT_DATA__ JSON blob, server-side, keyless.
 *  • breaking-news publisher RSS feeds (also keyless).
 * Verified working June 2026. Both are undocumented/public — wrapped in try/catch
 * so a dead source never takes the server down; the other sources keep flowing.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Curated top accounts — the show (@MarketBubble) + both judges (Ansem @blknoiz06,
// FaZe Banks @Banks) + the sponsor (@Polymarket) + news desks + the CT bench.
// Rotated in batches per poll (see tick) so the keyless syndication endpoint never
// gets hammered with all of them at once.
const TWEET_ACCOUNTS = [
  "MarketBubble",
  "blknoiz06", // Ansem (judge)
  "Banks", // FaZe Banks (judge)
  "Polymarket", // sponsor
  "WatcherGuru",
  "DocumentingBTC",
  "tier10k",
  "Cointelegraph",
  "CoinDesk",
  "TheBlock__",
  "whale_alert",
  "lookonchain",
  "unusual_whales",
  "DeItaone", // markets breaking (Walter Bloomberg)
  "cobie",
  "HsakaTrades",
  "GiganticRebirth",
  "inversebrah",
  "0xMert_",
  "Pentosh1",
  "CryptoHayes", // Arthur Hayes
  "saylor", // Michael Saylor
  "VitalikButerin",
  "cz_binance",
  "APompliano",
  "RaoulGMI",
  "AltcoinGordon",
  "milesdeutscher",
  "notthreadguy",
  "Rewkang",
  "WuBlockchain",
];

const RSS_FEEDS: { source: string; url: string }[] = [
  { source: "Decrypt", url: "https://decrypt.co/feed" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { source: "Bitcoin Magazine", url: "https://bitcoinmagazine.com/feed" },
  { source: "The Block", url: "https://www.theblock.co/rss.xml" },
  { source: "Blockworks", url: "https://blockworks.co/feed/" },
  { source: "CryptoSlate", url: "https://cryptoslate.com/feed/" },
  { source: "BeInCrypto", url: "https://beincrypto.com/feed/" },
  { source: "CryptoPotato", url: "https://cryptopotato.com/feed/" },
];

const POLL_MS = 60_000;
const TWEET_BATCH = 12; // accounts fetched per poll, rotating through the full list

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => safeChar(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeChar(parseInt(n, 16)));
}
function safeChar(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function cleanTweet(s: string): string {
  const t = decodeEntities(s)
    .replace(/https?:\/\/t\.co\/\S+/g, "") // strip t.co media/quote shorteners
    .replace(/\s+/g, " ")
    .trim();
  return deDash(t);
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

function tsOf(v: string | undefined): number {
  if (!v) return Date.now();
  const n = Date.parse(v);
  return Number.isNaN(n) ? Date.now() : n;
}

async function fetchTweets(handle: string): Promise<NewsItem[]> {
  const html = await fetchText(`https://syndication.twitter.com/srv/timeline-profile/screen-name/${handle}`);
  if (!html) return [];
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data: any;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const entries: any[] = data?.props?.pageProps?.timeline?.entries ?? [];
  const out: NewsItem[] = [];
  for (const e of entries) {
    const t = e?.content?.tweet;
    if (!t?.id_str) continue;
    if (t.in_reply_to_status_id_str) continue; // skip replies (noise)
    const rt = t.retweeted_status;
    let text = t.full_text || "";
    if (rt?.full_text) text = `RT @${rt.user?.screen_name || "?"}: ${rt.full_text}`;
    text = cleanTweet(text);
    if (!text) continue;
    const avRaw: string = t.user?.profile_image_url_https || t.user?.profile_image_url || "";
    out.push({
      id: `tw_${t.id_str}`,
      kind: "tweet",
      handle: t.user?.screen_name || handle,
      name: t.user?.name || handle,
      text: text.length > 600 ? text.slice(0, 597) + "…" : text,
      url: `https://x.com${t.permalink || `/${handle}/status/${t.id_str}`}`,
      source: "X",
      ts: tsOf(t.created_at),
      avatar: avRaw ? avRaw.replace("_normal", "_bigger") : undefined, // _bigger = crisper 73px
    });
  }
  return out;
}

function rssTag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  if (!m) return "";
  const inner = m[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return decodeEntities((inner ? inner[1] : m[1]).replace(/<[^>]+>/g, "")).trim();
}

async function fetchRss(feed: { source: string; url: string }): Promise<NewsItem[]> {
  const xml = await fetchText(feed.url);
  if (!xml) return [];
  const out: NewsItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const b of blocks.slice(0, 12)) {
    const title = deDash(rssTag(b, "title"));
    if (!title) continue;
    let link = rssTag(b, "link");
    if (!link) {
      const href = b.match(/<link[^>]*href="([^"]+)"/i);
      if (href) link = href[1];
    }
    const pub = rssTag(b, "pubDate") || rssTag(b, "dc:date") || rssTag(b, "published");
    out.push({
      id: `nw_${link || title}`,
      kind: "news",
      name: feed.source,
      text: title.length > 600 ? title.slice(0, 597) + "…" : title,
      url: link || "",
      source: feed.source,
      ts: tsOf(pub),
    });
  }
  return out;
}

export class Newswire {
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private tweetCursor = 0; // rotates the account batch each poll

  constructor(private opts: { onSeed: (items: NewsItem[]) => void; onItem: (item: NewsItem) => void }) {}

  start() {
    if (this.started) return;
    this.started = true;
    void this.tick(true);
    this.timer = setInterval(() => void this.tick(false), POLL_MS);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(initial: boolean) {
    // Rotate through the account list a batch at a time so the keyless syndication
    // endpoint is never hit with all ~30 at once (that itself causes throttling/staleness).
    // RSS feeds run every tick — they are the fresh, reliable source.
    const handles: string[] = [];
    for (let i = 0; i < Math.min(TWEET_BATCH, TWEET_ACCOUNTS.length); i += 1) {
      handles.push(TWEET_ACCOUNTS[(this.tweetCursor + i) % TWEET_ACCOUNTS.length]);
    }
    this.tweetCursor = (this.tweetCursor + TWEET_BATCH) % TWEET_ACCOUNTS.length;
    const settled = await Promise.allSettled([
      ...handles.map((h) => fetchTweets(h)),
      ...RSS_FEEDS.map((f) => fetchRss(f)),
    ]);
    const items: NewsItem[] = [];
    for (const s of settled) if (s.status === "fulfilled") items.push(...s.value);
    // de-dup within this batch + sort newest-first
    const byId = new Map<string, NewsItem>();
    for (const i of items) if (!byId.has(i.id)) byId.set(i.id, i);
    const sorted = [...byId.values()].sort((a, b) => b.ts - a.ts);
    const fresh = sorted.filter((i) => !this.seen.has(i.id));
    for (const i of sorted) this.seen.add(i.id);
    if (this.seen.size > 5000) this.seen = new Set([...this.seen].slice(-2500));

    if (initial) {
      // populate the side-panel feed with recent items, but DON'T toast them
      this.opts.onSeed(fresh.slice(0, 25));
    } else {
      // genuinely-new items: emit oldest→newest so feed/queue order is natural
      for (const i of fresh.slice(0, 12).reverse()) this.opts.onItem(i);
    }
  }
}

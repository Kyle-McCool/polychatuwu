import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { TwitchSource } from "./sources/twitch";
import { KickSource } from "./sources/kick";
import { XSource } from "./sources/x";
import { XBroadcastSource } from "./sources/xBroadcast";
import { broadcastIdFromUrl } from "./sources/xApi";
import { handleHls } from "./hlsProxy";
import { Newswire } from "./sources/newswire";
import { Prices } from "./sources/prices";
import { deDash } from "./text";
import type { ChannelConfig, ChatMessage, NewsItem, NowPlaying, OverlayConfig, PriceItem, ServerEvent, SourceStatus } from "./types";
import { DEFAULT_OVERLAY_CONFIG } from "./types";

const PORT = Number(process.env.PORT) || 8787;

// Keep the relay alive on air — one rejected upstream promise (Playwright, fetch)
// must never take the whole process down mid-broadcast.
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// Host auth: control messages (channels / overlay / music / reactions) and the host
// chat badge require this token WHEN it is set. Unset (local dev) = fully open so a
// fresh clone just works. On deploy, set HOST_TOKEN and open the dashboard at /app?key=<token>;
// viewers on /watch never have it, so they can chat but cannot hijack the broadcast.
const HOST_TOKEN = process.env.HOST_TOKEN || "";
const authed = (msg: any) => !HOST_TOKEN || msg?.token === HOST_TOKEN;

const MAX_CHANNELS = 8; // hard cap so a client can't spawn unbounded headless browsers
function validChannel(platform: string, raw: string): boolean {
  const ch = (raw || "").trim();
  if (!ch || ch.length > 300) return false;
  if (platform === "x") return /(?:x\.com|twitter\.com)\//i.test(ch) || /^@?[A-Za-z0-9_]{1,30}$/.test(ch);
  return /^#?[A-Za-z0-9_]{1,40}$/.test(ch); // twitch / kick handle
}

let channels: ChannelConfig[] = [];

const history: ChatMessage[] = [];
const HISTORY_MAX = 600;
const clients = new Set<WebSocket>();
const statuses = new Map<string, SourceStatus>();
let twitch: TwitchSource | undefined;
let twitchKey = "";
const kicks = new Map<string, KickSource>();
const xs = new Map<string, XSource>(); // X profiles/posts (Playwright scrape)
const xbroadcasts = new Map<string, XBroadcastSource>(); // X live broadcasts (keyless API + chatman WS)
let reactionSeq = 0;
let chatSeq = 0;
let overlayConfig: OverlayConfig = DEFAULT_OVERLAY_CONFIG;
let nowPlaying: NowPlaying | null = null;
let watch: ChannelConfig | null = null; // which stream is shown on the overlay (host-selected, shared)

// ── auto crypto newswire (curated X accounts + news RSS) ───────────────────────
const news: NewsItem[] = []; // newest-first, for the streamer side panel (replayed in hello)
const NEWS_MAX = 40;
const toastQueue: NewsItem[] = []; // overlay toasts, throttled by a cooldown
let lastToastAt = 0;
const NEWS_TOAST_COOLDOWN_MS = 6 * 60 * 1000; // ≤1 toast / 6 min so chat is never crammed
const NEWS_TOAST_MAX_AGE_MS = 30 * 60 * 1000; // never toast a headline older than 30 min

function pushNews(item: NewsItem) {
  if (news.some((n) => n.id === item.id)) return;
  news.unshift(item);
  if (news.length > NEWS_MAX) news.length = NEWS_MAX;
}

// ── live price ticker (top crypto + memecoins + stocks) ───────────────────────
let prices: PriceItem[] = [];
const priceFeed = new Prices((items) => {
  prices = items;
  broadcast({ type: "prices", data: prices });
});

const newswire = new Newswire({
  onSeed: (items) => {
    for (const i of items.slice().reverse()) pushNews(i); // oldest→newest so newest ends up first
    if (items[0]) toastQueue.push(items[0]); // toast the freshest item shortly after startup
  },
  onItem: (item) => {
    pushNews(item);
    broadcast({ type: "newsItem", data: item }); // streamer side-panel: live, unthrottled
    toastQueue.push(item); // overlay toast: throttled below
    if (toastQueue.length > 20) toastQueue.shift();
  },
});

// toast scheduler — releases at most one overlay toast per cooldown, newest first
setInterval(() => {
  if (!toastQueue.length) return;
  if (Date.now() - lastToastAt < NEWS_TOAST_COOLDOWN_MS) return;
  toastQueue.sort((a, b) => b.ts - a.ts);
  let next: NewsItem | undefined;
  while ((next = toastQueue.shift())) {
    if (Date.now() - next.ts <= NEWS_TOAST_MAX_AGE_MS) break; // skip stale
    next = undefined;
  }
  if (!next) return;
  lastToastAt = Date.now();
  broadcast({ type: "newsToast", data: next });
}, 15_000);

function broadcast(ev: ServerEvent) {
  const data = JSON.stringify(ev);
  for (const c of clients) if (c.readyState === WebSocket.OPEN) c.send(data);
}

function extractCashtags(text: string): string[] {
  const out = new Set<string>();
  const re = /\$([A-Za-z]{2,6})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[1].toUpperCase());
  return [...out];
}

function onMessage(m: ChatMessage) {
  m.text = deDash(m.text); // strip em/en dashes + word hyphens everywhere chat is shown
  m.cashtags = extractCashtags(m.text);
  history.push(m);
  if (history.length > HISTORY_MAX) history.shift();
  broadcast({ type: "message", data: m });
}

function onStatus(s: SourceStatus) {
  statuses.set(`${s.platform}:${s.channel}`, s);
  broadcast({ type: "status", data: [...statuses.values()] });
}

// Incremental — only add/remove sources that actually changed, so tweaking one
// channel never tears down the others (especially a slow-launching X scraper).
function rebuildSources() {
  // Twitch — one multi-channel reader; rebuild only when its set changes
  const twList = channels
    .filter((c) => c.platform === "twitch")
    .map((c) => c.channel.toLowerCase().replace(/^#/, ""))
    .sort();
  const twKey = twList.join(",");
  if (twKey !== twitchKey) {
    twitch?.close();
    for (const k of [...statuses.keys()]) if (k.startsWith("twitch:")) statuses.delete(k);
    twitch = twList.length ? new TwitchSource(twList, onMessage, onStatus) : undefined;
    twitchKey = twKey;
  }

  // Kick — one source per channel; add new, drop removed, keep the rest
  const kickWant = new Set(channels.filter((c) => c.platform === "kick").map((c) => c.channel));
  for (const [ch, src] of kicks) {
    if (!kickWant.has(ch)) {
      src.close();
      kicks.delete(ch);
      statuses.delete(`kick:${ch}`);
    }
  }
  for (const ch of kickWant) if (!kicks.has(ch)) kicks.set(ch, new KickSource(ch, onMessage, onStatus));

  // X live broadcasts — keyless guest-token API (video via HLS proxy + chatman chat)
  const xbWant = new Set(channels.filter((c) => c.platform === "x" && broadcastIdFromUrl(c.channel)).map((c) => c.channel));
  for (const [url, src] of xbroadcasts) {
    if (!xbWant.has(url)) {
      src.close();
      xbroadcasts.delete(url);
      statuses.delete(`x:${XBroadcastSource.label(url)}`);
    }
  }
  for (const url of xbWant) if (!xbroadcasts.has(url)) xbroadcasts.set(url, new XBroadcastSource(url, onMessage, onStatus));

  // X profiles / posts — one Playwright scraper per URL (broadcasts handled above)
  const xWant = new Set(channels.filter((c) => c.platform === "x" && !broadcastIdFromUrl(c.channel)).map((c) => c.channel));
  for (const [url, src] of xs) {
    if (!xWant.has(url)) {
      src.close();
      xs.delete(url);
      statuses.delete(`x:${XSource.shortLabel(url)}`);
    }
  }
  for (const url of xWant) if (!xs.has(url)) xs.set(url, new XSource(url, onMessage, onStatus));

  broadcast({ type: "status", data: [...statuses.values()] });
}

// Keep `watch` (the stream shown on the overlay + viewer) pointing at a real
// embeddable channel; defaults to the first Twitch/Kick channel. Returns true if changed.
function ensureWatch(): boolean {
  const embeddable = channels.filter(
    (c) => c.platform === "twitch" || c.platform === "kick" || (c.platform === "x" && !!broadcastIdFromUrl(c.channel)),
  );
  if (watch && embeddable.some((c) => c.platform === watch!.platform && c.channel === watch!.channel)) return false;
  watch = embeddable[0] || null;
  return true;
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  if (req.url?.startsWith("/x-hls/")) {
    void handleHls(req, res); // keyless HLS proxy for X broadcasts (adds the CORS the CDN omits)
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });
wss.on("connection", (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: "hello", data: { channels, overlayConfig, nowPlaying, news, prices, watch } } satisfies ServerEvent));
  ws.send(JSON.stringify({ type: "status", data: [...statuses.values()] } satisfies ServerEvent));
  if (history.length) ws.send(JSON.stringify({ type: "history", data: history } satisfies ServerEvent));

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    // Control + reaction messages are host-only and rate-limited per connection;
    // chat (below) stays open so any viewer can post with no login.
    if (msg?.type === "setChannels" || msg?.type === "overlayConfig" || msg?.type === "nowPlaying" || msg?.type === "reaction" || msg?.type === "setWatch") {
      if (!authed(msg)) return;
      const now = Date.now();
      if (now - ((ws as any)._lastCtl || 0) < 150) return;
      (ws as any)._lastCtl = now;
    }

    if (msg?.type === "setChannels" && Array.isArray(msg.data)) {
      channels = msg.data
        .filter(
          (c: any) =>
            ["twitch", "kick", "x"].includes(c?.platform) &&
            typeof c?.channel === "string" &&
            validChannel(c.platform, c.channel),
        )
        .slice(0, MAX_CHANNELS)
        .map((c: any) => ({ platform: c.platform, channel: c.channel.trim().slice(0, 300) }));
      rebuildSources();
      ensureWatch();
      broadcast({ type: "hello", data: { channels, overlayConfig, nowPlaying, news, prices, watch } });
      broadcast({ type: "watch", data: watch });
    } else if (msg?.type === "overlayConfig" && msg.data && typeof msg.data === "object") {
      // streamer changed overlay settings → sanitize, store, fan out to the overlay
      const feats = (msg.data.features && typeof msg.data.features === "object" ? msg.data.features : {}) as Record<string, unknown>;
      const features = {} as OverlayConfig["features"];
      for (const k of Object.keys(DEFAULT_OVERLAY_CONFIG.features) as (keyof OverlayConfig["features"])[]) {
        features[k] = typeof feats[k] === "boolean" ? (feats[k] as boolean) : DEFAULT_OVERLAY_CONFIG.features[k];
      }
      const m = msg.data.market;
      overlayConfig = {
        features,
        market: m && typeof m.slug === "string" ? { slug: String(m.slug).slice(0, 160), label: String(m.label || "").slice(0, 240) } : null,
      };
      broadcast({ type: "overlayConfig", data: overlayConfig });
    } else if (msg?.type === "reaction" && (typeof msg.data?.sound === "string" || typeof msg.data?.gif === "string")) {
      // streamer fired a soundboard pad or a GIF → fan out a visual reaction to
      // every connected client (overlay + cockpit) so the broadcast shows it live
      const out: { sound?: string; gif?: string; id: string; ts: number } = {
        id: `r${++reactionSeq}`,
        ts: Date.now(),
      };
      if (typeof msg.data.sound === "string") out.sound = msg.data.sound.slice(0, 24);
      if (typeof msg.data.gif === "string") {
        const g = msg.data.gif.slice(0, 400);
        // only relay GIF urls from trusted hosts (no arbitrary URL broadcast)
        if (/^https:\/\/([a-z0-9-]+\.)*(tenor\.com|giphy\.com|googleusercontent\.com)\//i.test(g)) out.gif = g;
      }
      if (out.sound || out.gif) broadcast({ type: "reaction", data: out });
    } else if (msg?.type === "nowPlaying") {
      // streamer's music player → relay {title, playing} to the overlay waveform widget
      const d = msg.data;
      nowPlaying =
        d && typeof d === "object" && typeof d.title === "string"
          ? {
              title: d.title.slice(0, 200),
              author: typeof d.author === "string" ? d.author.slice(0, 120) : undefined,
              playing: !!d.playing,
            }
          : null;
      broadcast({ type: "nowPlaying", data: nowPlaying });
    } else if (msg?.type === "setWatch") {
      // host picked which connected stream shows on the overlay/viewer
      const d = msg.data;
      const embeddable =
        d && typeof d.channel === "string" &&
        (d.platform === "twitch" || d.platform === "kick" || (d.platform === "x" && !!broadcastIdFromUrl(d.channel)));
      if (embeddable) {
        const match = channels.find((c) => c.platform === d.platform && c.channel === d.channel);
        if (match) watch = { platform: match.platform, channel: match.channel };
      } else if (d === null) {
        watch = null;
      }
      broadcast({ type: "watch", data: watch });
    } else if (msg?.type === "chatSend" && typeof msg.data?.text === "string") {
      // native shared chat — anyone on the dashboard posts into one room (no login)
      const t = Date.now();
      const last = (ws as any)._lastChat || 0;
      if (t - last < 800) return; // simple per-connection rate limit
      (ws as any)._lastChat = t;
      const text = msg.data.text.slice(0, 280).trim();
      if (!text) return;
      const user =
        (typeof msg.data.user === "string" ? msg.data.user : "")
          .replace(/[^\w .\-]/g, "")
          .slice(0, 24)
          .trim() || "guest";
      // The host badge is authorized (authed) so a viewer cannot impersonate the
      // streamer on the overlay; everyone else can still post normal shared-chat lines.
      const host = (msg.data.host === true && authed(msg)) || undefined;
      onMessage({ id: `tape_${++chatSeq}_${t}`, platform: "tape", channel: "shared", user, color: null, badges: [], text, ts: t, host });
    }
  });

  ws.on("close", () => clients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`[polychatuwu] server listening on :${PORT}`);
  newswire.start();
  priceFeed.start();
});

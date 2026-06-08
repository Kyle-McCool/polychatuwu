import WebSocket from "ws";
import type { ChatMessage, SourceStatus } from "../types";

const TWITCH_WS = "wss://irc-ws.chat.twitch.tv:443";

// IRCv3 tag unescaping per https://dev.twitch.tv/docs/irc/tags/
function unescapeTag(v: string): string {
  return v
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function parseTags(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) out[part] = "";
    else out[part.slice(0, i)] = unescapeTag(part.slice(i + 1));
  }
  return out;
}

/**
 * Twitch sends emotes out of band in the `emotes` tag: "id:start-end,.../id2:...",
 * where the positions index the message by CODE POINT (not UTF-16 unit). Rewrite
 * those spans into the same inline token the web client already renders for Kick
 * ([temote:id:name]) so Twitch emotes show as images in the feed and overlay.
 */
function applyTwitchEmotes(text: string, emotesTag: string): string {
  if (!emotesTag) return text;
  const chars = Array.from(text); // split on code points so Twitch indices line up
  const ranges: { start: number; end: number; id: string }[] = [];
  for (const group of emotesTag.split("/")) {
    const colon = group.indexOf(":");
    if (colon === -1) continue;
    const id = group.slice(0, colon);
    for (const pos of group.slice(colon + 1).split(",")) {
      const dash = pos.indexOf("-");
      if (dash === -1) continue;
      const start = Number(pos.slice(0, dash));
      const end = Number(pos.slice(dash + 1));
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start) {
        ranges.push({ start, end, id });
      }
    }
  }
  if (!ranges.length) return text;
  ranges.sort((a, b) => b.start - a.start); // splice right to left so earlier indices stay valid
  for (const r of ranges) {
    if (r.end >= chars.length) continue;
    const name = chars.slice(r.start, r.end + 1).join("");
    chars.splice(r.start, r.end - r.start + 1, `[temote:tw:${r.id}:${name}]`);
  }
  return chars.join("");
}

// ── third-party emotes (7TV + BetterTTV + FrankerFaceZ) ────────────────────────
// Twitch's IRC only tags FIRST-PARTY emotes. The rest of what chat actually uses
// (PepeLaugh, OMEGALUL, catJAM…) are 7TV/BTTV/FFZ overlays keyed by NAME. We fetch
// each channel's sets keyless (the channel's numeric id comes free in the IRC
// `room-id` tag), build a name -> {provider,id} map, and rewrite matching words into
// the same client emote token. Globals are fetched once and shared across channels.
const EMOTE_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const EMOTE_TTL = 15 * 60 * 1000;

type EmoteRef = { p: "7tv" | "bttv" | "ffz"; id: string };
const channelEmotes = new Map<string, Map<string, EmoteRef>>(); // login -> (name -> ref), globals merged in
const emotesAt = new Map<string, number>();
const emotesFetching = new Set<string>();
let globalEmotes: Map<string, EmoteRef> | null = null;
let globalLoading: Promise<Map<string, EmoteRef>> | null = null;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { "user-agent": EMOTE_UA }, signal: ctrl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function add7tv(map: Map<string, EmoteRef>, emotes: any) {
  if (!Array.isArray(emotes)) return;
  for (const e of emotes) if (e?.name && e?.id) map.set(e.name, { p: "7tv", id: String(e.id) });
}
function addBttv(map: Map<string, EmoteRef>, data: any) {
  const arrs = Array.isArray(data) ? [data] : [data?.channelEmotes, data?.sharedEmotes];
  for (const arr of arrs) if (Array.isArray(arr)) for (const e of arr) if (e?.code && e?.id) map.set(e.code, { p: "bttv", id: String(e.id) });
}
function addFfz(map: Map<string, EmoteRef>, data: any) {
  const sets = data?.sets;
  if (!sets || typeof sets !== "object") return;
  for (const k of Object.keys(sets)) {
    const ems = sets[k]?.emoticons;
    if (Array.isArray(ems)) for (const e of ems) if (e?.name && e?.id != null) map.set(e.name, { p: "ffz", id: String(e.id) });
  }
}

async function loadGlobals(): Promise<Map<string, EmoteRef>> {
  if (globalEmotes) return globalEmotes;
  if (globalLoading) return globalLoading;
  globalLoading = (async () => {
    const m = new Map<string, EmoteRef>();
    const [sv, bt, ff] = await Promise.allSettled([
      fetchJson("https://7tv.io/v3/emote-sets/global"),
      fetchJson("https://api.betterttv.net/3/cached/emotes/global"),
      fetchJson("https://api.frankerfacez.com/v1/set/global"),
    ]);
    if (sv.status === "fulfilled") add7tv(m, sv.value?.emotes);
    if (bt.status === "fulfilled") addBttv(m, bt.value);
    if (ff.status === "fulfilled") addFfz(m, ff.value);
    globalEmotes = m;
    return m;
  })();
  return globalLoading;
}

async function ensureChannelEmotes(login: string, roomId: string) {
  const now = Date.now();
  const at = emotesAt.get(login);
  if (emotesFetching.has(login) || (at && now - at < EMOTE_TTL)) return;
  emotesFetching.add(login);
  try {
    const globals = await loadGlobals();
    const m = new Map(globals); // channel sets override globals
    const [sv, bt, ff] = await Promise.allSettled([
      fetchJson(`https://7tv.io/v3/users/twitch/${roomId}`),
      fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${roomId}`),
      fetchJson(`https://api.frankerfacez.com/v1/room/id/${roomId}`),
    ]);
    if (sv.status === "fulfilled") add7tv(m, sv.value?.emote_set?.emotes);
    if (bt.status === "fulfilled") addBttv(m, bt.value);
    if (ff.status === "fulfilled") addFfz(m, ff.value);
    channelEmotes.set(login, m);
    emotesAt.set(login, Date.now());
    console.log(`[twitch:${login}] third-party emotes loaded: ${m.size}`);
  } catch {
    /* keep any prior map; retry after TTL */
  } finally {
    emotesFetching.delete(login);
  }
}

// Rewrite whole-word emote names into the client token. Split on whitespace and keep
// it so the line rejoins exactly; first-party tokens have no spaces so they pass through.
function applyThirdPartyEmotes(text: string, map: Map<string, EmoteRef>): string {
  if (!map.size || !text) return text;
  return text
    .split(/(\s+)/)
    .map((tok) => {
      const e = map.get(tok);
      return e ? `[temote:${e.p}:${e.id}:${tok}]` : tok;
    })
    .join("");
}

/**
 * Anonymous Twitch chat reader over IRC-WebSocket using a justinfan login.
 * No OAuth required for read-only. https://dev.twitch.tv/docs/chat/irc/
 */
export class TwitchSource {
  private ws?: WebSocket;
  private closed = false;
  private backoff = 1000;
  private channels: string[];

  constructor(
    channels: string[],
    private onMessage: (m: ChatMessage) => void,
    private onStatus: (s: SourceStatus) => void,
  ) {
    this.channels = channels.map((c) => c.toLowerCase().replace(/^#/, "")).filter(Boolean);
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    for (const ch of this.channels) this.onStatus({ platform: "twitch", channel: ch, state: "connecting" });
    const ws = new WebSocket(TWITCH_WS);
    this.ws = ws;

    ws.on("open", () => {
      this.backoff = 1000;
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`NICK justinfan${Math.floor(Math.random() * 999999)}`);
      for (const ch of this.channels) ws.send(`JOIN #${ch}`);
    });
    ws.on("message", (buf: WebSocket.RawData) => this.onData(buf.toString()));
    ws.on("close", () => this.reconnect());
    ws.on("error", () => {
      for (const ch of this.channels) this.onStatus({ platform: "twitch", channel: ch, state: "error", detail: "socket error" });
    });
  }

  private onData(data: string) {
    for (const line of data.split("\r\n")) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        this.ws?.send("PONG :tmi.twitch.tv");
        continue;
      }
      // ROOMSTATE (sent right on join) carries the channel's numeric id — pre-warm its
      // 7TV/BTTV/FFZ sets now so emotes are ready before the first messages scroll in.
      if (line.includes(" ROOMSTATE #")) {
        const rs = line.match(/^@(\S+) :tmi\.twitch\.tv ROOMSTATE #(\S+)/);
        if (rs) {
          const rsTags = parseTags(rs[1]);
          if (rsTags["room-id"]) void ensureChannelEmotes(rs[2].trim(), rsTags["room-id"]);
        }
        continue;
      }
      const joinIdx = line.indexOf(" JOIN #");
      if (joinIdx !== -1 && line.includes("justinfan")) {
        const ch = line.slice(joinIdx + 7).trim();
        if (ch) this.onStatus({ platform: "twitch", channel: ch, state: "live", detail: "joined" });
        continue;
      }
      const m = line.match(/^(?:@(\S+) )?:(\w+)!\S+ PRIVMSG #(\S+) :(.*)$/);
      if (!m) continue;
      const [, rawTags, login, channel, text] = m;
      const tags = rawTags ? parseTags(rawTags) : {};
      const roomId = tags["room-id"] || "";
      if (roomId) void ensureChannelEmotes(channel, roomId); // lazy-load 7TV/BTTV/FFZ sets for this channel
      let outText = applyTwitchEmotes(text, tags["emotes"] || ""); // first-party emotes (IRC tag)
      const cmap = channelEmotes.get(channel);
      if (cmap) outText = applyThirdPartyEmotes(outText, cmap); // 7TV/BTTV/FFZ emotes (by name)
      this.onMessage({
        id: tags["id"] || `tw_${tags["tmi-sent-ts"] || Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform: "twitch",
        channel,
        user: tags["display-name"] || login,
        color: tags["color"] || null,
        badges: tags["badges"] ? tags["badges"].split(",").map((b) => b.split("/")[0]) : [],
        text: outText,
        ts: tags["tmi-sent-ts"] ? Number(tags["tmi-sent-ts"]) : Date.now(),
        amount: tags["bits"] ? Number(tags["bits"]) : undefined,
      });
    }
  }

  private reconnect() {
    if (this.closed) return;
    for (const ch of this.channels) this.onStatus({ platform: "twitch", channel: ch, state: "connecting", detail: "reconnecting" });
    setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

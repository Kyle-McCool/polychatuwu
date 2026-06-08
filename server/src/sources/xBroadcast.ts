import WebSocket from "ws";
import type { ChatMessage, SourceStatus } from "../types";
import { resolveBroadcast, accessChat, broadcastIdFromUrl, xFetchJson, X_UA, type ChatAccess } from "./xApi";

type Frame = { user: string; name: string; text: string; id: string };

/**
 * Decode one chatman wire frame (from the live WS or the history backfill).
 * Real shape (verified live): outer { kind:2, payload } where payload is a JSON string
 *   { kind, sender:{ username, display_name, ... }, body }
 * Inner kind 1 = a chat message (body is the plain text). Other kinds (4 = join/presence,
 * etc.) are skipped. `raw` may be a JSON string (WS) or an already-parsed object (history).
 */
function parseFrame(raw: any): Frame | null {
  let outer: any = raw;
  if (typeof raw === "string") {
    try { outer = JSON.parse(raw); } catch { return null; }
  }
  let p: any = outer?.payload;
  if (typeof p === "string") {
    try { p = JSON.parse(p); } catch { return null; }
  }
  if (!p || p.kind !== 1) return null; // 1 = chat text
  const text = typeof p.body === "string" ? p.body.trim() : "";
  if (!text) return null;
  const s = p.sender || {};
  const user = s.username || s.display_name || "x_user";
  const id = p.uuid || `${user}:${text}`.slice(0, 96);
  return { user, name: s.display_name || user, text, id };
}

/**
 * Live X broadcast chat via the keyless guest-token path -> Periscope chatman WebSocket.
 * No Playwright, no login. Emits messages as platform "x". Reconnects on drop and
 * re-checks the broadcast state so an ended broadcast flips to offline.
 */
export class XBroadcastSource {
  private ws?: WebSocket;
  private closed = false;
  private bid: string;
  private label: string;
  private seen = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private onMessage: (m: ChatMessage) => void,
    private onStatus: (s: SourceStatus) => void,
  ) {
    this.bid = broadcastIdFromUrl(url) || url;
    this.label = this.bid;
    void this.start();
    this.pollTimer = setInterval(() => void this.checkState(), 60_000);
  }

  static label(url: string): string {
    return broadcastIdFromUrl(url) || "x";
  }

  private status(state: SourceStatus["state"], detail?: string) {
    this.onStatus({ platform: "x", channel: this.label, state, detail });
  }

  private emit(f: Frame) {
    if (this.seen.has(f.id)) return;
    this.seen.add(f.id);
    if (this.seen.size > 6000) this.seen = new Set([...this.seen].slice(-3000));
    this.onMessage({
      id: `x_${f.id}`,
      platform: "x",
      channel: this.label,
      user: f.user,
      color: null,
      badges: [],
      text: f.text,
      ts: Date.now(),
    });
  }

  private async checkState() {
    if (this.closed) return;
    const info = await resolveBroadcast(this.bid);
    if (this.closed || !info) return;
    if (!info.live) this.status("offline", "broadcast ended");
  }

  private async backfill(acc: ChatAccess) {
    const j = await xFetchJson(acc.endpoint + "/chatapi/v1/history", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": X_UA },
      body: JSON.stringify({ access_token: acc.accessToken, cursor: "", limit: 40, since: null, quick_get: true }),
    });
    const msgs: any[] = j?.messages || [];
    const parsed = msgs.map(parseFrame).filter(Boolean) as Frame[];
    for (const f of parsed.slice(-15)) this.emit(f); // seed the panel with the latest few
  }

  private async start() {
    this.status("connecting", "opening X broadcast");
    const info = await resolveBroadcast(this.bid);
    if (this.closed) return;
    if (!info) { this.status("error", "broadcast not found"); return; }
    this.label = info.username || this.bid;
    if (!info.chatToken) {
      this.status(info.live ? "error" : "offline", info.live ? "no chat for this broadcast" : "broadcast ended");
      return;
    }
    const acc = await accessChat(info.chatToken);
    if (this.closed) return;
    if (!acc) { this.status("error", "chat access failed"); return; }

    void this.backfill(acc);

    const wsUrl = acc.endpoint.replace(/^http/, "ws") + "/chatapi/v1/chatnow";
    const ws = new WebSocket(wsUrl, { headers: { "User-Agent": X_UA, Origin: "https://x.com" } });
    this.ws = ws;
    ws.on("open", () => {
      if (this.closed) return;
      const room = acc.roomId || this.bid;
      ws.send(JSON.stringify({ payload: JSON.stringify({ access_token: acc.accessToken, room }), kind: 3 })); // auth
      ws.send(JSON.stringify({ payload: JSON.stringify({ body: JSON.stringify({ room }), kind: 1 }), kind: 2 })); // join room
      this.status("live", `@${this.label} broadcast`);
    });
    ws.on("message", (buf: WebSocket.RawData) => {
      const f = parseFrame(buf.toString());
      if (f) this.emit(f);
    });
    ws.on("close", () => { if (!this.closed) this.scheduleReconnect(); });
    ws.on("error", () => { /* close handler reconnects */ });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.closed) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closed) void this.start();
    }, 4000);
  }

  close() {
    this.closed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

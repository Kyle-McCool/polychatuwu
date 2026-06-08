import WebSocket from "ws";
import { resolveKickChannel } from "./kickResolver";
import type { ChatMessage, SourceStatus } from "../types";

// Public Kick Pusher app key (community-known). https://roundproxies.com/blog/scrape-kick-com/
const PUSHER_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0-rc2&flash=false";

/**
 * Anonymous Kick chat reader via the Pusher WebSocket.
 * Resolves chatroom id from kick.com/api/v2/channels/<slug>, then subscribes to
 * chatrooms.<id>.v2 and handles App\Events\ChatMessageEvent (data is double-encoded JSON).
 */
export class KickSource {
  private ws?: WebSocket;
  private closed = false;
  private backoff = 1000;
  private slug: string;

  constructor(
    slug: string,
    private onMessage: (m: ChatMessage) => void,
    private onStatus: (s: SourceStatus) => void,
  ) {
    this.slug = slug.toLowerCase().trim();
    void this.start();
  }

  private async start() {
    if (this.closed) return;
    this.onStatus({ platform: "kick", channel: this.slug, state: "connecting" });
    let chatroomId: number;
    try {
      const info = await resolveKickChannel(this.slug);
      chatroomId = info.chatroomId;
    } catch (e: any) {
      const msg = String(e?.message || e);
      this.onStatus({
        platform: "kick",
        channel: this.slug,
        state: "error",
        detail: msg.includes("403") ? "blocked (cloudflare)" : "lookup failed",
      });
      if (!this.closed) setTimeout(() => this.start(), 10000);
      return;
    }
    this.connect(chatroomId);
  }

  private connect(chatroomId: number) {
    if (this.closed) return;
    const ws = new WebSocket(PUSHER_URL);
    this.ws = ws;
    ws.on("open", () => {
      this.backoff = 1000;
      ws.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${chatroomId}.v2` } }));
      this.onStatus({ platform: "kick", channel: this.slug, state: "live", detail: "subscribed" });
    });
    ws.on("message", (buf: WebSocket.RawData) => this.onData(buf.toString()));
    ws.on("close", () => this.reconnect(chatroomId));
    ws.on("error", () => this.onStatus({ platform: "kick", channel: this.slug, state: "error", detail: "socket error" }));
  }

  private onData(raw: string) {
    let frame: any;
    try { frame = JSON.parse(raw); } catch { return; }
    if (frame.event === "pusher:ping") {
      this.ws?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
      return;
    }
    if (frame.event === "App\\Events\\ChatMessageEvent") {
      let d: any;
      try { d = JSON.parse(frame.data); } catch { return; }
      const badges = Array.isArray(d?.sender?.identity?.badges)
        ? d.sender.identity.badges.map((b: any) => b?.type).filter(Boolean)
        : [];
      this.onMessage({
        id: d?.id ? `kk_${d.id}` : `kk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        platform: "kick",
        channel: this.slug,
        user: d?.sender?.username || "unknown",
        color: d?.sender?.identity?.color || null,
        badges,
        text: d?.content || "",
        ts: d?.created_at ? Date.parse(d.created_at) : Date.now(),
      });
    }
  }

  private reconnect(chatroomId: number) {
    if (this.closed) return;
    this.onStatus({ platform: "kick", channel: this.slug, state: "connecting", detail: "reconnecting" });
    setTimeout(() => this.connect(chatroomId), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
  }

  close() {
    this.closed = true;
    try { this.ws?.close(); } catch { /* ignore */ }
  }
}

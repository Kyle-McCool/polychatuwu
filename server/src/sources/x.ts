import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import type { ChatMessage, SourceStatus } from "../types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const STATE_PATH = process.env.X_STORAGE_STATE || "x-state.json";
const REFRESH_MS = 20000; // reload cadence to pull NEW replies (posts only; broadcasts stream over WS)

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"] })
      .then((b) => {
        b.on("disconnected", () => { browserPromise = null; }); // if Chromium dies, relaunch on next use
        return b;
      })
      .catch((e) => { browserPromise = null; throw e; }); // never cache a failed launch forever
  }
  return browserPromise;
}

export async function closeXBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => {});
    browserPromise = null;
  }
}

type RawMsg = { id: string; user: string; name: string; text: string };

/** Recursively pull tweet objects out of any X GraphQL/timeline JSON (post replies). */
function extractTweets(json: any): RawMsg[] {
  const out: RawMsg[] = [];
  const seen = new Set<string>();
  const visit = (node: any, depth: number) => {
    if (!node || typeof node !== "object" || depth > 40) return;
    const legacy = node.legacy;
    if (legacy && typeof legacy.full_text === "string") {
      const id: string = node.rest_id || legacy.id_str || "";
      const ur = node.core?.user_results?.result;
      const user = ur?.legacy?.screen_name || ur?.core?.screen_name || "";
      const name = ur?.legacy?.name || ur?.core?.name || "";
      const note = node.note_tweet?.note_tweet_results?.result?.text;
      let text = typeof note === "string" && note ? note : legacy.full_text;
      text = text.replace(/\s*https:\/\/t\.co\/\w+\s*$/g, "").trim();
      if (id && text && !seen.has(id)) {
        seen.add(id);
        out.push({ id, user: user || "x_user", name, text });
      }
    }
    if (Array.isArray(node)) for (const v of node) visit(v, depth + 1);
    else for (const k in node) if (k !== "__typename") visit(node[k], depth + 1);
  };
  visit(json, 0);
  return out;
}

/**
 * Parse one Periscope "chatman" wire frame → a live broadcast chat message.
 * Nesting (per the official tv.periscope.chatman.api WireMessage):
 *   WireMessage { kind, payload }  (kind 1 = chat, 2 = control, 3 = auth)
 *     → payload is a JSON string: { sender:{username,display_name}, body, type }
 *       → body is a JSON string:  { type:1, body:"<the text>", username, displayName, uuid }
 * Text = inner.body, user = inner.username || sender.username. type 1 = chat text.
 */
function parseChatmanWire(wire: any): RawMsg | null {
  if (!wire || wire.kind !== 1) return null;
  let payload: any;
  try {
    payload = typeof wire.payload === "string" ? JSON.parse(wire.payload) : wire.payload;
  } catch {
    return null;
  }
  if (!payload) return null;
  let inner: any = {};
  if (typeof payload.body === "string") {
    try {
      inner = JSON.parse(payload.body);
    } catch {
      inner = {};
    }
  } else if (payload.body && typeof payload.body === "object") {
    inner = payload.body;
  }
  const type = inner.type ?? payload.type;
  if (type !== undefined && type !== 1) return null; // keep only chat text (skip hearts/joins/etc.)
  const text = typeof inner.body === "string" ? inner.body.trim() : "";
  if (!text) return null;
  const user = inner.username || payload.sender?.username || "x_user";
  const name = inner.displayName || payload.sender?.display_name || payload.sender?.displayName || "";
  const id = inner.uuid || `${user}:${text}`.slice(0, 96);
  return { id, user, name, text };
}

function scrapeInPageDom() {
  const out: { id: string; user: string; name: string; text: string }[] = [];
  document.querySelectorAll('article[data-testid="tweet"]').forEach((a) => {
    const nm = (a.querySelector('[data-testid="User-Name"]')?.textContent || "").trim();
    const text = (a.querySelector('[data-testid="tweetText"]')?.textContent || "").trim();
    if (!text) return;
    const user = (nm.match(/@([A-Za-z0-9_]+)/) || [])[1] || "x_user";
    const href = (a.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null)?.getAttribute("href") || "";
    const id = (href.match(/status\/(\d+)/) || [])[1] || `${user}:${text}`.slice(0, 96);
    out.push({ id, user, name: nm, text });
  });
  return out;
}

function detectLoginWall() {
  return !!document.querySelector(
    'input[name="text"], a[href="/login"], [data-testid="loginButton"], [data-testid="login"]',
  );
}

/**
 * X (Twitter) live reader via NETWORK INTERCEPTION.
 *  • Live BROADCASTS (x.com/i/broadcasts/…): taps the Periscope "chatman"
 *    WebSocket (wss://…pscp.tv/chatapi/v1/chatnow) the page opens, + the
 *    /chatapi/v1/history backfill — real broadcast chat.
 *  • Posts/profiles: captures X's GraphQL JSON → replies as chat.
 * Public content often works logged-out; if X walls the IP, run `npm run x-login`
 * once (X_STORAGE_STATE). Never throws into the server.
 */
export class XSource {
  private ctx?: BrowserContext;
  private page?: Page;
  private closed = false;
  private seen = new Set<string>();
  private primed = false;
  private initialEmitted = 0;
  private gotAny = false;
  private wsConnected = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private label: string;
  private isBroadcast: boolean;

  constructor(
    private url: string,
    private onMessage: (m: ChatMessage) => void,
    private onStatus: (s: SourceStatus) => void,
  ) {
    this.label = XSource.shortLabel(url);
    this.isBroadcast = /\/i\/(broadcasts|spaces)\//i.test(url);
    void this.start();
  }

  static shortLabel(url: string): string {
    const mh = url.match(/(?:x\.com|twitter\.com)\/(@?[A-Za-z0-9_]+)/i);
    if (mh && mh[1] && !["i", "home", "search"].includes(mh[1].toLowerCase())) {
      return mh[1].replace(/^@/, "");
    }
    return "x";
  }

  private status(state: SourceStatus["state"], detail?: string) {
    this.onStatus({ platform: "x", channel: this.label, state, detail });
  }

  private emit(msgs: RawMsg[]) {
    for (const t of msgs) {
      if (this.seen.has(t.id)) continue;
      this.seen.add(t.id);
      if (!this.primed) {
        if (this.initialEmitted >= 8) continue;
        this.initialEmitted += 1;
      }
      this.gotAny = true;
      this.onMessage({
        id: `x_${t.id}`,
        platform: "x",
        channel: this.label,
        user: t.user,
        color: null,
        badges: [],
        text: t.text,
        ts: Date.now(),
      });
    }
    if (this.seen.size > 6000) this.seen = new Set([...this.seen].slice(-3000));
  }

  private async start() {
    this.status("connecting", this.isBroadcast ? "opening broadcast" : "opening X");
    const hasState = (() => {
      try {
        return fs.existsSync(STATE_PATH);
      } catch {
        return false;
      }
    })();

    try {
      const browser = await getBrowser();
      if (this.closed) return;
      this.ctx = await browser.newContext({
        userAgent: UA,
        locale: "en-US",
        viewport: { width: 1280, height: 1800 },
        ...(hasState ? { storageState: STATE_PATH } : {}),
      });
      if (this.closed) {
        await this.ctx.close().catch(() => {});
        return;
      }
      this.page = await this.ctx.newPage();
      // Block images/fonts always; block video media only for posts — on a
      // broadcast we let the player init so the chat WebSocket reliably connects.
      await this.page.route("**/*", (route) => {
        const t = route.request().resourceType();
        if (t === "image" || t === "font") return route.abort();
        if (t === "media" && !this.isBroadcast) return route.abort();
        return route.continue();
      });

      // ── BROADCAST chat: tap the Periscope / chatman WebSocket the player opens ──
      // X live-video chat runs on the Periscope backend ("chatman"), but the exact
      // host and path move around. So we match loosely AND log every socket a broadcast
      // page opens, which makes the real chat endpoint obvious if this ever misses.
      let framePeeks = 0;
      this.page.on("websocket", (ws) => {
        const wu = ws.url();
        if (this.isBroadcast) console.log(`[x:${this.label}] ws opened: ${wu}`);
        if (!/chatman|chatapi|\/chatnow|pscp\.tv|periscope/i.test(wu)) return;
        this.wsConnected = true;
        this.primed = true; // WS frames are live (not backlog) — emit immediately
        console.log(`[x:${this.label}] broadcast chat WS connected: ${wu}`);
        ws.on("framereceived", (frame: { payload: string | Buffer }) => {
          try {
            const raw = typeof frame.payload === "string" ? frame.payload : Buffer.from(frame.payload).toString("utf8");
            // peek at the first few frames so the wire shape is visible if parsing misses
            if (framePeeks < 3) {
              framePeeks += 1;
              console.log(`[x:${this.label}] frame: ${raw.slice(0, 280)}`);
            }
            const msg = parseChatmanWire(JSON.parse(raw));
            if (msg) this.emit([msg]);
          } catch {
            /* control/non-JSON frame */
          }
        });
      });

      // ── responses: chatman history backfill + post-reply GraphQL ──
      this.page.on("response", async (resp) => {
        try {
          const u = resp.url();
          const ct = resp.headers()["content-type"] || "";
          if (!ct.includes("json")) return;
          if (/\/chatapi\/v1\/history/i.test(u)) {
            const json = await resp.json().catch(() => null);
            const parsed = ((json?.messages as any[]) || []).map(parseChatmanWire).filter(Boolean) as RawMsg[];
            if (parsed.length) this.emit(parsed);
            return;
          }
          if (!/(\/i\/api\/graphql\/|\/graphql\/|\/2\/timeline|\/2\/guide)/.test(u)) return;
          const json = await resp.json().catch(() => null);
          if (json) {
            const tweets = extractTweets(json);
            if (tweets.length) this.emit(tweets);
          }
        } catch {
          /* ignore */
        }
      });

      await this.page.goto(this.url, { waitUntil: "domcontentloaded", timeout: 45000 });
      if (this.closed) return;

      // Broadcasts need longer: the video player has to init before it negotiates and
      // opens the chat socket. Posts just need their reply GraphQL, which lands fast.
      const maxProbes = this.isBroadcast ? 16 : 8;
      for (let attempt = 0; attempt < maxProbes && !this.closed; attempt += 1) {
        await this.page.waitForTimeout(2500);
        await this.page.evaluate(() => window.scrollBy(0, 1000)).catch(() => {});
        console.log(`[x:${this.label}] probe ${attempt + 1}/${maxProbes} — msgs=${this.gotAny} broadcastWS=${this.wsConnected}`);
        if (this.gotAny || this.wsConnected) break;
      }

      if (!this.gotAny && !this.wsConnected) {
        const dom = await this.page.evaluate(scrapeInPageDom).catch(() => null);
        if (dom && dom.length) this.emit(dom);
      }
      if (!this.gotAny && !this.wsConnected) {
        const wall = await this.page.evaluate(detectLoginWall).catch(() => false);
        this.status(
          "error",
          wall
            ? hasState
              ? "X session expired — re-run: npm run x-login"
              : "X login required — run: npm run x-login"
            : this.isBroadcast
              ? "no broadcast chat — is the broadcast live?"
              : "no posts found — paste the live POST/tweet URL",
        );
        return;
      }

      this.primed = true;
      if (this.wsConnected) {
        this.status("live", "watching live broadcast chat");
        // broadcast chat streams over the WebSocket — no reload needed
      } else {
        this.status("live", "watching X replies");
        this.scheduleRefresh();
      }
    } catch (e: any) {
      if (!this.closed) this.status("error", String(e?.message || "X scrape failed").slice(0, 80));
    }
  }

  // Posts only: reload so X re-fetches the conversation → new replies stream in
  // through the same interceptor (deduped). Broadcasts don't reload (live WS).
  private scheduleRefresh() {
    this.refreshTimer = setTimeout(async () => {
      if (this.closed || !this.page || this.wsConnected) return;
      try {
        await this.page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
        await this.page.waitForTimeout(2500);
        await this.page.evaluate(() => window.scrollBy(0, 1400)).catch(() => {});
      } catch {
        /* transient */
      }
      if (!this.closed) this.scheduleRefresh();
    }, REFRESH_MS);
  }

  close() {
    this.closed = true;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.ctx?.close().catch(() => {});
  }
}

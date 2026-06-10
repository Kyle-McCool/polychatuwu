import { useEffect, useRef, useState } from "react";
import { useChatSocket } from "../hooks/useChatSocket";
import { Reactions } from "./Reactions";
import { renderMessageText } from "../lib/renderMessage";
import { Newspaper, BadgeCheck } from "lucide-react";
import { SRC_META, type ChatMessage, type Platform, type PinnedMarket, type NowPlaying, type NewsItem } from "../lib/types";
import { PlatformIcon } from "./ui";
import { CandleChart } from "./CandleChart";
import { PolymarketTicker } from "./PolymarketTicker";
import { PriceTicker } from "./PriceTicker";
import { WatchPlayer } from "./WatchPlayer";
import { broadcastId } from "../lib/parseChannel";
import { fetchCryptoMarkets, fetchMarketBySlug, fetchOdds, type PMItem, PM_BLUE } from "../lib/polymarket";
import { sentimentOf } from "../lib/sentiment";
import { isBot } from "../lib/moderation";
import { hypeNow, AFFECT_META, type Affect } from "../lib/hype";

const CROWD = "#ECE9E2"; // crowd / chat = off-white (monochrome brand); market stays Polymarket blue
const YES_RE = /\b(yes|yep|yeah|yup|ya|up|long|higher|over|green|moon|pump|bull)\b|🟢|✅|📈|🚀/i;
const NO_RE = /\b(no|nope|nah|down|short|lower|under|red|dump|rug|bear)\b|🔴|❌|📉/i;

function userColor(u: string): string {
  let h = 0;
  for (let i = 0; i < u.length; i += 1) h = (h * 31 + u.charCodeAt(i)) % 360;
  return `hsl(${h}, 28%, 76%)`; // muted hue whisper — matches the cream-on-black frame
}

/**
 * Broadcast overlay — what the AUDIENCE sees on stream. Designed on a fixed
 * 1920×1080 stage that scales to fit any OBS browser source, so the 16:9 video
 * window in the center is pixel-exact (1160×652, a true 16:9, with 380px data rails).
 *
 *   /overlay                     full broadcast frame (transparent 1280×720 center for video)
 *   /overlay?layout=corner       full-screen video, widgets float in the corners (gameplay)
 *   /overlay?solid               preview on dark + show the video placeholder
 *   /overlay?w=candle            ONE widget full-bleed (candle|ticker|wire|chat|market)
 *   ?platforms=twitch,kick  ?max=20  ?nobrand
 */
export function Overlay() {
  const sock = useChatSocket();
  const p = new URLSearchParams(window.location.search);
  const solid = p.has("solid");
  const max = Math.min(40, Number(p.get("max")) || 16);
  const only = (p.get("platforms") || "").split(",").map((s) => s.trim()).filter(Boolean) as Platform[];
  const brand = !p.has("nobrand");
  const solo = (p.get("w") || "").trim();
  const layout = (p.get("layout") || "frame").trim();
  const novideo = p.has("novideo"); // ?novideo forces a transparent center to composite the real video in OBS
  const cfg = sock.overlayConfig;
  const np = sock.nowPlaying;
  // The overlay shows the live stream configured in the app (same channels as the
  // dashboard's Watch tab). ?novideo opts out so you can composite the real video in OBS.
  const hasEmbed =
    !novideo &&
    sock.channels.some((c) => c.platform === "twitch" || c.platform === "kick" || (c.platform === "x" && !!broadcastId(c.channel)));

  const visible = sock.messages.filter((m) => (only.length ? only.includes(m.platform) : true));
  const msgsRef = useRef(visible);
  msgsRef.current = visible;

  // the overlay sits on the stream — always dark, regardless of the app's theme choice
  useEffect(() => {
    document.documentElement.classList.remove("light");
  }, []);

  const [idx, setIdx] = useState({ score: 2, perSec: 0, spiking: false, mood: 50, affect: "neutral" as Affect });
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const hy = hypeNow(msgsRef.current, now);
      let bull = 0;
      let bear = 0;
      for (const m of msgsRef.current) {
        if (now - m.ts < 60000) {
          const s = sentimentOf(m.text);
          bull += s.bull;
          bear += s.bear;
        }
      }
      const tot = bull + bear;
      setIdx({
        score: hy.score,
        perSec: hy.perSec,
        spiking: hy.clip || hy.intensity === "spiking",
        mood: tot >= 4 ? Math.round((bull / tot) * 100) : 50,
        affect: hy.affect,
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const chat = visible.slice(-max);

  // ── solo widget mode (one element as its own OBS source, fills the source) ──
  if (solo) {
    return (
      <div className={`relative h-full w-full overflow-hidden ${solid ? "bg-base" : "bg-transparent"}`}>
        {solo === "candle" && (
          <div className="absolute inset-2 overflow-hidden rounded-sm border border-white/20 bg-black/80 backdrop-blur-sm">
            <HypeTag idx={idx} />
            <CandleChart messages={visible} bucketSec={60} />
          </div>
        )}
        {solo === "ticker" && <div className="absolute inset-x-0 bottom-0"><PolymarketTicker /></div>}
        {solo === "wire" && <div className="absolute inset-2"><OverlayWire /></div>}
        {solo === "market" && <div className="absolute inset-2 flex items-center"><OverlayMarket messages={visible} /></div>}
        {solo === "audio" && <div className="absolute inset-3 flex items-end"><NowPlayingBar np={np} /></div>}
        {solo === "chat" && (
          <div className="absolute inset-2 flex flex-col justify-end gap-2 [mask-image:linear-gradient(to_bottom,transparent,#000_16%)]">
            {chat.map((m) => <OverlayRow key={m.id} m={m} />)}
          </div>
        )}
        {brand && <Brand />}
      </div>
    );
  }

  // ── corner / minimal mode: full-screen video, widgets float in the corners ──
  if (layout === "corner") {
    return (
      <>
      {cfg.features.reactions && <Reactions onReaction={sock.onReaction} count={22} gifs />}
      <Stage solid={solid || hasEmbed}>
        {hasEmbed && (
          <div className="absolute inset-0"><WatchPlayer channels={sock.channels} active={sock.watch} chrome={false} /></div>
        )}
        {cfg.features.news && <NewsToast onNewsToast={sock.onNewsToast} />}
        {/* top-left: index pill + mini candle */}
        <div className="absolute left-5 top-5 w-[320px]">
          {cfg.features.index && (
            <div className="mb-2 flex items-center gap-3 rounded-sm border border-white/20 bg-black/80 px-3 py-1.5 backdrop-blur-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-accent text-[11px] font-black text-accent-ink">P</span>
              <span className="font-mono text-[13px] font-bold tabular-nums text-white/65">
                CHAT HYPE <span className="text-accent">{idx.score}</span>
              </span>
              {idx.affect !== "neutral" && (
                <span className="font-mono text-[12px] font-bold uppercase text-white/80">
                  {AFFECT_META[idx.affect].label}
                </span>
              )}
              <span className="font-mono text-[13px] font-bold tabular-nums">
                <span className="text-white/50">MOOD </span>
                <span className={idx.mood > 55 ? "text-pos" : idx.mood < 45 ? "text-neg" : "text-white"}>{idx.mood}</span>
              </span>
            </div>
          )}
          {cfg.features.candle && (
            <div className="relative h-[130px] overflow-hidden rounded-sm border border-white/20 bg-black/80 backdrop-blur-sm">
              <HypeTag idx={idx} />
              <CandleChart messages={visible} bucketSec={60} />
            </div>
          )}
        </div>

        {/* top-right: betting */}
        {cfg.features.market && (
          <div className="absolute right-5 top-5 w-[330px]">
            <OverlayMarket messages={visible} pinned={cfg.market} />
          </div>
        )}

        {/* bottom-left: chat */}
        {cfg.features.chat && (
          <div className="absolute bottom-28 left-5 flex max-h-[520px] w-[520px] flex-col justify-end gap-1.5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_18%)]">
            {chat.slice(-12).map((m) => (
              <OverlayRow key={m.id} m={m} />
            ))}
          </div>
        )}

        {/* clip banner */}
        {idx.spiking && (
          <div
            className="absolute left-1/2 top-5 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-[15px] font-extrabold uppercase tracking-wider text-accent-ink shadow-lg"
            style={{ animation: "msgIn 200ms ease-out" }}
          >
            <span className="animate-pulse">●</span> CLIP IT
            {idx.affect !== "neutral" && <span> · {AFFECT_META[idx.affect].label}</span>}
          </div>
        )}

        {/* bottom: price tape + Polymarket odds */}
        {cfg.features.ticker && (
          <div className="absolute inset-x-0 bottom-0">
            <PriceTicker prices={sock.prices} />
            <PolymarketTicker />
          </div>
        )}

        {/* now-playing waveform — small, removable (cfg.features.audio) */}
        {cfg.features.audio && np && (
          <div className="absolute bottom-28 right-5">
            <NowPlayingBar np={np} />
          </div>
        )}
      </Stage>
      </>
    );
  }

  // ── full broadcast frame on a fixed 1920×1080 stage ──
  return (
    <>
    {cfg.features.reactions && <Reactions onReaction={sock.onReaction} count={22} gifs />}
    <Stage solid={solid || hasEmbed}>
      {cfg.features.news && <NewsToast onNewsToast={sock.onNewsToast} />}
      <div className="flex h-full w-full flex-col">
        {/* TOP — market-watch ticker, then a slim now-playing + index strip (no brand bar) */}
        <div className="shrink-0">
          {cfg.features.ticker && <PriceTicker prices={sock.prices} />}
          {(cfg.features.audio || cfg.features.index) && (
            <div className="flex h-[30px] items-center justify-between gap-3 border-b border-white/12 bg-black/80 px-3 backdrop-blur-sm">
              {cfg.features.audio && np ? (
                <div className="flex min-w-0 items-center gap-2">
                  <WaveBars playing={np.playing} bars={6} />
                  <div className="min-w-0 max-w-[420px] truncate font-mono text-[11px] text-white/80">
                    <span className="text-white/70">♪</span> {np.title || "Stream audio"}
                    {np.author && <span className="text-white/45"> · {np.author}</span>}
                  </div>
                </div>
              ) : (
                <span />
              )}
              {cfg.features.index && (
                <div className="flex shrink-0 items-center gap-4 font-mono text-[12px] tabular-nums">
                  <span className="text-white/55">
                    CHAT HYPE <span className="font-bold text-accent">{idx.score}</span>
                    {idx.affect !== "neutral" && (
                      <span className="ml-1 text-white/80">{AFFECT_META[idx.affect].label}</span>
                    )}
                  </span>
                  <span className="text-white/55">
                    MOOD <span className={`font-bold ${idx.mood > 55 ? "text-pos" : idx.mood < 45 ? "text-neg" : "text-white"}`}>{idx.mood}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* MIDDLE — big video (hero) over one split band (market | candle) + chat rail */}
        <div className="flex min-h-0 flex-1">
          {/* CENTER: the stream fills the space; market + candle share a single band below */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-3">
            <div className="relative flex min-h-0 w-full max-w-[1600px] flex-1 items-center justify-center">
              {idx.spiking && (
                <div className="absolute top-2 z-10 flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-[15px] font-extrabold uppercase tracking-wider text-accent-ink shadow-lg" style={{ animation: "msgIn 200ms ease-out" }}>
                  <span className="animate-pulse">●</span> CLIP IT{idx.affect !== "neutral" ? ` · ${AFFECT_META[idx.affect].label}` : ""}, chat is popping off
                </div>
              )}
              {hasEmbed ? (
                // live stream fills the center; the Twitch/Kick player keeps it 16:9 inside
                <div className="absolute inset-0 overflow-hidden rounded-sm border border-white/30">
                  <WatchPlayer channels={sock.channels} active={sock.watch} chrome={false} />
                </div>
              ) : (
                <div
                  className={`relative flex aspect-video max-h-full max-w-full items-center justify-center overflow-hidden rounded-sm border border-white/30 ${solid ? "border-dashed bg-white/[0.02]" : ""}`}
                >
                  {solid ? (
                    <span className="font-mono text-base uppercase tracking-[0.25em] text-white/25">16 : 9 · your stream</span>
                  ) : null}
                </div>
              )}
              {cfg.features.lowerThird && cfg.chyron.topic.trim() && (
                <LowerThird topic={cfg.chyron.topic} guests={cfg.chyron.guests} />
              )}
            </div>
            {/* thin data bar — crowd-vs-market (left) + compact chat-hype candle (right) */}
            {(cfg.features.candle || cfg.features.market) && (
              <div className="flex h-16 w-full max-w-[1600px] shrink-0 items-stretch gap-2">
                {cfg.features.market && (
                  <div className="min-w-0 flex-[3]">
                    <OverlayMarket messages={visible} pinned={cfg.market} compact />
                  </div>
                )}
                {cfg.features.candle && (
                  <div className="relative min-w-0 flex-[2] overflow-hidden rounded-sm border border-white/20 bg-black/80 backdrop-blur-sm">
                    <HypeTag idx={idx} />
                    <CandleChart messages={visible} bucketSec={60} compact />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT: chat + top chatters + wire — the whole rail drops out when all three
              are off, so the video reclaims the width and goes large (auto-resize). */}
          {(cfg.features.chat || cfg.features.chatters || cfg.features.wire) && (
            <aside className="flex w-[340px] shrink-0 flex-col gap-3 p-3">
              {cfg.features.chat && (
                <div className="flex min-h-0 flex-[2_1_0] flex-col justify-end gap-1.5 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,#000_16%)]">
                  {chat.map((m) => (
                    <OverlayRow key={m.id} m={m} compact />
                  ))}
                </div>
              )}
              {cfg.features.chatters && <TopChatters messages={visible} />}
              {cfg.features.wire && (
                <div className="flex min-h-0 flex-[1_1_0] flex-col">
                  <div className="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-white/50">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: PM_BLUE }} /> Polymarket wire
                  </div>
                  <div className="min-h-0 flex-1">
                    <OverlayWire />
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>

        {/* BOTTOM — Polymarket live-odds scroll (market-watch is up top; the stream has its own lower-third) */}
        {cfg.features.ticker && (
          <div className="shrink-0">
            <PolymarketTicker />
          </div>
        )}
      </div>
    </Stage>
    </>
  );
}

/**
 * Fluid full-viewport surface. Fills any window / OBS source edge-to-edge and
 * lets the layout reflow (real flexbox, no fixed 1920×1080 uniform scaling), so
 * nothing is ever clipped or letterboxed regardless of the screen. Transparent
 * for OBS; `?solid` paints the base for previewing.
 */
function Stage({ children, solid }: { children: React.ReactNode; solid: boolean }) {
  return (
    <div className={`relative h-full w-full overflow-hidden text-white ${solid ? "bg-base" : "bg-transparent"}`}>
      {children}
    </div>
  );
}

function HypeTag({ idx }: { idx: { score: number; spiking: boolean; affect: Affect } }) {
  return (
    <div className="absolute left-2 top-1 z-10 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider">
      <span className="font-bold text-accent">CHAT HYPE</span>
      <span className="tabular-nums text-white">{idx.score}</span>
      {idx.affect !== "neutral" && (
        <span className="text-white/80">{AFFECT_META[idx.affect].label}</span>
      )}
      {idx.spiking && <span className="rounded bg-accent px-1 font-bold text-accent-ink">CLIP IT</span>}
    </div>
  );
}

function Brand() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-1.5 opacity-60">
      <img src="/logo-icon.png" alt="" className="h-5 w-auto" />
      <span className="text-xs font-bold tracking-wide text-white/85" style={{ fontFamily: "var(--font-display)", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
        Market Bubble
      </span>
    </div>
  );
}

/** Broadcast lower-third — serif "NOW DISCUSSING" banner + guest plates, like a TV chyron. */
function LowerThird({ topic, guests }: { topic: string; guests: string[] }) {
  return (
    <div className="absolute bottom-3 left-3 z-20 max-w-[80%]" style={{ animation: "msgIn 260ms ease-out" }}>
      <div className="inline-flex flex-col rounded-sm border-l-[3px] border-accent bg-black/85 px-4 py-2 backdrop-blur-sm">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-accent">Now discussing</span>
        <span className="font-display text-[28px] font-bold leading-[1.05] text-white" style={{ textShadow: "0 2px 10px rgba(0,0,0,0.95)" }}>
          {topic}
        </span>
        {guests.length > 0 && (
          <span className="mt-1 font-display text-[15px] font-medium tracking-wide text-white/80" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
            {guests.join("   ·   ")}
          </span>
        )}
      </div>
    </div>
  );
}

/** Stylized audio visualizer (the real audio is in the streamer's page, not here). */
function WaveBars({ playing, color = "#ECE9E2", bars = 14 }: { playing: boolean; color?: string; bars?: number }) {
  return (
    <span className="flex h-4 items-center gap-[2px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="eq-bar w-[2px] rounded-full"
          style={{
            background: color,
            animationDelay: `${(i % 7) * 110}ms`,
            animationDuration: `${680 + (i % 5) * 130}ms`,
            animationPlayState: playing ? "running" : "paused",
            opacity: playing ? 1 : 0.35,
          }}
        />
      ))}
    </span>
  );
}

function NowPlayingBar({ np }: { np: NowPlaying | null }) {
  if (!np) return null;
  return (
    <div className="flex max-w-[460px] items-center gap-2.5 rounded-sm border border-white/20 bg-black/80 px-3.5 py-1.5 backdrop-blur-sm">
      <WaveBars playing={np.playing} />
      <div className="min-w-0 leading-tight" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
        <div className="truncate font-mono text-[14px] text-white/90">
          <span className="mr-0.5 text-white/70">♪</span> {np.title || "Stream audio"}
        </div>
        {np.author && <div className="truncate font-mono text-[11px] text-white/55">{np.author}</div>}
      </div>
    </div>
  );
}

function avatarBg(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h}, 20%, 38%)`; // muted avatar fallback
}

/** Twitter-style breaking-news toast — slides in, holds, fades (server-throttled). */
function NewsToast({ onNewsToast }: { onNewsToast: (cb: (n: NewsItem) => void) => () => void }) {
  const [toast, setToast] = useState<{ item: NewsItem; key: number } | null>(null);
  const seq = useRef(0);
  useEffect(
    () =>
      onNewsToast((item) => {
        seq.current += 1;
        setToast({ item, key: seq.current });
      }),
    [onNewsToast],
  );
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 11000); // matches .news-toast animation
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  const n = toast.item;
  const tweet = n.kind === "tweet";
  return (
    <div key={toast.key} className="news-toast absolute left-1/2 top-20 z-20 w-[470px]">
      <div
        className="overflow-hidden rounded-sm border border-white/20 p-4 shadow-2xl backdrop-blur-md"
        style={{ background: "rgba(0,0,0,0.92)" }}
      >
        <div className="mb-2 flex items-center gap-2.5">
          <span
            className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full text-[17px] font-black text-white"
            style={{ background: tweet ? avatarBg(n.name) : "#33312c" }}
          >
            {tweet ? n.name.slice(0, 1).toUpperCase() : <Newspaper size={20} />}
            {tweet && n.avatar && (
              <img
                src={n.avatar}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-[17px] font-bold text-white">{tweet ? n.name : n.source}</span>
              {tweet && <BadgeCheck size={16} className="shrink-0" style={{ color: "#ece9e2" }} />}
              <span className="ml-auto shrink-0 pl-2">
                <PlatformIcon platform="x" size={19} colored={false} className="text-white" />
              </span>
            </div>
            <div className="truncate font-mono text-[12px] text-white/55">
              {tweet ? `@${n.handle}` : "Breaking"} · live
            </div>
          </div>
        </div>
        <p className="line-clamp-4 text-[18px] leading-snug text-white">{n.text}</p>
      </div>
    </div>
  );
}

function TopChatters({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const [top, setTop] = useState<[string, number][]>([]);
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const c = new Map<string, number>();
      for (const m of msgsRef.current) {
        if (now - m.ts > 300000 || isBot(m.user)) continue;
        c.set(m.user, (c.get(m.user) || 0) + 1);
      }
      setTop([...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3));
    }, 3000);
    return () => clearInterval(id);
  }, []);
  if (!top.length) return null;
  return (
    <div className="shrink-0 rounded-sm border border-white/20 bg-black/80 px-3 py-2 backdrop-blur-sm">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-white/50">🔥 Top chatters</div>
      <div className="flex flex-col gap-0.5">
        {top.map(([u, n], i) => (
          <div key={u} className="flex items-center gap-2 font-mono text-[14px]">
            <span className="w-3 text-white/40">{i + 1}</span>
            <span className="truncate font-semibold" style={{ color: userColor(u) }}>{u}</span>
            <span className="ml-auto tabular-nums text-white/45">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OverlayMarket({ messages, pinned, compact }: { messages: ChatMessage[]; pinned?: PinnedMarket | null; compact?: boolean }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const [market, setMarket] = useState<PMItem | null>(null);
  const [chatYes, setChatYes] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const p = pinned ? fetchMarketBySlug(pinned.slug) : fetchCryptoMarkets().then((m) => m[0] || null);
      p.then((m) => alive && m && setMarket(m)).catch(() => {});
    };
    setMarket(null); // clear while the (new) market loads
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pinned?.slug]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const v = new Map<string, "y" | "n">();
      for (const m of msgsRef.current) {
        if (now - m.ts > 90000 || isBot(m.user)) continue;
        if (YES_RE.test(m.text)) v.set(m.user, "y");
        else if (NO_RE.test(m.text)) v.set(m.user, "n");
      }
      let y = 0;
      let n = 0;
      for (const x of v.values()) x === "y" ? (y += 1) : (n += 1);
      // gate: don't show a confident % until enough unique voters (honest small-sample)
      setChatYes(y + n >= 8 ? Math.round((y / (y + n)) * 100) : null);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const marketYes = market?.yesPct ?? null;
  const spread = chatYes != null && marketYes != null ? chatYes - marketYes : null;

  // compact horizontal bar — thin strip under the video; chat % and market % sit side by side
  if (compact) {
    return (
      <div className="flex h-full w-full items-center gap-3 overflow-hidden rounded-sm border bg-black/80 px-3 backdrop-blur-sm" style={{ borderColor: `${PM_BLUE}66` }}>
        <span className="shrink-0 font-mono text-[10px] uppercase leading-[1.1] tracking-wider text-white/55">
          Crowd
          <br />
          vs Mkt
        </span>
        <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
          {market ? market.label : pinned?.label ?? "loading market…"}
        </span>
        <MiniBar label="CHAT" pct={chatYes} color={CROWD} />
        <MiniBar label="MARKET" pct={marketYes} color={PM_BLUE} />
        <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums" style={{ color: spread != null && spread >= 0 ? CROWD : PM_BLUE }}>
          {spread == null ? "vote in chat" : `${spread > 0 ? "▲ +" : spread < 0 ? "▼ " : ""}${spread}`}
        </span>
        <span className="shrink-0" style={{ color: PM_BLUE }} title="Polymarket">
          ◆
        </span>
      </div>
    );
  }

  return (
    <div className="shrink-0 rounded-sm border bg-black/80 p-3 backdrop-blur-sm" style={{ borderColor: `${PM_BLUE}66` }}>
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/55">
        <span className="font-display text-[15px] font-bold leading-none tracking-tight text-white/90">
          Crowd <span className="text-white/45">vs</span> Market
        </span>
        <span className="font-mono uppercase tracking-wider" style={{ color: PM_BLUE }}>◆ Polymarket</span>
      </div>
      <div className="mb-2 line-clamp-2 font-display text-[19px] font-bold leading-tight" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
        {market ? market.label : pinned?.label ?? "loading market…"}
      </div>
      <Bar label="CHAT" pct={chatYes} color={CROWD} />
      <div className="h-1.5" />
      <Bar label="MARKET" pct={marketYes} color={PM_BLUE} />
      <div className="mt-2 text-center font-mono text-[13px] font-bold" style={{ color: spread != null && spread >= 0 ? CROWD : PM_BLUE }}>
        {spread == null ? "type YES / NO in chat" : `${spread > 0 ? "▲ CHAT +" : spread < 0 ? "▼ CHAT " : "CHAT "}${spread} vs MARKET`}
      </div>
    </div>
  );
}

function Bar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between font-mono text-[13px]" style={{ color }}>
        <span className="font-bold">{label}</span>
        <span className="tabular-nums">{pct == null ? "·" : `${pct}% YES`}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct ?? 0}%`, background: color, opacity: pct == null ? 0.4 : 1 }} />
      </div>
    </div>
  );
}

function MiniBar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="font-mono text-[10px] font-bold uppercase" style={{ color }}>
        {label}
      </span>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: color, opacity: pct == null ? 0.4 : 1 }} />
      </div>
      <span className="font-mono text-[11px] font-bold tabular-nums" style={{ color }}>
        {pct == null ? "·" : `${pct}%`}
      </span>
    </div>
  );
}

function OverlayWire() {
  const [items, setItems] = useState<PMItem[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => fetchOdds().then((m) => alive && m.length && setItems(m)).catch(() => {});
    load();
    const id = setInterval(load, 45000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const movers = items
    .filter((i) => Math.abs(i.dayChange) >= 4)
    .sort((a, b) => Math.abs(b.dayChange) - Math.abs(a.dayChange))
    .slice(0, 2);
  const moverIds = new Set(movers.map((m) => m.id));
  const rows = [...movers, ...items.filter((i) => !moverIds.has(i.id)).slice(0, 6)];
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_82%,transparent)]">
      {rows.map((m) => {
        const isMover = moverIds.has(m.id);
        const up = m.dayChange >= 0;
        const moveCol = up ? "#2FD39E" : "#F0616D";
        return (
          <div
            key={m.id}
            className="msg-in rounded-sm border border-white/12 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm"
            style={isMover ? { boxShadow: `inset 3px 0 0 ${moveCol}` } : undefined}
          >
            <span
              className="mr-1.5 rounded px-1 font-mono text-[11px] font-bold tracking-wider"
              style={{ color: isMover ? moveCol : PM_BLUE, background: `${(isMover ? moveCol : PM_BLUE)}22` }}
            >
              {isMover ? `${up ? "▲" : "▼"}${m.dayChange}%` : "POLY"}
            </span>
            <span className="text-[14px] leading-snug text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
              {m.label.length > 76 ? m.label.slice(0, 76) + "…" : m.label}{" "}
              <span className="font-bold tabular-nums" style={{ color: PM_BLUE }}>
                {m.yesPct}%
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function OverlayRow({ m, compact }: { m: ChatMessage; compact?: boolean }) {
  const src = SRC_META[m.platform];
  const whale = !!m.amount && m.amount > 0;
  const host = !!m.host;
  return (
    <div className="msg-in flex">
      <div
        className={`flex max-w-full items-start gap-2 rounded-sm px-2.5 py-1.5 backdrop-blur-sm ${
          whale ? "whale-card" : host ? "border border-white/45 bg-white/[0.12]" : "bg-black/70"
        }`}
        style={whale || host ? undefined : { boxShadow: `inset 3px 0 0 ${src.color}` }}
      >
        <span className="mt-[3px] shrink-0" title={host ? "Host" : src.label}>
          <PlatformIcon platform={m.platform} size={compact ? 14 : 16} />
        </span>
        <div className={`${compact ? "text-[17px]" : "text-[19px]"} leading-snug text-white`} style={{ textShadow: "0 1px 3px rgba(0,0,0,0.85)" }}>
          {host && (
            <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 text-[12px] font-extrabold uppercase tracking-wider text-accent-ink">
              Host
            </span>
          )}
          <span className="mr-1.5 font-bold" style={{ color: host ? "#fff" : userColor(m.user) }}>
            {m.user}
          </span>
          {whale && <span className="mr-1.5 rounded bg-whale px-1.5 py-0.5 text-xs font-extrabold text-accent-ink">+{m.amount}</span>}
          <span className="break-words">{renderMessageText(m.text, 26)}</span>
        </div>
      </div>
    </div>
  );
}

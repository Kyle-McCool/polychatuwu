import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Users, SlidersHorizontal, Radio, HelpCircle, UserPlus, Star, Check, Copy } from "lucide-react";
import type { ChatMessage, NewsItem, PriceItem, Platform } from "../lib/types";
import { fetchMarkets, type MarketCoin } from "../lib/coins";
import { PlatformIcon, SearchInput } from "./ui";
import { usePersisted } from "../hooks/usePersisted";
import { StreamerDesk } from "./StreamerDesk";
import { AttentionDesk } from "./AttentionDesk";
import { Soundboard } from "./Soundboard";
import { GifPicker } from "./GifPicker";
import { PolymarketWire } from "./CryptoWire";
import { Newswire } from "./Newswire";
import { sentimentOf, MIN_SENTIMENT_SAMPLE } from "../lib/sentiment";
import { hypeNow } from "../lib/hype";
import { isBot, classifyMessage } from "../lib/moderation";
import { isReturning, rememberUser } from "../lib/regulars";
import { ModDesk } from "./ModDesk";

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`; // muted, theme-tuned (see index.css)
}

type Badge = { count?: number; dot?: boolean; tone?: "accent" | "neg"; pulse?: boolean; inline?: boolean };

/**
 * Notification indicator on a tab. A count pill when the number matters, or a bare dot for an
 * ambient "something new here". Accent (the one flat brand accent) = new activity worth a glance;
 * neg (red, gently pulsing) = act now (moderation). Renders nothing when there's nothing to show.
 */
function TabBadge({ count = 0, dot = false, tone = "accent", pulse = false, inline = false }: Badge) {
  if (!dot && count <= 0) return null;
  const ring = pulse ? "animate-pulse" : "";
  const bg = tone === "neg" ? "bg-neg" : "bg-accent";
  if (dot) {
    const place = inline ? "ml-1 inline-block align-middle" : "absolute -right-0.5 -top-0.5";
    return <span className={`${place} h-2 w-2 rounded-full ${bg} ${ring}`} aria-hidden />;
  }
  const place = inline ? "ml-1 inline-flex align-middle" : "absolute -right-1 -top-1 inline-flex";
  const txt = tone === "neg" ? "text-white" : "text-accent-ink";
  return (
    <span className={`${place} h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[8px] font-bold tabular-nums ${bg} ${txt} ${ring}`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

/**
 * Two-mode right rail:
 *   MARKETS — the "chat is a market" surfaces (raffle, coin sentiment, top chatters)
 *   DESK    — the streamer-facing tools (pulse/raid, clip log, questions/tips)
 * Both panels stay mounted (one hidden) so the raffle keeps its entries when you
 * flip tabs.
 */
export function RightRail({
  messages,
  news,
  prices,
  onSound,
  onGif,
}: {
  messages: ChatMessage[];
  news: NewsItem[];
  prices: PriceItem[];
  onSound?: (s: string) => void;
  onGif?: (url: string) => void;
}) {
  const [tab, setTab] = usePersisted<"ask" | "market" | "desk" | "wire">("tape.rightTab", "ask");
  const [wireSub, setWireSub] = usePersisted<"news" | "poly" | "coins">("tape.wireSub", "news");
  const [deskSub, setDeskSub] = usePersisted<"fx" | "pulse" | "mod">("tape.deskSub", "fx");

  const { coins, traders } = useMemo(() => {
    const now = Date.now();
    const coinStats: Record<string, { mentions: number; bull: number; bear: number }> = {};
    const traderStats: Record<string, { msgs: number; tags: number; whale: number }> = {};

    for (const m of messages) {
      if (isBot(m.user)) continue;
      const ts = (traderStats[m.user] ||= { msgs: 0, tags: 0, whale: 0 });
      ts.msgs += 1;
      if (m.cashtags?.length) ts.tags += m.cashtags.length;
      if (m.amount && m.amount > 0) ts.whale += 1;

      if (now - m.ts < 120000 && m.cashtags?.length) {
        const { bull: b, bear: be } = sentimentOf(m.text);
        for (const tag of m.cashtags) {
          const cs = (coinStats[tag] ||= { mentions: 0, bull: 0, bear: 0 });
          cs.mentions += 1;
          cs.bull += b;
          cs.bear += be;
        }
      }
    }

    const coins = Object.entries(coinStats)
      .sort((a, b) => b[1].mentions - a[1].mentions)
      .slice(0, 3);
    const traders = Object.entries(traderStats)
      .map(([u, s]) => [u, s.msgs + s.tags * 2 + s.whale * 5] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return { coins, traders };
  }, [messages]);

  // ── Unseen-activity badges ───────────────────────────────────────────────
  // Each tab/subtab flags when something the streamer cares about arrived since they last looked
  // there, so they know to check without watching it:  Ask = new subs/raids/tips + questions ·
  // Chatters = new first-time chatters to greet · Desk = moderation flags (urgent) + a dot when
  // chat is spiking · Wire = fresh newswire items. "Seen" is tracked per leaf (tab or tab:subtab)
  // and reset the moment you navigate away; a badge counts only what's newer than that, and the
  // pre-load backlog is ignored (baseline = app start) so you don't open to a wall of 9+.
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const newsRef = useRef(news);
  newsRef.current = news;
  const appStart = useRef(Date.now());
  const [seen, setSeen] = useState<Record<string, number>>({});
  const seenRef = useRef(seen);
  seenRef.current = seen;
  const knownUsers = useRef<Set<string> | null>(null);
  const newFaces = useRef<number[]>([]); // first-message timestamps of genuinely new chatters
  const [counts, setCounts] = useState({ ask: 0, market: 0, mod: 0, news: 0, spiking: false });

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msgs = msgsRef.current;
      const base = (k: string) => Math.max(seenRef.current[k] ?? 0, appStart.current);
      const bAsk = base("ask");
      const bMarket = base("market");
      const bMod = base("desk:mod");
      const bNews = base("wire:news");

      if (knownUsers.current === null) knownUsers.current = new Set(msgs.map((m) => m.user));
      const known = knownUsers.current;

      let ask = 0;
      let mod = 0;
      for (const m of msgs) {
        if (isBot(m.user)) continue;
        if (now - m.ts < 60000 && !known.has(m.user)) {
          known.add(m.user);
          newFaces.current.push(m.ts);
        }
        if (m.ts > bAsk && (m.event || (m.amount && m.amount > 0) || (m.text.includes("?") && m.text.trim().length >= 8))) {
          ask += 1;
        }
        if (m.ts > bMod && now - m.ts < 15 * 60000) {
          const f = classifyMessage(m.text);
          if (f && f.level >= 2) mod += 1; // actionable flags only, not caps/spam noise
        }
      }
      newFaces.current = newFaces.current.filter((t) => now - t < 30 * 60000).slice(-300);

      const market = newFaces.current.filter((t) => t > bMarket).length;
      const news = newsRef.current.filter((n) => n.ts > bNews).length;
      const hy = hypeNow(msgs, now);
      const spiking = hy.clip || hy.intensity === "spiking";

      setCounts((p) =>
        p.ask === ask && p.market === market && p.mod === mod && p.news === news && p.spiking === spiking
          ? p
          : { ask, market, mod, news, spiking },
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // reset a leaf's "seen" baseline to now the moment you navigate away from it
  const activeLeaf = tab === "desk" ? `desk:${deskSub}` : tab === "wire" ? `wire:${wireSub}` : tab;
  const prevLeaf = useRef(activeLeaf);
  useEffect(() => {
    if (prevLeaf.current !== activeLeaf) {
      const left = prevLeaf.current;
      setSeen((s) => ({ ...s, [left]: Date.now() }));
      prevLeaf.current = activeLeaf;
    }
  }, [activeLeaf]);

  const tabBtn = (id: "ask" | "market" | "desk" | "wire", label: string, Icon: typeof Brain, badge?: Badge) => (
    <button
      onClick={() => setTab(id)}
      role="tab"
      aria-selected={tab === id}
      className={`relative flex shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        tab === id ? "bg-accent text-accent-ink shadow-sm" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
      }`}
    >
      <Icon size={12} /> {label}
      {tab !== id && badge && <TabBadge {...badge} />}
    </button>
  );

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-transparent">
      <div role="tablist" aria-label="Right panel" className="mx-3 mb-3 mt-3 flex shrink-0 items-center justify-between gap-1 rounded-lg border border-line bg-elevated/40 p-1">
        {tabBtn("ask", "Ask", HelpCircle, { count: counts.ask })}
        {tabBtn("market", "Chatters", Users, { count: counts.market })}
        {tabBtn(
          "desk",
          "Desk",
          SlidersHorizontal,
          counts.mod > 0 ? { count: counts.mod, tone: "neg", pulse: true } : counts.spiking ? { dot: true } : undefined,
        )}
        {tabBtn("wire", "Wire", Radio, { count: counts.news })}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
      {/* ASK — the streamer's answer-this-now queue: questions, tips, first-time chatters */}
      <div className={tab === "ask" ? "flex flex-col gap-5" : "hidden"}>
        <AttentionDesk messages={messages} />
      </div>

      {/* CHATTERS — the leaderboard (Top chatters) plus first-time chatters to greet.
          Gamification lives in the chat candle + Crowd vs Market, so the old
          Predict-the-Tape game and raffle were removed as redundant. */}
      <div className={tab === "market" ? "flex flex-col gap-5" : "hidden"}>
        <ChatterBoard traders={traders} />
        <FirstTimeChatters messages={messages} />
      </div>

      {/* DESK — broadcast tools, sub-tabbed: FX (soundboard + GIFs) | Pulse (monitor) | Mod (queue) */}
      <div className={tab === "desk" ? "flex flex-col gap-3" : "hidden"}>
        <div role="tablist" aria-label="Desk section" className="flex shrink-0 gap-1 rounded-md border border-line bg-elevated/40 p-0.5">
          {([
            ["fx", "FX"],
            ["pulse", "Pulse"],
            ["mod", "Mod"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={deskSub === id}
              onClick={() => setDeskSub(id)}
              className={`flex-1 rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
                deskSub === id ? "bg-accent text-accent-ink shadow-sm" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
              }`}
            >
              {label}
              {id === "mod" && deskSub !== "mod" && <TabBadge inline count={counts.mod} tone="neg" pulse />}
              {id === "pulse" && deskSub !== "pulse" && counts.spiking && <TabBadge inline dot />}
            </button>
          ))}
        </div>
        <div className={deskSub === "fx" ? "flex flex-col gap-5" : "hidden"}>
          <GifPicker onGif={onGif} />
          <Soundboard onPlay={onSound} />
        </div>
        <div className={deskSub === "pulse" ? "" : "hidden"}>
          <StreamerDesk messages={messages} />
        </div>
        <div className={deskSub === "mod" ? "" : "hidden"}>
          <ModDesk messages={messages} />
        </div>
      </div>

      {/* WIRE — crypto intel, split into sub-tabs so each feed gets its own page
          (no scrolling past a long newswire to reach the Polymarket wire). */}
      <div className={tab === "wire" ? "flex flex-col gap-3" : "hidden"}>
        <div role="tablist" aria-label="Wire section" className="flex shrink-0 gap-1 rounded-md border border-line bg-elevated/40 p-0.5">
          {([
            ["news", "Newswire"],
            ["poly", "Polymarket"],
            ["coins", "Coins"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={wireSub === id}
              onClick={() => setWireSub(id)}
              className={`flex-1 rounded px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
                wireSub === id ? "bg-accent text-accent-ink shadow-sm" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
              }`}
            >
              {label}
              {id === "news" && wireSub !== "news" && <TabBadge inline count={counts.news} />}
            </button>
          ))}
        </div>
        <div className={wireSub === "news" ? "" : "hidden"}>
          <Newswire news={news} />
        </div>
        <div className={wireSub === "poly" ? "" : "hidden"}>
          <PolymarketWire />
        </div>
        <div className={wireSub === "coins" ? "" : "hidden"}>
          <CoinSentiment coins={coins} />
        </div>
      </div>
      </div>
    </aside>
  );
}

function fmtCoin(p: number): string {
  if (p >= 1000) return p.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  if (p >= 0.01) return p.toFixed(4);
  return p.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

// A compact 7-day price sparkline, color-coded by direction — the at-a-glance trend traders
// expect next to the number (research-backed). Thinned to ~40 points so many rows stay crisp.
function Sparkline({ points, up }: { points: number[]; up: boolean }) {
  const w = 54;
  const h = 18;
  if (points.length < 2) return <svg width={w} height={h} className="shrink-0" />;
  const stepN = Math.max(1, Math.floor(points.length / 40));
  const pts = points.filter((_, i) => i % stepN === 0);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const dx = w / (pts.length - 1);
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${(i * dx).toFixed(1)} ${(h - 1 - ((p - min) / range) * (h - 2)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={up ? "var(--color-pos)" : "var(--color-neg)"} strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.95" />
    </svg>
  );
}

type CoinSort = "top" | "gainers" | "losers" | "buzz";
type CoinTF = "ch1h" | "ch24h" | "ch7d";

// Coins terminal: live market data (keyless CoinGecko markets) with sparklines, a 1h/24h/7d
// timeframe, search any coin, and sort by Top / Gainers / Losers / chat Buzz. Chat's bull/bear
// read layers on when chat is actually talking about a coin.
function CoinSentiment({ coins }: { coins: [string, { mentions: number; bull: number; bear: number }][] }) {
  const [markets, setMarkets] = useState<MarketCoin[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = usePersisted<CoinSort>("tape.coinSort", "top");
  const [tf, setTf] = usePersisted<CoinTF>("tape.coinTf", "ch24h");

  useEffect(() => {
    let alive = true;
    const load = () => fetchMarkets().then((m) => alive && m.length && setMarkets(m));
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const sent = useMemo(() => new Map(coins.map(([t, s]) => [t.toUpperCase(), s])), [coins]);

  const rows = useMemo(() => {
    const ql = q.trim().toUpperCase();
    const list = ql ? markets.filter((c) => c.symbol.includes(ql) || c.name.toUpperCase().includes(ql)) : markets.slice();
    const ch = (c: MarketCoin) => c[tf];
    if (sort === "gainers") list.sort((a, b) => ch(b) - ch(a));
    else if (sort === "losers") list.sort((a, b) => ch(a) - ch(b));
    else if (sort === "buzz") list.sort((a, b) => (sent.get(b.symbol)?.mentions ?? 0) - (sent.get(a.symbol)?.mentions ?? 0) || b.mcap - a.mcap);
    return list.slice(0, 25);
  }, [markets, q, sort, tf, sent]);

  const tfBtn = (k: CoinTF, label: string) => (
    <button
      key={k}
      onClick={() => setTf(k)}
      className={`rounded px-1 py-0.5 font-mono text-[9px] font-semibold uppercase outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-accent/50 ${
        tf === k ? "bg-accent text-accent-ink" : "text-fg-muted hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <Brain size={12} /> Oracle · coins {coins.length > 0 && <span className="text-accent">· chat live</span>}
        </h3>
        <div className="flex items-center gap-0.5 rounded-md border border-line bg-elevated/40 p-0.5">
          {tfBtn("ch1h", "1h")}
          {tfBtn("ch24h", "24h")}
          {tfBtn("ch7d", "7d")}
        </div>
      </div>

      <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search coins…" aria-label="Search coins" className="mb-2" />

      <div className="mb-2 flex gap-0.5 rounded-md border border-line bg-elevated/40 p-0.5">
        {(["top", "gainers", "losers", "buzz"] as CoinSort[]).map((k) => (
          <button
            key={k}
            onClick={() => setSort(k)}
            className={`flex-1 rounded px-1 py-1 font-mono text-[9px] font-semibold uppercase tracking-wide outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-accent/50 ${
              sort === k ? "bg-accent text-accent-ink" : "text-fg-muted hover:text-fg"
            }`}
          >
            {k}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {markets.length === 0 && <p className="px-1 font-mono text-[11px] text-fg-muted">loading coins…</p>}
        {markets.length > 0 && rows.length === 0 && (
          <p className="px-1 font-mono text-[11px] text-fg-muted">{`no match for "${q}"`}</p>
        )}
        {rows.map((c) => {
          const change = c[tf];
          const up = change >= 0;
          const s = sent.get(c.symbol);
          const tot = s ? s.bull + s.bear : 0;
          const bullPct = tot >= MIN_SENTIMENT_SAMPLE ? Math.round((s!.bull / tot) * 100) : null;
          return (
            <div key={c.id} className="flex items-center gap-2 rounded-md border border-line bg-elevated/40 px-2 py-1.5">
              <img src={c.image} alt="" width={16} height={16} loading="lazy" className="h-4 w-4 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[13px] font-bold text-fg">{c.symbol}</span>
                  <span className="truncate font-mono text-[10px] tabular-nums text-fg-muted">${fmtCoin(c.price)}</span>
                </div>
                {bullPct != null && (
                  <span className={`font-mono text-[9px] font-bold ${bullPct > 55 ? "text-pos" : bullPct < 45 ? "text-neg" : "text-fg-dim"}`}>
                    chat {bullPct}% bull
                  </span>
                )}
              </div>
              <Sparkline points={c.spark} up={c.ch7d >= 0} />
              <span className={`w-[50px] shrink-0 text-right font-mono text-[11px] font-bold tabular-nums ${up ? "text-pos" : "text-neg"}`}>
                {up ? "▲" : "▼"}
                {Math.abs(change).toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

type NewChatter = { user: string; ts: number; returning: boolean; platform: Platform };

/**
 * New chatters this session, the highest-retention surface: greeting a first-timer by name and
 * welcoming back a regular is what turns a viewer into a follower. Split into two scannable
 * groups, REGULARS BACK (a ★, seen in a past stream via the keyless local memory in regulars.ts)
 * and NEW FACES (genuine first-timers, with their platform). Click any chip to copy "@name" so
 * you can greet them in one move.
 */
function FirstTimeChatters({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const known = useRef<Set<string> | null>(null);
  const fresh = useRef<NewChatter[]>([]);
  const [list, setList] = useState<NewChatter[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msgs = msgsRef.current;
      if (known.current === null) known.current = new Set(msgs.map((m) => m.user));
      const seen = known.current;
      for (const m of msgs) {
        if (now - m.ts < 60000 && !seen.has(m.user) && !isBot(m.user)) {
          seen.add(m.user);
          const returning = isReturning(m.user); // seen them in a past session?
          rememberUser(m.user); // remember for next time
          fresh.current.push({ user: m.user, ts: m.ts, returning, platform: m.platform });
        }
      }
      fresh.current = fresh.current.filter((c) => now - c.ts < 5 * 60000).slice(-40);
      setList([...fresh.current].reverse().slice(0, 30));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function greet(user: string) {
    navigator.clipboard?.writeText("@" + user.replace(/^@/, "")).then(
      () => {
        setCopied(user);
        setTimeout(() => setCopied(null), 1100);
      },
      () => {},
    );
  }

  const regulars = list.filter((c) => c.returning);
  const newcomers = list.filter((c) => !c.returning);

  const relTime = (ts: number): string => {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 10) return "now";
    if (s < 60) return `${s}s`;
    return `${Math.round(s / 60)}m`;
  };

  const Row = (c: NewChatter) => (
    <button
      key={c.user + c.ts}
      onClick={() => greet(c.user)}
      title={`Copy @${c.user.replace(/^@/, "")} to greet them`}
      className={`group flex items-center gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-accent/50 ${
        c.returning ? "border-accent/30 bg-accent/[0.06] hover:bg-accent/[0.1]" : "border-line bg-elevated/40 hover:bg-elevated"
      }`}
    >
      {c.returning ? <Star size={12} className="shrink-0 text-accent" /> : <PlatformIcon platform={c.platform} size={12} />}
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] font-medium" style={{ color: userColor(c.user) }}>
        {c.user}
      </span>
      <span className="shrink-0 font-mono text-[9px] tabular-nums text-fg-muted">{relTime(c.ts)}</span>
      {copied === c.user ? (
        <Check size={12} className="shrink-0 text-pos" />
      ) : (
        <Copy size={11} className="shrink-0 text-fg-muted opacity-0 transition group-hover:opacity-100" />
      )}
    </button>
  );

  const REG_CAP = 10;
  const NEW_CAP = 12;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <UserPlus size={12} /> New chatters {list.length > 0 && <span className="text-pos">· {list.length}</span>}
      </h3>

      {list.length === 0 && (
        <p className="px-1 font-mono text-[10px] leading-relaxed text-fg-muted">
          new faces show up here as they say their first words. click one to copy a greeting.
        </p>
      )}

      {regulars.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 px-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-accent">
            ★ {regulars.length} regular{regulars.length === 1 ? "" : "s"} back
          </p>
          <div className="flex flex-col gap-1">{regulars.slice(0, REG_CAP).map(Row)}</div>
          {regulars.length > REG_CAP && (
            <p className="mt-1 px-0.5 font-mono text-[9px] text-fg-muted">+{regulars.length - REG_CAP} more</p>
          )}
        </div>
      )}

      {newcomers.length > 0 && (
        <div>
          {regulars.length > 0 && (
            <p className="mb-1 px-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-fg-muted">new faces</p>
          )}
          <div className="flex flex-col gap-1">{newcomers.slice(0, NEW_CAP).map(Row)}</div>
          {newcomers.length > NEW_CAP && (
            <p className="mt-1 px-0.5 font-mono text-[9px] text-fg-muted">+{newcomers.length - NEW_CAP} more this session</p>
          )}
        </div>
      )}
    </section>
  );
}

function ChatterBoard({ traders }: { traders: [string, number][] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Users size={12} /> Top chatters
      </h3>
      <div className="flex flex-col gap-1">
        {traders.length === 0 && (
          <p className="px-1 font-mono text-[11px] text-fg-muted">Top chatters show up here as people start typing.</p>
        )}
        {traders.map(([user, score], i) => (
          <div
            key={user}
            className="flex items-center justify-between rounded-md border border-line bg-elevated/40 px-2 py-1.5"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-4 text-center font-mono text-[10px] font-bold text-fg-muted">{i + 1}</span>
              <span className="truncate text-sm font-medium" style={{ color: userColor(user) }}>
                {user}
              </span>
            </span>
            <span className="font-mono text-[11px] tabular-nums text-fg-dim">{score.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

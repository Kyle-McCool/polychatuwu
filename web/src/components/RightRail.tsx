import { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Users, SlidersHorizontal, Radio, HelpCircle, UserPlus } from "lucide-react";
import type { ChatMessage, NewsItem, PriceItem } from "../lib/types";
import { usePersisted } from "../hooks/usePersisted";
import { StreamerDesk } from "./StreamerDesk";
import { AttentionDesk } from "./AttentionDesk";
import { Soundboard } from "./Soundboard";
import { GifPicker } from "./GifPicker";
import { PolymarketWire } from "./CryptoWire";
import { Newswire } from "./Newswire";
import { sentimentOf, MIN_SENTIMENT_SAMPLE } from "../lib/sentiment";
import { isBot } from "../lib/moderation";

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`; // muted, theme-tuned (see index.css)
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
  const [deskSub, setDeskSub] = usePersisted<"fx" | "pulse">("tape.deskSub", "fx");

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

  const tabBtn = (id: "ask" | "market" | "desk" | "wire", label: string, Icon: typeof Brain) => (
    <button
      onClick={() => setTab(id)}
      role="tab"
      aria-selected={tab === id}
      className={`flex shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-wider outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        tab === id ? "bg-accent text-accent-ink shadow-sm" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
      }`}
    >
      <Icon size={12} /> {label}
    </button>
  );

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-transparent">
      <div role="tablist" aria-label="Right panel" className="mx-3 mb-3 mt-3 flex shrink-0 items-center justify-between gap-1 rounded-lg border border-white/8 bg-elevated/40 p-1">
        {tabBtn("ask", "Ask", HelpCircle)}
        {tabBtn("market", "Chatters", Users)}
        {tabBtn("desk", "Desk", SlidersHorizontal)}
        {tabBtn("wire", "Wire", Radio)}
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

      {/* DESK — broadcast tools, sub-tabbed: FX (soundboard + GIFs you fire) | Pulse (monitor) */}
      <div className={tab === "desk" ? "flex flex-col gap-3" : "hidden"}>
        <div role="tablist" aria-label="Desk section" className="flex shrink-0 gap-1 rounded-md border border-white/8 bg-elevated/40 p-0.5">
          {([
            ["fx", "FX"],
            ["pulse", "Pulse"],
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
      </div>

      {/* WIRE — crypto intel, split into sub-tabs so each feed gets its own page
          (no scrolling past a long newswire to reach the Polymarket wire). */}
      <div className={tab === "wire" ? "flex flex-col gap-3" : "hidden"}>
        <div role="tablist" aria-label="Wire section" className="flex shrink-0 gap-1 rounded-md border border-white/8 bg-elevated/40 p-0.5">
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
          <CoinSentiment prices={prices} coins={coins} />
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

// Live top coins (crypto + memecoins) with 24h change, plus chat's bull/bear read
// layered on when the chat is actually talking about that coin. Always populated.
function CoinSentiment({
  prices,
  coins,
}: {
  prices: PriceItem[];
  coins: [string, { mentions: number; bull: number; bear: number }][];
}) {
  const sent = new Map(coins.map(([t, s]) => [t.toUpperCase(), s]));
  const list = prices.filter((p) => p.kind !== "stock").slice(0, 14);
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Brain size={12} /> Oracle · coins
        {coins.length > 0 && <span className="text-accent">· chat live</span>}
      </h3>
      <div className="flex flex-col gap-1">
        {list.length === 0 && <p className="px-1 font-mono text-[11px] text-fg-muted">loading coins…</p>}
        {list.map((p) => {
          const s = sent.get(p.symbol.toUpperCase());
          const total = s ? s.bull + s.bear : 0;
          const bullPct = total >= MIN_SENTIMENT_SAMPLE ? Math.round((s!.bull / total) * 100) : null;
          const up = p.change >= 0;
          return (
            <div key={p.symbol} className="flex items-center justify-between rounded-md border border-white/5 bg-elevated/40 px-2.5 py-1.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="font-mono text-sm font-semibold text-fg">{p.symbol}</span>
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">${fmtCoin(p.price)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2.5">
                {bullPct != null && (
                  <span className={`font-mono text-[10px] font-bold ${bullPct > 55 ? "text-pos" : bullPct < 45 ? "text-neg" : "text-fg-dim"}`}>
                    chat {bullPct}% bull
                  </span>
                )}
                <span className={`font-mono text-xs font-bold tabular-nums ${up ? "text-pos" : "text-neg"}`}>
                  {up ? "▲" : "▼"}
                  {Math.abs(p.change).toFixed(2)}%
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// First-time chatters this session — greet them. Tracks users seen at mount as the
// baseline (so the backlog is not flagged), then collects genuinely-new names. Lives
// under Top chatters in the Chatters tab.
function FirstTimeChatters({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const known = useRef<Set<string> | null>(null);
  const fresh = useRef<{ user: string; ts: number }[]>([]);
  const [list, setList] = useState<{ user: string; ts: number }[]>([]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msgs = msgsRef.current;
      if (known.current === null) known.current = new Set(msgs.map((m) => m.user));
      const seen = known.current;
      for (const m of msgs) {
        if (now - m.ts < 60000 && !seen.has(m.user) && !isBot(m.user)) {
          seen.add(m.user);
          fresh.current.push({ user: m.user, ts: m.ts });
        }
      }
      fresh.current = fresh.current.filter((c) => now - c.ts < 5 * 60000).slice(-40);
      setList([...fresh.current].reverse().slice(0, 24));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <UserPlus size={12} /> First-time chatters {list.length > 0 && <span className="text-pos">· {list.length}</span>}
      </h3>
      <div className="flex flex-wrap gap-1">
        {list.length === 0 && <p className="px-1 font-mono text-[10px] text-fg-muted">none yet this session</p>}
        {list.map((c) => (
          <span
            key={c.user + c.ts}
            className="rounded-full border border-white/10 bg-elevated/50 px-2 py-0.5 font-mono text-[11px]"
            style={{ color: userColor(c.user) }}
          >
            {c.user}
          </span>
        ))}
      </div>
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
        {traders.length === 0 && <p className="px-1 font-mono text-[11px] text-fg-muted">·</p>}
        {traders.map(([user, score], i) => (
          <div
            key={user}
            className="flex items-center justify-between rounded-md border border-white/5 bg-elevated/40 px-2 py-1.5"
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

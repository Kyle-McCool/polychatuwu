import { useEffect, useRef, useState } from "react";
import { Megaphone, Share2, Flame, Zap, Search, X, Brain } from "lucide-react";
import type { ChatMessage, CrowdScore, OverlayConfig } from "../lib/types";
import { usePersisted } from "../hooks/usePersisted";
import {
  fetchCryptoMarkets,
  fetchMarketBySlug,
  fetchMarketYes,
  searchMarkets,
  PM_BLUE,
  PM_ICON,
  type PMItem,
} from "../lib/polymarket";
import type { ShareMoment } from "./ShareCard";
import { isBot } from "../lib/moderation";

const YES_RE = /\b(yes|yep|yeah|yup|ya|up|long|higher|over|green|moon|pump|bull)\b|🟢|✅|📈|🚀/i;
const NO_RE = /\b(no|nope|nah|down|short|lower|under|red|dump|rug|bear)\b|🔴|❌|📉/i;
const ROUND_SEC = 45;
const RECHECK_MS = 40000;

type Snapshot = {
  label: string;
  chatYes: number;
  marketStart: number;
  marketLater: number | null;
  led: boolean | null;
  ts: number;
};

// chat = the brand accent (theme-aware: off-white on dark, dark ink on light) so it reads
// in both themes here on the dashboard. The overlay keeps its own always-off-white CROWD.
const ACCENT = "var(--color-accent)";
const MIN_SAMPLE = 10; // don't show a confident % below this many unique voters
const MIN_META = 5; // surprisingly-popular needs at least this many meta-predictions

// Wilson score 95% interval for a binomial proportion — honest about small samples
// (far better than the naive ±√(p(1-p)/n) near 0/1 and at low n). [Wilson 1927]
function wilson(p: number, n: number): { margin: number } {
  if (n <= 0) return { margin: 1 };
  const z = 1.96;
  const denom = 1 + (z * z) / n;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return { margin };
}

/**
 * THE BET — unified market console (lives in the streamer's Overlay tab).
 * Search Polymarket → pick a bet → it pins to the overlay (overlayConfig.market,
 * what chat sees) AND becomes the bet the "Ask chat — beat the market" round runs
 * on. One bet, everywhere. Then we re-poll the market and check whether it moved
 * toward chat's call — proving chat is a leading indicator. (Was the old
 * right-panel CROWD vs MARKET + the separate bet search, now merged.)
 */
export function CrowdVsMarket({
  messages,
  channel,
  onShare,
  onScore,
  config,
  onConfig,
}: {
  messages: ChatMessage[];
  channel: string;
  onShare: (m: ShareMoment) => void;
  onScore: (s: CrowdScore) => void;
  config: OverlayConfig;
  onConfig: (c: OverlayConfig) => void;
}) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;

  const [featured, setFeatured] = useState<PMItem | null>(null);
  const [round, setRound] = useState<{ startTs: number; marketStart: number; label: string; id: string } | null>(null);
  const [tally, setTally] = useState<{ yes: number; no: number; metaMean: number | null; metaCount: number }>({
    yes: 0,
    no: 0,
    metaMean: null,
    metaCount: 0,
  });
  const [secsLeft, setSecsLeft] = useState(0);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const snapsRef = useRef<Snapshot[]>([]);
  // chat's running track record vs the market, persisted so it accumulates across streams
  const [record, setRecord] = usePersisted<{ led: boolean; ts: number }[]>("tape.crowdRecord", []);
  const rechecks = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => rechecks.current.forEach(clearTimeout), []);

  // search-to-pick a bet
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PMItem[]>([]);
  const [searching, setSearching] = useState(false);
  const tmr = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinnedSlug = config.market?.slug ?? null;

  // the active market: the pinned bet (by slug) or auto top-crypto when none pinned.
  // Mirrors the overlay's OverlayMarket so /app and the broadcast always match.
  useEffect(() => {
    let alive = true;
    const load = () => {
      const p = pinnedSlug ? fetchMarketBySlug(pinnedSlug) : fetchCryptoMarkets().then((m) => m[0] || null);
      p.then((m) => alive && m && setFeatured(m)).catch(() => {});
    };
    setFeatured(null);
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pinnedSlug]);

  // search debounce
  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    if (tmr.current) clearTimeout(tmr.current);
    tmr.current = setTimeout(async () => {
      setResults(await searchMarkets(q.trim()));
      setSearching(false);
    }, 350);
    return () => {
      if (tmr.current) clearTimeout(tmr.current);
    };
  }, [q]);

  // round timer
  useEffect(() => {
    if (!round) return;
    const id = setInterval(() => {
      const now = Date.now();
      const left = Math.max(0, ROUND_SEC - Math.floor((now - round.startTs) / 1000));
      setSecsLeft(left);

      const v = new Map<string, { vote: "yes" | "no"; meta: number | null }>();
      for (const m of msgsRef.current) {
        if (m.ts < round.startTs || isBot(m.user)) continue;
        const isYes = YES_RE.test(m.text);
        const isNo = !isYes && NO_RE.test(m.text);
        if (!isYes && !isNo) continue;
        // optional surprisingly-popular meta-prediction: a 0–100 number in the vote ("YES 70")
        const num = m.text.match(/\b(\d{1,3})\b/);
        const meta = num && +num[1] >= 0 && +num[1] <= 100 ? +num[1] : null;
        v.set(m.user, { vote: isYes ? "yes" : "no", meta });
      }
      let y = 0;
      let n = 0;
      let metaSum = 0;
      let metaCount = 0;
      for (const { vote, meta } of v.values()) {
        if (vote === "yes") y += 1;
        else n += 1;
        if (meta != null) {
          metaSum += meta;
          metaCount += 1;
        }
      }
      setTally({ yes: y, no: n, metaMean: metaCount ? metaSum / metaCount : null, metaCount });

      if (left <= 0) {
        clearInterval(id); // finalize exactly once: stop ticks now, before the async setRound(null)
        const total = y + n;
        const chatYes = total ? Math.round((y / total) * 100) : 50;
        const snap: Snapshot = { label: round.label, chatYes, marketStart: round.marketStart, marketLater: null, led: null, ts: now };
        snapsRef.current = [snap, ...snapsRef.current].slice(0, 12);
        setSnaps([...snapsRef.current]);
        const rid = round.id;
        setRound(null);
        const recheck = setTimeout(() => {
          fetchMarketYes(rid)
            .then((later) => {
              if (later == null) return;
              const led =
                chatYes !== snap.marketStart && later !== snap.marketStart
                  ? Math.sign(chatYes - snap.marketStart) === Math.sign(later - snap.marketStart)
                  : null;
              snapsRef.current = snapsRef.current.map((s) => (s === snap ? { ...s, marketLater: later, led } : s));
              setSnaps([...snapsRef.current]);
              if (led !== null) setRecord((r) => [{ led, ts: now }, ...r].slice(0, 200));
            })
            .catch(() => {});
        }, RECHECK_MS);
        rechecks.current.push(recheck);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [round]);

  function ask() {
    if (!featured || round) return;
    setRound({ startTs: Date.now(), marketStart: featured.yesPct, label: featured.label, id: featured.id });
    setTally({ yes: 0, no: 0, metaMean: null, metaCount: 0 });
    setSecsLeft(ROUND_SEC);
  }
  function pick(m: PMItem) {
    onConfig({ ...config, market: { slug: m.id, label: m.label } }); // pins → overlay + here
    setQ("");
    setResults([]);
  }

  const voteTotal = tally.yes + tally.no;
  const enoughVotes = voteTotal >= MIN_SAMPLE;
  const chatYes = round && voteTotal ? Math.round((tally.yes / voteTotal) * 100) : null;
  const ci = round && voteTotal ? wilson(tally.yes / voteTotal, voteTotal) : null;
  // Surprisingly Popular (Prelec, Nature 2017): YES is "surprisingly popular" when its
  // real share beats what voters predicted others would say — surfaces informed signal,
  // not just volume. Needs enough meta-predictions to mean anything.
  const sp =
    round && chatYes != null && tally.metaMean != null && tally.metaCount >= MIN_META
      ? chatYes > tally.metaMean
      : null;
  const marketYes = round ? round.marketStart : featured?.yesPct ?? null;
  const spread = chatYes != null && marketYes != null ? chatYes - marketYes : null;
  const last = snaps[0];
  // aggregate track record (persisted): how often chat's call led the market
  const resolved = record.length;
  const chatWins = record.reduce((a, r) => a + (r.led ? 1 : 0), 0);
  const marketWins = resolved - chatWins;
  const winRate = resolved ? Math.round((chatWins / resolved) * 100) : 0;
  let streak = 0;
  for (const r of record) {
    if (r.led) streak += 1;
    else break;
  }

  // relay the track-record summary so the overlay scoreboard (a separate browser that
  // can't read this dashboard's localStorage) can show the on-air record
  useEffect(() => {
    onScore({ chatWins, marketWins, resolved, winRate, streak });
  }, [chatWins, marketWins, resolved, winRate, streak, onScore]);

  function share() {
    const m = last;
    const cy = chatYes ?? m?.chatYes ?? null;
    const my = round ? round.marketStart : m?.marketStart ?? marketYes;
    if (cy == null || my == null) return;
    onShare({ channel, label: round?.label || m?.label || featured?.label || "", chatPct: cy, marketPct: my, led: m?.led ?? null });
  }

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <img src={PM_ICON} alt="" width={12} height={12} /> The bet
      </h3>

      <div
        className="rounded-xl border p-3"
        style={{ borderColor: `${PM_BLUE}55`, background: `linear-gradient(160deg, ${PM_BLUE}14, transparent 70%)` }}
      >
        {/* CROWD vs MARKET scoreboard — chat's running record against the market */}
        <div className="mb-3 rounded-lg border border-white/8 bg-white/[0.04] px-3 py-2">
          <div className="text-center font-display text-[15px] font-bold tracking-tight text-fg">
            Crowd <span className="text-fg-muted">vs</span> Market
          </div>
          {resolved > 0 ? (
            <>
              <div className="mt-1.5 flex items-center justify-center gap-4 font-mono tabular-nums">
                <span className="flex flex-col items-center">
                  <span className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: ACCENT }}>Chat</span>
                  <span className="text-[24px] font-black leading-none" style={{ color: ACCENT }}>{chatWins}</span>
                </span>
                <span className="text-fg-muted">·</span>
                <span className="flex flex-col items-center">
                  <span className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: PM_BLUE }}>Market</span>
                  <span className="text-[24px] font-black leading-none" style={{ color: PM_BLUE }}>{marketWins}</span>
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-center gap-2 font-mono text-[10px] text-fg-muted">
                <span>chat leads <span className="font-bold text-fg-dim">{winRate}%</span> of {resolved}</span>
                {streak >= 2 && (
                  <span className="flex items-center gap-0.5 font-bold text-accent">
                    <Flame size={10} /> {streak} in a row
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1 text-center font-mono text-[10px] text-fg-muted">run a round below and chat's record builds here</p>
          )}
        </div>

        {/* current bet (shown on overlay) + clear-to-auto */}
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded px-1 font-mono text-[9px] font-bold uppercase tracking-wide" style={{ background: `${PM_BLUE}22`, color: PM_BLUE }}>
            {pinnedSlug ? "pinned" : "auto"}
          </span>
          {featured ? (
            <a href={featured.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-fg transition hover:text-accent" title={featured.label}>
              {featured.label}
            </a>
          ) : (
            <span className="min-w-0 flex-1 text-[12px] text-fg-muted">{config.market?.label ?? "loading market…"}</span>
          )}
          {pinnedSlug && !round && (
            <button
              onClick={() => onConfig({ ...config, market: null })}
              aria-label="Back to auto top-crypto"
              title="Back to auto"
              className="shrink-0 rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* search to feature a specific bet (locked during a live round) */}
        {!round && (
          <>
            <div className="relative mt-2">
              <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search a Polymarket bet to feature…"
                aria-label="Search Polymarket bets"
                className="h-8 w-full rounded-md border border-white/10 bg-elevated/60 pl-7 pr-2 text-sm text-fg outline-none transition placeholder:text-fg-muted focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
              />
            </div>
            {(searching || results.length > 0) && (
              <div className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto">
                {searching && results.length === 0 && <p className="px-1 py-1 font-mono text-[10px] text-fg-muted">searching…</p>}
                {results.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => pick(m)}
                    className="flex items-center justify-between gap-2 rounded-md border border-white/5 bg-elevated/40 px-2 py-1.5 text-left outline-none transition hover:border-accent/40 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-fg-dim" title={m.label}>
                      {m.label}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color: PM_BLUE }}>
                      {m.yesPct}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* the two readings */}
        <div className="mt-3 space-y-2">
          <Bar label="CHAT" pct={enoughVotes ? chatYes : null} color={ACCENT} pending={!enoughVotes} />
          <Bar label="MARKET" pct={marketYes} color={PM_BLUE} />
        </div>

        {/* sample size + 95% confidence, and the surprisingly-popular signal */}
        {round && (
          <div className="mt-1.5 text-center font-mono text-[10px] text-fg-muted">
            {enoughVotes ? (
              <>
                crowd estimate · n={voteTotal}
                {ci ? ` · 95% CI ±${Math.round(ci.margin * 100)}%` : ""}
              </>
            ) : (
              <>gathering votes… n={voteTotal} · need {MIN_SAMPLE}</>
            )}
          </div>
        )}
        {sp != null && (
          <div className="mt-1 flex items-center justify-center gap-1 font-mono text-[10px] font-bold" style={{ color: ACCENT }}>
            <Brain size={11} /> surprisingly popular: {sp ? "YES" : "NO"}
          </div>
        )}

        {/* spread callout — only once the sample is big enough to mean something */}
        {enoughVotes && spread != null && Math.abs(spread) >= 1 && (
          <div className="mt-2 text-center font-mono text-[12px] font-bold" style={{ color: spread > 0 ? ACCENT : PM_BLUE }}>
            {spread > 0 ? "▲" : "▼"} CHAT {spread > 0 ? "+" : ""}
            {spread} vs MARKET
            <span className="ml-1 font-normal text-fg-muted">· chat is {spread > 0 ? "more bullish" : "more bearish"}</span>
          </div>
        )}

        {/* action / round state */}
        {round ? (
          <div className="mt-3">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="flex items-center gap-1 font-bold text-accent">
                <Zap size={12} /> ROUND LIVE
              </span>
              <span className="tabular-nums text-fg-dim">0:{String(secsLeft).padStart(2, "0")}</span>
            </div>
            <p className="mt-1 font-mono text-[10px] text-fg-muted">
              type <span className="font-bold text-pos">YES</span> / <span className="font-bold text-neg">NO</span> (+ a % others agree, e.g. <span className="text-fg-dim">YES 70</span>) · {voteTotal} voted
            </p>
          </div>
        ) : (
          <button
            onClick={ask}
            disabled={!featured}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[12px] font-bold text-accent-ink outline-none transition hover:brightness-110 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-accent/50"
            style={{ background: PM_BLUE }}
          >
            <Megaphone size={14} /> Ask chat: beat the market
          </button>
        )}

        {/* scoreboard + share */}
        {snaps.length > 0 && (
          <div className="mt-3 border-t border-white/8 pt-2">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-fg-muted">Recent calls</span>
              <button
                onClick={share}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim outline-none transition hover:bg-elevated hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <Share2 size={11} /> share
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {snaps.slice(0, 3).map((s) => (
                <div key={s.ts} className="flex items-center justify-between font-mono text-[10px]">
                  <span className="truncate text-fg-dim" style={{ maxWidth: 150 }}>
                    {s.label}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
                    <span style={{ color: ACCENT }}>{s.chatYes}</span>
                    <span className="text-fg-muted">vs</span>
                    <span style={{ color: PM_BLUE }}>{s.marketStart}</span>
                    {s.led === true && <span className="text-pos">✓ led</span>}
                    {s.led === false && <span className="text-fg-muted">·</span>}
                    {s.led === null && s.marketLater === null && <span className="text-fg-muted">…</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-2 font-mono text-[9px] leading-relaxed text-fg-muted">
          live crowd poll · 1 vote/user, bots filtered · the market is money-weighted, chat isn't · "chat led" = the
          market later moved toward chat's call
        </p>
      </div>
    </section>
  );
}

function Bar({ label, pct, color, pending }: { label: string; pct: number | null; color: string; pending?: boolean }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between font-mono text-[10px]">
        <span className="font-bold tracking-wider" style={{ color }}>
          {label}
        </span>
        <span className="tabular-nums" style={{ color }}>
          {pending || pct == null ? "·" : `${pct}% YES`}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/8">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct ?? 0}%`, background: color, opacity: pending ? 0.4 : 1 }} />
      </div>
    </div>
  );
}

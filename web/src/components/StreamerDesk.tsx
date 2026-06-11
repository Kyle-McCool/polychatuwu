import { useEffect, useRef, useState } from "react";
import { Activity, Scissors, AlertTriangle, Copy, Check, Flame, Repeat } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { isJunk, isBot } from "../lib/moderation";
import { hypeNow, hypeSeries, AFFECT_META, type Affect } from "../lib/hype";
import { renderMessageText } from "../lib/renderMessage";
import { ChatMix } from "./ChatMix";
import { EmptyState } from "./ui";

function fmtClock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function ago(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

const VIBE_ORDER: Affect[] = ["hype", "funny", "shock", "rekt", "rage"];

/** Tiny inline sparkline of the recent hype series. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 100;
  const H = 30;
  if (data.length < 2) return <div style={{ height: H }} />;
  const max = Math.max(24, ...data); // floor so a calm line doesn't fill the box
  const pts = data
    .map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - (Math.max(0, v) / max) * H).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={color} opacity={0.12} />
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Stat({ label, value, tone = "text-fg" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex-1 rounded-md border border-line bg-elevated/40 px-2 py-1.5">
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className={`font-mono text-[15px] font-bold leading-tight tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

/**
 * Broadcast-monitoring half of the desk: a live chat pulse (score + sparkline +
 * KPIs), the emotional vibe of the room, what chat is spamming right now, where
 * the chat is coming from, and the running clip-moment log. All derived live from
 * the chat stream every second; no auth, no external calls.
 */
export function StreamerDesk({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;

  const known = useRef<Set<string> | null>(null); // users seen at mount (don't flag the backlog)
  const clipLog = useRef<{ ts: number; score: number; affect: Affect }[]>([]);
  const prevSpiking = useRef(false);
  const peakRef = useRef(0); // session peak hype

  const [s, setS] = useState({
    score: 0,
    perSec: 0,
    base: 0,
    status: "calm" as "calm" | "active" | "spiking",
    affect: "neutral" as Affect,
    raid: 0,
    chatters: 0,
    peak: 0,
    spark: [] as number[],
    vibe: [] as { a: Affect; n: number }[],
    echo: [] as { text: string; n: number }[],
    clips: [] as { ts: number; score: number; affect: Affect }[],
  });
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => {
      const nowMs = Date.now();
      const msgs = msgsRef.current;
      if (known.current === null) known.current = new Set(msgs.map((m) => m.user));
      const seen = known.current;

      // hype headline + the per-second series that feeds the sparkline + vibe
      const hy = hypeNow(msgs, nowMs);
      const nowSec = Math.floor(nowMs / 1000);
      const series = hypeSeries(msgs, nowSec - 59, nowSec, nowSec - 59); // all real (no synth seed)
      const spark = series.map((p) => Math.round(p.score));
      peakRef.current = Math.max(peakRef.current, hy.score);

      // recent-window scans: raid signal, active chatters, echo (convergence)
      let newUsers10 = 0;
      let junk10 = 0;
      const chatters = new Set<string>();
      const echo = new Map<string, { text: string; n: number }>();
      for (const m of msgs) {
        const age = nowMs - m.ts;
        if (age >= 60000) continue;
        const bot = isBot(m.user);
        if (age < 10000) {
          if (!seen.has(m.user)) newUsers10 += 1;
          if (isJunk(m.text)) junk10 += 1;
        }
        if (bot) continue;
        chatters.add(m.user);
        const t = m.text.trim();
        if (t && t.length <= 48) {
          // collapse 3+ repeats so "LFGGGG" and "lfg" group together
          const norm = t.toLowerCase().replace(/(.)\1{2,}/g, "$1$1").replace(/\s+/g, " ").trim();
          if (norm) {
            const e = echo.get(norm) || { text: t, n: 0 };
            e.n += 1;
            echo.set(norm, e);
          }
        }
      }
      // keep the "seen" set growing so raid detection only counts genuinely-new users
      for (const m of msgs) if (nowMs - m.ts < 60000 && !seen.has(m.user) && !isBot(m.user)) seen.add(m.user);

      // vibe = per-second dominant affect tallied over the window (cheap, no re-classify)
      const vibeCount: Record<Affect, number> = { funny: 0, hype: 0, rekt: 0, shock: 0, rage: 0, neutral: 0 };
      for (const p of series) if (p.affect !== "neutral") vibeCount[p.affect] += 1;
      const vibe = VIBE_ORDER.map((a) => ({ a, n: vibeCount[a] })).filter((v) => v.n > 0);

      const echoTop = [...echo.values()].filter((e) => e.n >= 3).sort((a, b) => b.n - a.n).slice(0, 4);

      // clip log: one entry per spike (rising edge)
      const spiking = hy.clip || hy.intensity === "spiking";
      if (spiking && !prevSpiking.current) clipLog.current.push({ ts: nowMs, score: hy.score, affect: hy.affect });
      prevSpiking.current = spiking;
      clipLog.current = clipLog.current.slice(-40);

      const raid = newUsers10 >= 12 || junk10 >= 5 ? Math.max(newUsers10, junk10) : 0;

      setS({
        score: hy.score,
        perSec: hy.perSec,
        base: hy.base,
        status: hy.intensity,
        affect: hy.affect,
        raid,
        chatters: chatters.size,
        peak: peakRef.current,
        spark,
        vibe,
        echo: echoTop,
        clips: [...clipLog.current].reverse(),
      });
      setNow(nowMs);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function copyClips() {
    const text = s.clips.map((c) => `${fmtClock(c.ts)}  ·  ${AFFECT_META[c.affect].label} · hype ${c.score}`).join("\n");
    navigator.clipboard?.writeText(text || "no clips yet").then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  }

  const statusMeta = {
    calm: { label: "CALM", cls: "text-fg-dim", stroke: "var(--color-fg-muted)" },
    active: { label: "ACTIVE", cls: "text-accent", stroke: "var(--color-accent)" },
    spiking: { label: "SPIKING, CLIP IT", cls: "text-pos", stroke: "var(--color-pos)" },
  }[s.status];
  const mult = s.base > 0 ? s.perSec / s.base : null;
  const vibeTot = s.vibe.reduce((a, v) => a + v.n, 0) || 1;

  return (
    <div className="flex flex-col gap-5">
      {/* CHAT PULSE — score, live trend, and the key broadcast KPIs */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <Activity size={12} /> Chat pulse
        </h3>
        <div className="panel rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black tabular-nums text-fg">{s.score}</span>
              <span className={`font-mono text-[11px] font-bold ${statusMeta.cls}`}>{statusMeta.label}</span>
            </div>
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider"
              style={{ color: AFFECT_META[s.affect].color, background: `${AFFECT_META[s.affect].color}1a` }}
            >
              {AFFECT_META[s.affect].label}
            </span>
          </div>
          <div className="mt-1.5">
            <Sparkline data={s.spark} color={statusMeta.stroke} />
          </div>
          <div className="mt-2 flex gap-1.5">
            <Stat label="msgs/s" value={`${s.perSec}`} />
            <Stat
              label="vs base"
              value={mult != null ? `${mult.toFixed(1)}x` : "·"}
              tone={mult != null && mult >= 1.5 ? "text-pos" : "text-fg"}
            />
            <Stat label="chatters" value={`${s.chatters}`} />
            <Stat label="peak" value={`${s.peak}`} />
          </div>
          {s.raid > 0 && (
            <div className="mt-2 flex items-center gap-1.5 rounded-md bg-neg/15 px-2 py-1.5 font-mono text-[11px] font-bold text-neg">
              <AlertTriangle size={12} /> Possible raid · {s.raid} new/spam in 10s
            </div>
          )}
        </div>
      </section>

      {/* VIBE — the emotional mix of the room over the last minute */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <Flame size={12} /> Vibe · 60s
        </h3>
        {s.vibe.length === 0 ? (
          <p className="px-1 font-mono text-[11px] text-fg-muted">reading the room…</p>
        ) : (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-fg/8">
              {s.vibe.map((v) => (
                <div
                  key={v.a}
                  style={{ width: `${(v.n / vibeTot) * 100}%`, background: AFFECT_META[v.a].color }}
                  title={`${AFFECT_META[v.a].label} ${Math.round((v.n / vibeTot) * 100)}%`}
                />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {s.vibe.map((v) => (
                <span key={v.a} className="flex items-center gap-1 font-mono text-[10px] text-fg-dim">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: AFFECT_META[v.a].color }} />
                  {AFFECT_META[v.a].label}
                  <span className="tabular-nums text-fg-muted">{Math.round((v.n / vibeTot) * 100)}%</span>
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ECHO — what chat is spamming right now (the convergence / clip signal) */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <Repeat size={12} /> Echo · what chat is spamming
        </h3>
        {s.echo.length === 0 ? (
          <p className="px-1 font-mono text-[11px] text-fg-muted">no repeated reactions yet</p>
        ) : (
          <div className="flex flex-col gap-1">
            {s.echo.map((e) => (
              <div
                key={e.text}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-elevated/40 px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-[13px] text-fg-dim">{renderMessageText(e.text)}</span>
                <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-accent">×{e.n}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CHAT MIX — where the chat is coming from */}
      <ChatMix messages={messages} />

      {/* CLIP MOMENTS — every spike, timestamped, ready to clip */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            <Scissors size={12} /> Clip moments · {s.clips.length}
          </h3>
          <button
            onClick={copyClips}
            className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-dim transition hover:bg-elevated hover:text-fg"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "copied" : "copy"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          {s.clips.length === 0 && (
            <EmptyState size={52}>spikes get logged here as chat pops off, ready to clip</EmptyState>
          )}
          {s.clips.slice(0, 8).map((c) => (
            <div
              key={c.ts}
              className="flex items-center justify-between rounded border border-accent/20 bg-accent/[0.06] px-2 py-1.5"
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-fg">
                <Scissors size={10} className="text-accent" /> {fmtClock(c.ts)}
                <span className="text-fg-muted">· {ago(now - c.ts)}</span>
              </span>
              <span className="font-mono text-[10px] tabular-nums" style={{ color: AFFECT_META[c.affect].color }}>
                {AFFECT_META[c.affect].label} · {c.score}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

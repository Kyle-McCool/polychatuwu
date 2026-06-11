import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "../lib/types";
import { sentimentOf, MIN_SENTIMENT_SAMPLE } from "../lib/sentiment";
import { hypeNow, AFFECT_META, type Affect } from "../lib/hype";

const FLAP_CHARS = " 0123456789.$%+-▲▼ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function FlapChar({ ch }: { ch: string }) {
  const [disp, setDisp] = useState(ch);
  useEffect(() => {
    if (disp === ch) return;
    let steps = 4;
    const id = setInterval(() => {
      steps -= 1;
      if (steps <= 0) {
        setDisp(ch);
        clearInterval(id);
      } else {
        setDisp(FLAP_CHARS[Math.floor(Math.random() * FLAP_CHARS.length)]);
      }
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch]);
  return (
    <span className="inline-block w-[0.62em] text-center">
      <span key={disp} className="flap-char">
        {disp}
      </span>
    </span>
  );
}

function Flap({ value, width, className }: { value: string; width: number; className?: string }) {
  const padded = value.padStart(width, " ").slice(-width);
  return (
    <span className={`font-mono tabular-nums ${className || ""}`}>
      {padded.split("").map((c, i) => (
        <FlapChar key={i} ch={c} />
      ))}
    </span>
  );
}

function Dir({ d }: { d: number }) {
  if (d > 0) return <span className="text-pos">▲</span>;
  if (d < 0) return <span className="text-neg">▼</span>;
  return <span className="text-fg-muted">·</span>;
}

function Index({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-[11px] uppercase tracking-wider text-fg-muted">{label}</span>
      <span className="flex items-center gap-1">{children}</span>
    </div>
  );
}

function Divider() {
  return <span className="h-4 w-px shrink-0 bg-line-strong" />;
}

export function IndexBoard({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const prev = useRef({ hype: 0, mood: 50 });
  const [m, setM] = useState({
    hype: "0",
    hypeDir: 0,
    mood: 50,
    moodLabel: "NEUTRAL",
    moodDir: 0,
    affect: "neutral" as Affect,
    movers: [] as [string, number][],
  });

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const msgs = msgsRef.current;
      let bull = 0;
      let bear = 0;
      const tags: Record<string, number> = {};
      for (const msg of msgs) {
        const age = now - msg.ts;
        if (age < 60000) {
          const s = sentimentOf(msg.text);
          bull += s.bull;
          bear += s.bear;
          for (const tag of msg.cashtags || []) tags[tag] = (tags[tag] || 0) + 1;
        }
      }
      const hy = hypeNow(msgs, now);
      const hype = hy.score;
      const total = bull + bear;
      const mood = total >= MIN_SENTIMENT_SAMPLE ? Math.round((bull / total) * 100) : 50;
      const moodLabel =
        total < MIN_SENTIMENT_SAMPLE ? "NEUTRAL" : mood > 55 ? "BULLISH" : mood < 45 ? "BEARISH" : "NEUTRAL";
      const movers = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const hypeDir = Math.sign(hype - prev.current.hype);
      const moodDir = Math.sign(mood - prev.current.mood);
      prev.current = { hype, mood };
      setM({ hype: String(hype), hypeDir, mood, moodLabel, moodDir, affect: hy.affect, movers });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const moodColor = m.mood > 55 ? "text-pos" : m.mood < 45 ? "text-neg" : "text-fg-dim";

  return (
    <div className="flex items-center gap-5 overflow-x-auto border-b border-line bg-surface/40 px-4 py-2 backdrop-blur-md">
      <Index label="CHAT HYPE">
        <Flap value={m.hype} width={3} className="text-base font-bold text-accent" />
        {m.affect !== "neutral" && (
          <span className="font-mono text-xs uppercase" style={{ color: AFFECT_META[m.affect].color }}>
            {AFFECT_META[m.affect].label}
          </span>
        )}
        <Dir d={m.hypeDir} />
      </Index>

      <Divider />

      <Index label="MOOD">
        <Flap value={String(m.mood)} width={3} className={`text-base font-bold ${moodColor}`} />
        <span className={`font-mono text-xs ${moodColor}`}>{m.moodLabel}</span>
        <Dir d={m.moodDir} />
      </Index>

      <Divider />

      <div className="flex shrink-0 items-center gap-3">
        <span className="text-[11px] uppercase tracking-wider text-fg-muted">Movers</span>
        {m.movers.length === 0 && <span className="font-mono text-sm text-fg-muted">·</span>}
        {m.movers.map(([tag, n]) => (
          <span key={tag} className="flex items-center gap-1 font-mono text-sm">
            <span className="text-accent">${tag}</span>
            <span className="text-pos">▲</span>
            <Flap value={String(n)} width={2} className="text-xs text-pos" />
          </span>
        ))}
      </div>
    </div>
  );
}

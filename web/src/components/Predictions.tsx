import { useEffect, useRef, useState } from "react";
import { Dices, Trophy, TrendingUp, TrendingDown, Ticket } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { isBot } from "../lib/moderation";
import { EmptyState } from "./ui";

const UP_WORDS = [" up", "pump", "higher", "🟢", "🚀", "bull", "moon", "green", "📈", "⬆", "↑"];
const DOWN_WORDS = [" down", "dump", "lower", "🔴", "bear", " red", "rug", "📉", "⬇", "↓"];

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h}, 72%, 67%)`;
}

/**
 * Predict-the-tape raffle. Each candle bucket is a round; viewers type up/down in
 * chat to call whether the next candle pumps (more chatter) or dumps (less). Correct
 * calls earn raffle entries; the streamer draws a weighted-random winner for giveaways.
 */
export function Predictions({ messages, bucketSec }: { messages: ChatMessage[]; bucketSec: number }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const entriesRef = useRef<Map<string, number>>(new Map());
  const roundRef = useRef<number>(-1);

  const [up, setUp] = useState(0);
  const [down, setDown] = useState(0);
  const [secsLeft, setSecsLeft] = useState(bucketSec);
  const [last, setLast] = useState<{ dir: "up" | "down"; correct: number; total: number } | null>(null);
  const [board, setBoard] = useState<[string, number][]>([]);
  const [entrants, setEntrants] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);

  useEffect(() => {
    const volIn = (b: number) => {
      const s = b * 1000;
      const e = (b + bucketSec) * 1000;
      let n = 0;
      for (const m of msgsRef.current) if (m.ts >= s && m.ts < e) n += 1;
      return n;
    };
    const parseVotes = (startSec: number) => {
      const v = new Map<string, "up" | "down">();
      for (const m of msgsRef.current) {
        if (m.ts < startSec * 1000 || isBot(m.user)) continue;
        const t = ` ${m.text.toLowerCase()} `;
        if (UP_WORDS.some((w) => t.includes(w))) v.set(m.user, "up");
        if (DOWN_WORDS.some((w) => t.includes(w))) v.set(m.user, "down");
      }
      return v;
    };

    const id = setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      const cur = nowSec - (nowSec % bucketSec);
      if (roundRef.current === -1) roundRef.current = cur;

      if (cur !== roundRef.current) {
        const closed = roundRef.current;
        const votes = parseVotes(closed);
        const dir: "up" | "down" = volIn(closed) >= volIn(closed - bucketSec) ? "up" : "down";
        let correct = 0;
        for (const [user, vote] of votes) {
          if (vote === dir) {
            correct += 1;
            entriesRef.current.set(user, (entriesRef.current.get(user) || 0) + 1);
          }
        }
        if (votes.size) setLast({ dir, correct, total: votes.size });
        roundRef.current = cur;
      }

      const votes = parseVotes(cur);
      let u = 0;
      let d = 0;
      for (const v of votes.values()) {
        if (v === "up") u += 1;
        else d += 1;
      }
      setUp(u);
      setDown(d);
      setSecsLeft(Math.max(0, bucketSec - (nowSec - cur)));
      setBoard([...entriesRef.current.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5));
      setEntrants(entriesRef.current.size);
    }, 1000);
    return () => clearInterval(id);
  }, [bucketSec]);

  function draw() {
    const pool: string[] = [];
    for (const [u, n] of entriesRef.current) for (let i = 0; i < n; i += 1) pool.push(u);
    if (!pool.length) return;
    setWinner(pool[Math.floor(Math.random() * pool.length)]);
  }

  const total = up + down;
  const upPct = total ? Math.round((up / total) * 100) : 50;
  const mm = Math.floor(secsLeft / 60);
  const ss = secsLeft % 60;

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Dices size={12} /> Predict the tape
      </h3>

      <div className="panel rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-dim">
            next candle: <span className="font-semibold text-fg">pump or dump?</span>
          </span>
          <span className="font-mono text-[11px] tabular-nums text-fg-muted">
            {mm}:{String(ss).padStart(2, "0")}
          </span>
        </div>

        <div className="mt-2 flex h-6 overflow-hidden rounded-md border border-white/10">
          <div
            className="flex items-center justify-start bg-pos/25 pl-2 transition-all"
            style={{ width: `${upPct}%` }}
          >
            <span className="flex items-center gap-1 font-mono text-[11px] font-bold text-pos">
              <TrendingUp size={11} />
              {up}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end bg-neg/25 pr-2">
            <span className="flex items-center gap-1 font-mono text-[11px] font-bold text-neg">
              {down}
              <TrendingDown size={11} />
            </span>
          </div>
        </div>

        <p className="mt-1.5 font-mono text-[10px] text-fg-muted">
          type <span className="font-bold text-pos">up</span> / <span className="font-bold text-neg">down</span> in chat to enter
        </p>

        {last && (
          <div
            className={`mt-2 rounded-md px-2 py-1 font-mono text-[11px] ${
              last.dir === "up" ? "bg-pos/15 text-pos" : "bg-neg/15 text-neg"
            }`}
          >
            {last.dir === "up" ? "▲ PUMPED" : "▼ DUMPED"} · {last.correct}/{last.total} correct · +1 entry
          </div>
        )}
      </div>

      <div className="mt-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
            <Trophy size={11} /> Raffle · {entrants} in
          </span>
          <button
            onClick={draw}
            className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-[11px] font-bold text-accent-ink outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Dices size={12} /> Draw
          </button>
        </div>

        {winner && (
          <div className="mb-1.5 flex items-center justify-center gap-2 rounded-md border border-accent/40 bg-accent/15 px-2 py-2 text-sm font-bold text-accent">
            <Trophy size={14} /> {winner}
          </div>
        )}

        <div className="flex flex-col gap-1">
          {board.length === 0 && (
            <EmptyState size={52}>no entries yet, correct up/down calls earn raffle tickets</EmptyState>
          )}
          {board.map(([user, n], i) => (
            <div
              key={user}
              className="flex items-center justify-between rounded border border-white/5 bg-elevated/40 px-2 py-1"
            >
              <span className="flex items-center gap-2 truncate">
                <span className="font-mono text-[10px] text-fg-muted">{i + 1}</span>
                <span className="truncate text-sm" style={{ color: userColor(user) }}>
                  {user}
                </span>
              </span>
              <span className="flex items-center gap-1 font-mono text-[11px] tabular-nums text-accent">
                {n} <Ticket size={11} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

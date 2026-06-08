import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import type { ChatMessage, Platform } from "../lib/types";
import { SRC_META } from "../lib/types";
import { isBot } from "../lib/moderation";

const ORDER: Platform[] = ["twitch", "kick", "x", "tape"];

/** Where the chat is coming from — % split per platform over the last 5 min. */
export function ChatMix({ messages }: { messages: ChatMessage[] }) {
  const ref = useRef(messages);
  ref.current = messages;
  const [mix, setMix] = useState<Record<Platform, number>>({ twitch: 0, kick: 0, x: 0, tape: 0 });

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const m: Record<Platform, number> = { twitch: 0, kick: 0, x: 0, tape: 0 };
      for (const msg of ref.current) if (now - msg.ts < 300000 && !isBot(msg.user)) m[msg.platform] += 1;
      setMix(m);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const total = ORDER.reduce((s, p) => s + mix[p], 0);
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
        <Layers size={12} /> Chat mix · 5m
      </h3>
      {total === 0 ? (
        <p className="px-1 font-mono text-[11px] text-fg-muted">no messages yet</p>
      ) : (
        <>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-white/8">
            {ORDER.map((p) =>
              mix[p] > 0 ? (
                <div
                  key={p}
                  style={{ width: `${(mix[p] / total) * 100}%`, background: SRC_META[p].color }}
                  title={`${SRC_META[p].label} ${Math.round((mix[p] / total) * 100)}%`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {ORDER.filter((p) => mix[p] > 0).map((p) => (
              <span key={p} className="flex items-center gap-1 font-mono text-[10px] text-fg-dim">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: SRC_META[p].color }} />
                {SRC_META[p].label} <span className="tabular-nums text-fg-muted">{Math.round((mix[p] / total) * 100)}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Coins } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { isQuestion, isJunk, isBot } from "../lib/moderation";
import { renderMessageText } from "../lib/renderMessage";
import { EmptyState } from "./ui";

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`; // muted, theme-tuned (see index.css)
}

type AttItem = { type: "tip" | "q"; m: ChatMessage };

/**
 * The streamer's "answer this now" queue — its own tab because it's the highest-value
 * streamer surface. Questions and tips are surfaced from the firehose before they scroll
 * off. Derived live from the chat stream; no auth, no external calls, nothing hardcoded.
 * (First-time chatters moved to the Chatters tab, under Top chatters.)
 */
export function AttentionDesk({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const [attention, setAttention] = useState<AttItem[]>([]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msgs = msgsRef.current;
      // surface questions + tips from the last few minutes, newest first
      const out: AttItem[] = [];
      for (let i = msgs.length - 1; i >= 0 && out.length < 40; i -= 1) {
        const m = msgs[i];
        if (now - m.ts > 4 * 60000) break;
        if (isJunk(m.text) || isBot(m.user)) continue;
        if (m.amount && m.amount > 0) out.push({ type: "tip", m });
        else if (isQuestion(m.text)) out.push({ type: "q", m });
      }
      setAttention(out);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* NEEDS ATTENTION — questions + tips to answer before they scroll off */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <HelpCircle size={12} /> Needs attention {attention.length > 0 && <span className="text-accent">· {attention.length}</span>}
        </h3>
        <div className="flex flex-col gap-1">
          {attention.length === 0 && (
            <EmptyState size={64}>questions and tips from chat surface here, so you can answer before they scroll off</EmptyState>
          )}
          {attention.map(({ type, m }) => (
            <div key={m.id} className="msg-in rounded-md border border-line bg-elevated/40 px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                {type === "tip" ? (
                  <Coins size={11} className="shrink-0 text-whale" />
                ) : (
                  <HelpCircle size={11} className="shrink-0 text-accent" />
                )}
                <span className="truncate font-mono text-[11px] font-semibold" style={{ color: userColor(m.user) }}>
                  {m.user}
                </span>
                {type === "tip" && m.amount ? (
                  <span className="ml-auto rounded bg-whale/20 px-1 font-mono text-[10px] font-bold text-whale">+{m.amount}</span>
                ) : null}
              </div>
              <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-fg/85">{renderMessageText(m.text)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

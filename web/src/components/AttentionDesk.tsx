import { useEffect, useRef, useState } from "react";
import { HelpCircle, Coins, Star, Gift, Users } from "lucide-react";
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
  const [shouts, setShouts] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msgs = msgsRef.current;
      // shout-outs (subs/raids, 6 min) + questions/tips (4 min), newest first
      const out: AttItem[] = [];
      const sh: ChatMessage[] = [];
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const m = msgs[i];
        if (now - m.ts > 6 * 60000) break;
        if (m.event) {
          if (sh.length < 20) sh.push(m);
          continue;
        }
        if (out.length >= 40 || now - m.ts > 4 * 60000) continue;
        if (isJunk(m.text) || isBot(m.user)) continue;
        if (m.amount && m.amount > 0) out.push({ type: "tip", m });
        else if (isQuestion(m.text)) out.push({ type: "q", m });
      }
      setAttention(out);
      setShouts(sh);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      {/* SHOUT-OUTS — subs / resubs / gifts / raids to thank, before they scroll off */}
      {shouts.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            <Star size={12} /> Shout-outs <span className="text-accent">· {shouts.length}</span>
          </h3>
          <div className="flex flex-col gap-1">
            {shouts.map((m) => {
              const ev = m.event!;
              const Icon = ev.kind === "raid" ? Users : ev.kind === "giftsub" ? Gift : Star;
              return (
                <div key={m.id} className="msg-in flex items-start gap-1.5 rounded-md border border-accent/30 bg-accent/[0.06] px-2 py-1.5">
                  <Icon size={12} className="mt-0.5 shrink-0 text-accent" />
                  <p className="line-clamp-2 text-[12px] leading-snug text-fg/90">{m.text}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

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

import { useEffect, useRef, useState } from "react";
import { HelpCircle, Coins, Star, Gift, Users, X } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { isQuestion, isJunk, isBot } from "../lib/moderation";
import { renderMessageText } from "../lib/renderMessage";
import { usePersisted } from "../hooks/usePersisted";
import { EmptyState } from "./ui";

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`; // muted, theme-tuned (see index.css)
}

type AttItem = { type: "tip" | "q"; m: ChatMessage };

// streamer-set roll-off for shout-outs (UX research: alert durations are short + configurable,
// and a sub should give the streamer time to react). 5m acts as a "keep them up" activity feed.
const SHOUT_OPTS = [15, 30, 60, 300] as const;
const fmtSecs = (s: number) => (s < 60 ? `${s}s` : `${s / 60}m`);

/**
 * The streamer's "answer this now" tab. Two surfaces, each tuned to its job:
 *  - Shout-outs (subs/resubs/gifts/raids): the newest 5 within a streamer-set window (default
 *    30s), held in place while the streamer hovers to read, so nobody scrolls off mid-thank.
 *  - Needs attention (questions + tips): persists for a few minutes (must-act, so it does not
 *    auto-dismiss), cleared with a per-item Done.
 * All derived live from the chat stream; keyless, nothing hardcoded.
 */
export function AttentionDesk({ messages }: { messages: ChatMessage[] }) {
  const msgsRef = useRef(messages);
  msgsRef.current = messages;
  const [attention, setAttention] = useState<AttItem[]>([]);
  const [shouts, setShouts] = useState<ChatMessage[]>([]);
  const [shoutSecs, setShoutSecs] = usePersisted("tape.shoutSecs", 30);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const shoutSecsRef = useRef(shoutSecs);
  shoutSecsRef.current = shoutSecs;
  const dismissedRef = useRef(dismissed);
  dismissedRef.current = dismissed;
  const pausedRef = useRef(false); // freeze the shout-out roll-off while the streamer hovers to read

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const msgs = msgsRef.current;
      const out: AttItem[] = [];
      const sh: ChatMessage[] = [];
      const shoutMs = shoutSecsRef.current * 1000;
      const bound = Math.max(shoutMs, 4 * 60000);
      for (let i = msgs.length - 1; i >= 0; i -= 1) {
        const m = msgs[i];
        const age = now - m.ts;
        if (age > bound) break;
        if (dismissedRef.current.has(m.id)) continue;
        if (m.event) {
          if (age <= shoutMs && sh.length < 5) sh.push(m); // newest 5 within the window
          continue;
        }
        if (out.length >= 40 || age > 4 * 60000) continue;
        if (isJunk(m.text) || isBot(m.user)) continue;
        if (m.amount && m.amount > 0) out.push({ type: "tip", m });
        else if (isQuestion(m.text)) out.push({ type: "q", m });
      }
      setAttention(out);
      if (!pausedRef.current) setShouts(sh); // hovering holds the current list in place
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const dismiss = (id: string) => setDismissed((d) => new Set(d).add(id));

  return (
    <div className="flex flex-col gap-5">
      {/* SHOUT-OUTS — subs / resubs / gifts / raids to thank; newest 5, roll off after the set
          window, held while hovered. */}
      {shouts.length > 0 && (
        <section onMouseEnter={() => (pausedRef.current = true)} onMouseLeave={() => (pausedRef.current = false)}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
              <Star size={12} /> Shout-outs <span className="text-accent">· {shouts.length}</span>
            </h3>
            <div
              className="flex items-center gap-0.5 rounded-md border border-line bg-elevated/40 p-0.5"
              title="how long a shout-out stays up (hover the list to hold it)"
            >
              {SHOUT_OPTS.map((s) => (
                <button
                  key={s}
                  onClick={() => setShoutSecs(s)}
                  aria-label={`Keep shout-outs ${fmtSecs(s)}`}
                  className={`rounded px-1 py-0.5 font-mono text-[9px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    shoutSecs === s ? "bg-accent text-accent-ink" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {fmtSecs(s)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            {shouts.map((m) => {
              const ev = m.event!;
              const Icon = ev.kind === "raid" ? Users : ev.kind === "giftsub" ? Gift : Star;
              return (
                <div key={m.id} className="msg-in group flex items-start gap-1.5 rounded-md border border-accent/30 bg-accent/[0.06] px-2 py-1.5">
                  <Icon size={12} className="mt-0.5 shrink-0 text-accent" />
                  <p className="min-w-0 flex-1 break-words text-[12px] leading-snug text-fg/90">{m.text}</p>
                  <button
                    onClick={() => dismiss(m.id)}
                    aria-label="Dismiss"
                    title="Thanked / dismiss"
                    className="shrink-0 rounded p-0.5 text-fg-muted opacity-0 outline-none transition hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* NEEDS ATTENTION — questions + tips to answer before they scroll off (persistent) */}
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <HelpCircle size={12} /> Needs attention {attention.length > 0 && <span className="text-accent">· {attention.length}</span>}
        </h3>
        <div className="flex flex-col gap-1">
          {attention.length === 0 && (
            <EmptyState size={64}>questions and tips from chat surface here, so you can answer before they scroll off</EmptyState>
          )}
          {attention.map(({ type, m }) => (
            <div key={m.id} className="msg-in group rounded-md border border-line bg-elevated/40 px-2 py-1.5">
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
                  <span className="rounded bg-whale/20 px-1 font-mono text-[10px] font-bold text-whale">+{m.amount}</span>
                ) : null}
                <button
                  onClick={() => dismiss(m.id)}
                  aria-label="Mark done"
                  title="Done"
                  className="ml-auto shrink-0 rounded p-0.5 text-fg-muted opacity-0 outline-none transition hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X size={11} />
                </button>
              </div>
              <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-fg/85">{renderMessageText(m.text)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

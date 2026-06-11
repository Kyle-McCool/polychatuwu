import { useMemo, useState } from "react";
import { ShieldAlert, Copy, Check, X, Repeat } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { classifyRisk, isBot } from "../lib/moderation";
import { renderMessageText } from "../lib/renderMessage";
import { EmptyState } from "./ui";

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`;
}

const REASON_LABEL: Record<string, string> = { slur: "slur", scam: "scam", link: "link", caps: "caps", spam: "spam" };

/**
 * Mod queue — surfaces risky messages (slurs, scams, off-platform links, caps shouting,
 * copypasta) with a severity so the streamer can triage, plus a repeat-offender list.
 * Detection only: copy the @user to ban them on the native platform. Enforcing a ban
 * here would need the streamer's platform login, which we keep out so the tool runs keyless.
 */
export function ModDesk({ messages }: { messages: ChatMessage[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);

  const { flagged, offenders } = useMemo(() => {
    const now = Date.now();
    const out: { m: ChatMessage; level: 1 | 2; reason: string }[] = [];
    const counts = new Map<string, number>();
    for (let i = messages.length - 1; i >= 0 && out.length < 40; i -= 1) {
      const m = messages[i];
      if (now - m.ts > 12 * 60000) break;
      if (isBot(m.user)) continue;
      const f = classifyRisk(m.text);
      if (!f) continue;
      counts.set(m.user, (counts.get(m.user) || 0) + 1);
      if (!dismissed.has(m.id)) out.push({ m, level: f.level, reason: f.reason });
    }
    const offenders = [...counts.entries()]
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { flagged: out.slice(0, 25), offenders };
  }, [messages, dismissed]);

  function copyUser(user: string) {
    const handle = "@" + user.replace(/^@/, "");
    navigator.clipboard?.writeText(handle).then(
      () => {
        setCopied(user);
        setTimeout(() => setCopied(null), 1200);
      },
      () => {},
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <ShieldAlert size={12} /> Needs moderation {flagged.length > 0 && <span className="text-neg">· {flagged.length}</span>}
        </h3>
        {flagged.length === 0 ? (
          <EmptyState size={56}>chat is clean. slurs, scams, spam, and off-platform links get flagged here to triage</EmptyState>
        ) : (
          <div className="flex flex-col gap-1">
            {flagged.map(({ m, level, reason }) => (
              <div
                key={m.id}
                className={`rounded-md border px-2 py-1.5 ${level === 2 ? "border-neg/30 bg-neg/[0.06]" : "border-warn/30 bg-warn/[0.05]"}`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`shrink-0 rounded px-1 font-mono text-[8px] font-bold uppercase tracking-wider ${
                      level === 2 ? "bg-neg/20 text-neg" : "bg-warn/20 text-warn"
                    }`}
                  >
                    {REASON_LABEL[reason] || reason}
                  </span>
                  <span className="truncate font-mono text-[11px] font-semibold" style={{ color: userColor(m.user) }}>
                    {m.user}
                  </span>
                  <button
                    onClick={() => copyUser(m.user)}
                    title="Copy @user to ban on the platform"
                    className="ml-auto shrink-0 rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    {copied === m.user ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                  <button
                    onClick={() => setDismissed((d) => new Set(d).add(m.id))}
                    title="Dismiss"
                    className="shrink-0 rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg/85">{renderMessageText(m.text)}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {offenders.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            <Repeat size={12} /> Repeat offenders
          </h3>
          <div className="flex flex-col gap-1">
            {offenders.map(([user, c]) => (
              <div key={user} className="flex items-center justify-between rounded-md border border-line bg-elevated/40 px-2 py-1.5">
                <span className="truncate font-mono text-[12px] font-semibold" style={{ color: userColor(user) }}>
                  {user}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] font-bold text-neg">{c} flags</span>
                  <button
                    onClick={() => copyUser(user)}
                    title="Copy @user to ban on the platform"
                    className="rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    {copied === user ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="font-mono text-[9px] leading-relaxed text-fg-muted">
        detection only · copy the @user and ban them on Twitch / Kick / X. enforcing a ban from here would need your
        platform login, which we leave out so the app stays keyless.
      </p>
    </div>
  );
}

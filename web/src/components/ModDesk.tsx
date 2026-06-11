import { useMemo, useState } from "react";
import { ShieldAlert, Copy, Check, X, Repeat, Ban, Clock } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { classifyMessage, modCommand, isBot, type ModCategory } from "../lib/moderation";
import { renderMessageText } from "../lib/renderMessage";
import { EmptyState, PlatformIcon } from "./ui";

function userColor(user: string): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`;
}

// severity → row + chip styling (3 critical, 2 review, 1 watch)
const SEV: Record<1 | 2 | 3, { chip: string; row: string }> = {
  3: { chip: "bg-neg/20 text-neg", row: "border-neg/30 bg-neg/[0.06]" },
  2: { chip: "bg-warn/20 text-warn", row: "border-warn/30 bg-warn/[0.05]" },
  1: { chip: "bg-fg/10 text-fg-dim", row: "border-line bg-elevated/30" },
};
const CAT_LABEL: Record<ModCategory, string> = {
  slur: "slur", threat: "threat", "self-harm": "self-harm", doxx: "doxx", scam: "scam",
  harassment: "harassment", link: "link", caps: "caps", spam: "spam",
};

type Flagged = { m: ChatMessage; level: 1 | 2 | 3; category: ModCategory };

/**
 * Mod queue — a context-aware severity classifier surfaces risky messages (slurs, threats,
 * doxxing, self-harm targeting, scams, harassment, spam) graded into three tiers, with a
 * repeat-offender list. Each row offers a one-paste mod action: Timeout/Ban copy the native
 * chat command (/ban, /timeout) the streamer pastes into their own chat — actionable with
 * zero auth, which keeps the whole app keyless. X live chat has no command, so it copies the
 * @handle instead.
 */
export function ModDesk({ messages }: { messages: ChatMessage[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState<string | null>(null);
  const [tier, setTier] = useState<0 | 1 | 2 | 3>(0); // 0 = all

  const { flagged, offenders, counts } = useMemo(() => {
    const now = Date.now();
    const out: Flagged[] = [];
    const off = new Map<string, { platform: ChatMessage["platform"]; count: number; maxLevel: number }>();
    const counts = { 3: 0, 2: 0, 1: 0 };
    for (let i = messages.length - 1; i >= 0 && out.length < 80; i -= 1) {
      const m = messages[i];
      if (now - m.ts > 12 * 60000) break;
      if (isBot(m.user)) continue;
      const f = classifyMessage(m.text);
      if (!f) continue;
      counts[f.level] += 1;
      const o = off.get(m.user) || { platform: m.platform, count: 0, maxLevel: 0 };
      o.count += 1;
      o.maxLevel = Math.max(o.maxLevel, f.level);
      off.set(m.user, o);
      if (!dismissed.has(m.id)) out.push({ m, level: f.level, category: f.category });
    }
    const offenders = [...off.entries()]
      .filter(([, o]) => o.count >= 2)
      .sort((a, b) => b[1].maxLevel - a[1].maxLevel || b[1].count - a[1].count)
      .slice(0, 6);
    return { flagged: out, offenders, counts };
  }, [messages, dismissed]);

  const shown = (tier === 0 ? flagged : flagged.filter((f) => f.level === tier)).slice(0, 30);

  function copy(text: string, key: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(null), 1300);
      },
      () => {},
    );
  }
  // copy a paste-ready mod command (Twitch/Kick), or the @handle where there's no command (X)
  function act(platform: ChatMessage["platform"], user: string, action: "ban" | "timeout", key: string) {
    const cmd = modCommand(platform, user, action);
    copy(cmd ?? "@" + user.replace(/^@/, ""), key);
  }

  const tierBtn = (id: 0 | 1 | 2 | 3, label: string, n?: number) => (
    <button
      onClick={() => setTier(id)}
      className={`flex-1 rounded px-1.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        tier === id ? "bg-accent text-accent-ink shadow-sm" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
      }`}
    >
      {label}
      {n ? <span className={tier === id ? "" : "text-fg-muted"}> {n}</span> : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <ShieldAlert size={12} /> Mod queue {flagged.length > 0 && <span className="text-neg">· {flagged.length}</span>}
        </h3>

        {/* severity filter */}
        <div className="mb-2 flex gap-1 rounded-md border border-line bg-elevated/40 p-0.5">
          {tierBtn(0, "All", flagged.length || undefined)}
          {tierBtn(3, "Critical", counts[3] || undefined)}
          {tierBtn(2, "Review", counts[2] || undefined)}
          {tierBtn(1, "Watch", counts[1] || undefined)}
        </div>

        {shown.length === 0 ? (
          <EmptyState size={56}>
            {flagged.length === 0
              ? "chat is clean. slurs, threats, doxxing, scams, and spam get flagged here to triage"
              : "nothing in this tier"}
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-1">
            {shown.map(({ m, level, category }) => {
              const noCmd = modCommand(m.platform, m.user, "ban") === null; // X / native
              return (
                <div key={m.id} className={`rounded-md border px-2 py-1.5 ${SEV[level].row}`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 rounded px-1 font-mono text-[8px] font-bold uppercase tracking-wider ${SEV[level].chip}`}>
                      {CAT_LABEL[category]}
                    </span>
                    <PlatformIcon platform={m.platform} size={11} />
                    <span className="truncate font-mono text-[11px] font-semibold" style={{ color: userColor(m.user) }}>
                      {m.user}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-0.5">
                      {noCmd ? (
                        <button
                          onClick={() => act(m.platform, m.user, "ban", m.id + "c")}
                          title="Copy @handle (X has no chat mod command)"
                          className="rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          {copied === m.id + "c" ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => act(m.platform, m.user, "timeout", m.id + "t")}
                            title={`Copy ${modCommand(m.platform, m.user, "timeout")} — paste in your chat`}
                            className="rounded p-0.5 text-fg-muted outline-none transition hover:text-warn focus-visible:ring-2 focus-visible:ring-accent/50"
                          >
                            {copied === m.id + "t" ? <Check size={12} /> : <Clock size={12} />}
                          </button>
                          <button
                            onClick={() => act(m.platform, m.user, "ban", m.id + "b")}
                            title={`Copy ${modCommand(m.platform, m.user, "ban")} — paste in your chat`}
                            className="rounded p-0.5 text-fg-muted outline-none transition hover:text-neg focus-visible:ring-2 focus-visible:ring-accent/50"
                          >
                            {copied === m.id + "b" ? <Check size={12} /> : <Ban size={12} />}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setDismissed((d) => new Set(d).add(m.id))}
                        title="Dismiss"
                        className="rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-fg/85">{renderMessageText(m.text)}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {offenders.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
            <Repeat size={12} /> Repeat offenders
          </h3>
          <div className="flex flex-col gap-1">
            {offenders.map(([user, o]) => {
              const noCmd = modCommand(o.platform, user, "ban") === null;
              return (
                <div key={user} className="flex items-center justify-between rounded-md border border-line bg-elevated/40 px-2 py-1.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <PlatformIcon platform={o.platform} size={11} />
                    <span className="truncate font-mono text-[12px] font-semibold" style={{ color: userColor(user) }}>
                      {user}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`font-mono text-[10px] font-bold ${o.maxLevel >= 3 ? "text-neg" : "text-warn"}`}>{o.count} flags</span>
                    <button
                      onClick={() => act(o.platform, user, "ban", "off-" + user)}
                      title={noCmd ? "Copy @handle (X has no chat mod command)" : `Copy ${modCommand(o.platform, user, "ban")} — paste in your chat`}
                      className="flex items-center gap-1 rounded bg-neg/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-neg outline-none transition hover:bg-neg/25 focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      {copied === "off-" + user ? <Check size={11} /> : <Ban size={11} />} Ban
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="font-mono text-[9px] leading-relaxed text-fg-muted">
        Timeout / Ban copy the native chat command for you to paste into your own chat — actionable with no login, so
        the app stays keyless. Detection runs on your device.
      </p>
    </div>
  );
}

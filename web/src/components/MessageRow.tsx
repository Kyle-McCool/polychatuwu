import { memo } from "react";
import { Coins } from "lucide-react";
import type { ChatMessage } from "../lib/types";
import { SRC_META } from "../lib/types";
import { renderMessageText } from "../lib/renderMessage";
import { PlatformIcon } from "./ui";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

// Deterministic MUTED color per username — Market Bubble's frame is cream-on-black
// minimalist, so usernames get a soft hue whisper (still scannable, never neon).
// Platform-provided colors (Twitch's neon picks) are deliberately ignored so one
// loud user can't break the monochrome look.
function userColor(user: string, _provided: string | null): string {
  let h = 0;
  for (let i = 0; i < user.length; i += 1) h = (h * 31 + user.charCodeAt(i)) % 360;
  return `hsl(${h} var(--name-s) var(--name-l))`; // theme-tuned (see index.css)
}

// Username with a hover card showing WHERE the chatter is from (the judges' ask).
function UserChip({ m, name, className }: { m: ChatMessage; name: string; className?: string }) {
  const src = SRC_META[m.platform];
  return (
    <span className={`group/u relative inline-block cursor-default ${className || ""}`} style={{ color: name }} tabIndex={0}>
      {m.user}
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden whitespace-nowrap rounded-md border border-line bg-surface px-2 py-1 shadow-xl group-hover/u:block group-focus/u:block">
        <span className="flex items-center gap-1.5 text-[11px] font-normal">
          <PlatformIcon platform={m.platform} size={12} />
          <span className="text-fg-muted">from</span>
          <span className="font-semibold" style={{ color: src.color }}>
            {src.label}
          </span>
        </span>
      </span>
    </span>
  );
}

export const MessageRow = memo(function MessageRow({ m }: { m: ChatMessage }) {
  const src = SRC_META[m.platform];
  const d = new Date(m.ts);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  const whale = !!m.amount && m.amount > 0;
  const hasTag = !!m.cashtags && m.cashtags.length > 0;
  const name = userColor(m.user, m.color);

  // Host reply (streamer posted from the dashboard) — highlighted; also pops on the overlay
  if (m.host) {
    return (
      <div className="msg-in flash-in my-1 flex items-start gap-2 rounded-md border border-accent/40 bg-accent/[0.08] px-2 py-[6px] leading-snug">
        <span className="mt-0.5 flex w-4 shrink-0 justify-center" title="Host">
          <PlatformIcon platform={m.platform} size={13} />
        </span>
        <div className="min-w-0 flex-1 text-[14px]">
          <span className="mr-1.5 rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-accent-ink">
            Host
          </span>
          <span className="mr-1 font-bold text-fg">{m.user}</span>
          <span className="break-words text-fg">{renderMessageText(m.text)}</span>
        </div>
      </div>
    );
  }

  // Tier 3 — whale / big-money event: promoted to a glowing card
  if (whale) {
    return (
      <div className="msg-in flash-in whale-card my-1.5 flex items-center gap-3 rounded-lg px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-whale/15 text-whale">
          <Coins size={16} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-whale">
              Whale · {src.label}
            </span>
            <span className="font-mono text-[11px] text-fg-muted tabular-nums">{time}</span>
          </div>
          <div className="text-[14px]">
            <UserChip m={m} name={name} className="font-bold" />
            <span className="mx-1.5 rounded bg-whale px-1.5 py-0.5 font-mono text-[12px] font-extrabold text-accent-ink">
              +{m.amount}
            </span>
            <span className="break-words text-fg">{renderMessageText(m.text)}</span>
          </div>
        </div>
      </div>
    );
  }

  // Tier 1/2 — normal line; cashtag hits get a subtle accent wash + gold flash
  return (
    <div
      className={`msg-in lift group flex gap-2 rounded-md px-2 py-[5px] leading-snug hover:translate-x-0.5 hover:bg-elevated/70 ${
        hasTag ? "flash-in bg-accent/[0.06]" : ""
      }`}
      style={{ boxShadow: `inset 3px 0 0 ${src.color}` }}
    >
      <span className="mt-0.5 flex w-4 shrink-0 select-none justify-center" title={src.label}>
        <PlatformIcon platform={m.platform} size={13} />
      </span>
      <div className="min-w-0 flex-1 text-[14px]">
        <span className="mr-2 font-mono text-[11px] tabular-nums text-fg-muted/70">{time}</span>
        <UserChip m={m} name={name} className="font-semibold" />
        <span className="text-fg-muted"> </span>
        <span className="break-words text-fg/90">{renderMessageText(m.text)}</span>
      </div>
    </div>
  );
});

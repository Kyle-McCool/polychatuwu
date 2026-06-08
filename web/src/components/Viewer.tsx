import { useChatSocket } from "../hooks/useChatSocket";
import { WatchPlayer } from "./WatchPlayer";
import { Feed } from "./Feed";
import { PriceTicker } from "./PriceTicker";
import type { Platform } from "../lib/types";

const ALL: Record<Platform, boolean> = { twitch: true, kick: true, x: true, tape: true };

/**
 * Public viewer view (/watch) — just the stream + the shared chat. No cockpit,
 * no overlay controls. This is the link you give viewers so they come watch and
 * chat in one place (drives the "main shared chat" without exposing the studio).
 */
export function Viewer() {
  const sock = useChatSocket();

  return (
    <div className="flex h-full min-h-0 flex-col bg-base text-fg">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-surface/40 px-4 py-2 backdrop-blur-md">
        <span className="flex items-center gap-2.5">
          <img src="/logo-icon.png" alt="" className="h-6 w-auto" />
          <span className="text-[15px] font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
            PolyChatUwU
          </span>
          <span className="ml-1 flex items-center gap-1 font-mono text-[11px] text-pos">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-pos" /> LIVE
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-fg-muted">shared chat · every stream, one room</span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <h1 className="sr-only">PolyChatUwU live stream and shared chat</h1>
        {/* stream */}
        <div className="relative min-h-0 flex-1 bg-black lg:flex-[2]">
          <WatchPlayer channels={sock.channels} active={sock.watch} />
        </div>
        {/* shared chat */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-white/10 lg:max-w-[400px] lg:border-l lg:border-t-0">
          <div className="shrink-0 border-b border-white/8 px-3 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
            Shared chat
          </div>
          <div className="min-h-0 flex-1">
            <Feed messages={sock.messages} enabled={ALL} cleanChat onSend={sock.sendChat} />
          </div>
        </div>
      </main>

      <PriceTicker prices={sock.prices} />
    </div>
  );
}

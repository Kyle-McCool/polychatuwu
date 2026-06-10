import { MessageSquare } from "lucide-react";
import type { SourceStatus } from "../lib/types";
import { PlatformIcon } from "./ui";
import { useStable } from "../hooks/useStable";

// IDE/Bloomberg-style status bar: left = global state, right = context.
export function BottomBar({
  connected,
  statuses,
  count,
}: {
  connected: boolean;
  statuses: SourceStatus[];
  count: number;
}) {
  const stableConnected = useStable(connected); // don't flash red on brief reconnects
  const live = statuses.filter((s) => s.state === "live");
  return (
    <footer className="flex items-center gap-3 border-t border-white/10 bg-base/70 px-3 py-1 font-mono text-[11px] text-fg-muted backdrop-blur-md">
      <span className="flex items-center gap-1.5">
        <span
          className="inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: stableConnected ? "var(--color-pos)" : "var(--color-neg)" }}
        />
        <span className={stableConnected ? "text-pos" : "text-neg"}>
          {stableConnected ? "CONNECTED" : "RECONNECTING"}
        </span>
      </span>

      <span className="text-line-strong">·</span>

      <span className="flex items-center gap-2">
        {live.length === 0 ? (
          <span>no live sources</span>
        ) : (
          live.map((s) => (
            <span key={s.platform + s.channel} className="flex items-center gap-1">
              <PlatformIcon platform={s.platform} size={11} />
              <span className="text-fg-dim">{s.channel}</span>
            </span>
          ))
        )}
      </span>

      <div className="ml-auto flex items-center gap-4">
        <span className="flex items-center gap-1 tabular-nums">
          <MessageSquare size={11} /> {count.toLocaleString()}
        </span>
        <span className="text-fg-muted/60">Market Bubble v0.1</span>
      </div>
    </footer>
  );
}

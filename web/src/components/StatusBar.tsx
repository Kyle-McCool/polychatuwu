import { ExternalLink } from "lucide-react";
import type { SourceStatus } from "../lib/types";
import { channelLabel } from "../lib/parseChannel";
import { PlatformIcon } from "./ui";
import { ThemeToggle } from "./ThemeToggle";
import { useStable } from "../hooks/useStable";
import { usePersisted } from "../hooks/usePersisted";

const DOT: Record<string, string> = {
  live: "var(--color-pos)",
  connecting: "var(--color-warn)",
  error: "var(--color-neg)",
  offline: "var(--color-fg-muted)",
};

// Top toolbar: brand + live status + command affordance + source chips + overlay.
export function StatusBar({
  statuses,
  connected,
}: {
  statuses: SourceStatus[];
  connected: boolean;
}) {
  const stableConnected = useStable(connected);
  // open the SAME overlay the streamer picked in the Overlay tab's "Add to OBS" mode
  const [ownVideo] = usePersisted("tape.obsOwnVideo", false);
  const overlayUrl = `/overlay${ownVideo ? "?novideo" : ""}`;
  return (
    <header className="flex items-center gap-3 border-b border-line bg-base/70 px-3 py-2 backdrop-blur-md">
      <span className="flex items-center gap-1.5 pr-1">
        <img src="/logo-icon.png" alt="" className="h-6 w-auto" />
        <span
          className="text-[15px] font-bold tracking-tight text-fg"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Market Bubble
        </span>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {stableConnected && (
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full"
              style={{ background: "var(--color-pos)", opacity: 0.5 }}
            />
          )}
          <span
            className="relative inline-flex h-2 w-2 rounded-full"
            style={{ background: stableConnected ? "var(--color-pos)" : "var(--color-neg)" }}
          />
        </span>
        <span className="font-mono text-xs text-fg-dim">{stableConnected ? "LIVE" : "OFFLINE"}</span>
      </span>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 md:flex">
          {statuses.map((s) => (
            <span
              key={s.platform + s.channel}
              className="flex items-center gap-1.5 rounded-md border border-line bg-elevated/50 px-2 py-1"
              title={s.detail}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOT[s.state] }} />
              <PlatformIcon platform={s.platform} size={12} />
              <span className="font-mono text-[11px] text-fg-dim">{channelLabel(s.platform, s.channel)}</span>
            </span>
          ))}
        </div>
        <ThemeToggle />
        <a
          href={overlayUrl}
          target="_blank"
          rel="noreferrer"
          title={ownVideo ? "Open overlay (your own video mode)" : "Open overlay (stream in frame)"}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-elevated/80 px-2.5 text-xs font-medium text-fg outline-none transition hover:bg-overlay focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <ExternalLink size={13} /> Overlay
        </a>
      </div>
    </header>
  );
}

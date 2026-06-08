import { type ReactNode } from "react";
import { MonitorPlay } from "lucide-react";
import type { OverlayConfig, OverlayFeature } from "../lib/types";
import { Switch } from "./ui";

const FEATURES: { key: OverlayFeature; label: string }[] = [
  { key: "index", label: "Chat Hype / Mood bar" },
  { key: "candle", label: "Chat candle chart" },
  { key: "market", label: "Crowd vs Market bet" },
  { key: "chat", label: "Live chat" },
  { key: "chatters", label: "Top chatters" },
  { key: "wire", label: "Polymarket wire" },
  { key: "ticker", label: "Polymarket ticker" },
  { key: "reactions", label: "Reactions & GIFs" },
  { key: "audio", label: "Now-playing waveform" },
  { key: "news", label: "Breaking-news toasts" },
];

function Title({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">{children}</h3>
  );
}

/**
 * Streamer-side toggles for which overlay features chat sees. Relays live to the
 * overlay over the WebSocket. (The bet picker that used to live here is now part
 * of the unified CROWD vs MARKET console rendered right below this.)
 */
export function OverlayControls({ config, onChange }: { config: OverlayConfig; onChange: (c: OverlayConfig) => void }) {
  const toggle = (k: OverlayFeature) =>
    onChange({ ...config, features: { ...config.features, [k]: !config.features[k] } });

  return (
    <section>
      <Title>
        <span className="flex items-center gap-1.5">
          <MonitorPlay size={11} /> Overlay: what chat sees
        </span>
      </Title>
      <div className="flex flex-col">
        {FEATURES.map((f) => (
          <div key={f.key} className="flex items-center justify-between rounded-md px-2 py-1.5 transition hover:bg-elevated/50">
            <span className="text-sm text-fg-dim">{f.label}</span>
            <Switch checked={config.features[f.key]} onChange={() => toggle(f.key)} label={f.label} />
          </div>
        ))}
      </div>
    </section>
  );
}

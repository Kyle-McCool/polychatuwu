import { useRef, useState, type ReactNode } from "react";
import { MonitorPlay, Captions } from "lucide-react";
import type { OverlayConfig, OverlayFeature } from "../lib/types";
import { Switch, Input } from "./ui";

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
 * Streamer-side toggles for which overlay features chat sees, plus the broadcast
 * lower-third (a "NOW DISCUSSING" banner + guest name plates). Both relay live to the
 * overlay over the WebSocket via overlayConfig.
 */
export function OverlayControls({ config, onChange }: { config: OverlayConfig; onChange: (c: OverlayConfig) => void }) {
  const toggle = (k: OverlayFeature) =>
    onChange({ ...config, features: { ...config.features, [k]: !config.features[k] } });

  // lower-third inputs — debounced so a keystroke doesn't fire a relay message each time
  const [topic, setTopic] = useState(config.chyron?.topic ?? "");
  const [guestsText, setGuestsText] = useState((config.chyron?.guests ?? []).join(", "));
  const pushTimer = useRef<ReturnType<typeof setTimeout>>();
  const pushChyron = (t: string, g: string) => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const guests = g.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6);
      onChange({ ...config, chyron: { topic: t.slice(0, 120), guests } });
    }, 350);
  };

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

      {/* LOWER THIRD — the broadcast "NOW DISCUSSING" banner + guest name plates */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <Title>
          <span className="flex items-center gap-1.5">
            <Captions size={11} /> Lower third
          </span>
        </Title>
        <div className="flex items-center justify-between rounded-md px-2 py-1.5">
          <span className="text-sm text-fg-dim">Show banner on overlay</span>
          <Switch checked={config.features.lowerThird} onChange={() => toggle("lowerThird")} label="Lower third banner" />
        </div>
        <div className="mt-1.5 flex flex-col gap-1.5 px-1">
          <Input
            value={topic}
            onChange={(e) => {
              setTopic(e.target.value);
              pushChyron(e.target.value, guestsText);
            }}
            placeholder="Now discussing… e.g. Will ETH flip $4k?"
            maxLength={120}
            aria-label="Lower third topic"
            className="w-full"
          />
          <Input
            value={guestsText}
            onChange={(e) => {
              setGuestsText(e.target.value);
              pushChyron(topic, e.target.value);
            }}
            placeholder="Guests, comma separated (Ansem, Banks)"
            aria-label="Lower third guests"
            className="w-full"
          />
        </div>
        <p className="mt-1 px-1 font-mono text-[9px] leading-relaxed text-fg-muted">
          a serif broadcast banner over your stream. flip the toggle on to show it.
        </p>
      </div>
    </section>
  );
}

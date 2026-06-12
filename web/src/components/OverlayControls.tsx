import { useRef, useState, type ReactNode } from "react";
import { MonitorPlay, Captions, Tv, Copy, Check, ExternalLink } from "lucide-react";
import type { OverlayConfig, OverlayFeature } from "../lib/types";
import { usePersisted } from "../hooks/usePersisted";
import { Switch, Input, Button } from "./ui";

const FEATURES: { key: OverlayFeature; label: string }[] = [
  { key: "index", label: "Chat Hype / Mood bar" },
  { key: "candle", label: "Chat candle chart" },
  { key: "market", label: "Crowd vs Market bet" },
  { key: "scoreboard", label: "Crowd vs Market record" },
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
 * Add-to-OBS helper: pick how the video works (composite your own game/cam, or show a connected
 * stream in the frame), copy the right overlay URL for an OBS Browser source, and follow 3 steps.
 * The overlay is read-only, so the plain URL works with no key.
 */
function ObsSetup() {
  const [ownVideo, setOwnVideo] = usePersisted("tape.obsOwnVideo", false);
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/overlay${ownVideo ? "?novideo" : ""}`;
  function copy() {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  }
  const steps: ReactNode[] = [
    <>In OBS, add a <span className="text-fg">Browser</span> source and paste the URL above.</>,
    <>
      In its properties, set <span className="text-fg">Width</span> and <span className="text-fg">Height</span> to match
      {" "}your canvas (usually <span className="text-fg">1920 × 1080</span>). It scales to fit any size.
    </>,
    <>Leave the background transparent and place it over your scene.</>,
  ];
  return (
    <div className="mb-4 rounded-lg border border-line bg-elevated/30 p-3">
      <Title>
        <span className="flex items-center gap-1.5">
          <Tv size={11} /> Add to OBS
        </span>
      </Title>

      <div className="flex flex-col gap-1">
        {[
          { own: false, label: "Show a stream in the frame", desc: "the connected stream shows inside the frame" },
          { own: true, label: "I stream my own video", desc: "transparent center, widgets float over your OBS scene" },
        ].map((o) => {
          const active = ownVideo === o.own;
          return (
            <button
              key={String(o.own)}
              onClick={() => setOwnVideo(o.own)}
              className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
                active ? "border-accent/50 bg-accent/[0.08]" : "border-line bg-elevated/40 hover:bg-elevated"
              }`}
            >
              <span
                className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                  active ? "border-accent bg-accent" : "border-fg-muted"
                }`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-accent-ink" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-fg">{o.label}</span>
                <span className="block font-mono text-[9px] leading-snug text-fg-muted">{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-base/60 px-2 py-1.5 font-mono text-[11px] text-fg-dim">{url}</code>
        <Button variant="primary" size="sm" onClick={copy} icon={copied ? <Check size={13} /> : <Copy size={13} />}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <ol className="mt-2.5 flex flex-col gap-1 px-0.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-fg-muted">
            <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[8px] font-bold text-accent">
              {i + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <ExternalLink size={11} /> preview the overlay
      </a>
    </div>
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
      <ObsSetup />

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
      <div className="mt-4 border-t border-line pt-3">
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

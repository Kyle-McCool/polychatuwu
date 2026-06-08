import { useEffect, useState, type ComponentType } from "react";
import {
  Volume2,
  VolumeX,
  Music,
  Megaphone,
  Drum,
  Coins,
  Trophy,
  Hand,
  Siren,
  Frown,
  Bell,
  Rocket,
  TrendingDown,
  Hammer,
  PartyPopper,
  type LucideProps,
} from "lucide-react";
import { playSound, setVolume, type SoundName } from "../lib/sfx";
import { usePersisted } from "../hooks/usePersisted";

const PADS: { name: SoundName; label: string; Icon: ComponentType<LucideProps> }[] = [
  { name: "airhorn", label: "Airhorn", Icon: Megaphone },
  { name: "drumroll", label: "Drumroll", Icon: Drum },
  { name: "kaching", label: "Ka-ching", Icon: Coins },
  { name: "fanfare", label: "Win!", Icon: Trophy },
  { name: "applause", label: "Applause", Icon: Hand },
  { name: "siren", label: "Siren", Icon: Siren },
  { name: "trombone", label: "Sad", Icon: Frown },
  { name: "ding", label: "Ding", Icon: Bell },
  { name: "pump", label: "Pump", Icon: Rocket },
  { name: "dump", label: "Dump", Icon: TrendingDown },
  { name: "bonk", label: "Bonk", Icon: Hammer },
  { name: "success", label: "Nice!", Icon: PartyPopper },
];

/**
 * Streamer soundboard — clickable pads that play real SFX through the browser
 * (captured by OBS desktop audio so the stream hears them). Files are self-hosted
 * and license-clean; volume + mute persist across reloads.
 */
export function Soundboard({ onPlay }: { onPlay?: (s: SoundName) => void }) {
  const [vol, setVol] = usePersisted<number>("tape.sfxVol", 0.6);
  const [muted, setMuted] = usePersisted<boolean>("tape.sfxMuted", false);
  const [hit, setHit] = useState<SoundName | null>(null);

  useEffect(() => {
    setVolume(muted ? 0 : vol);
  }, [vol, muted]);

  function fire(name: SoundName) {
    playSound(name);
    onPlay?.(name); // broadcast a visual reaction to the overlay (and cockpit)
    setHit(name);
    setTimeout(() => setHit((h) => (h === name ? null : h)), 180);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-fg-muted">
          <Music size={12} /> Soundboard
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute soundboard" : "Mute soundboard"}
            title={muted ? "Unmute" : "Mute"}
            className="rounded p-0.5 text-fg-muted outline-none transition hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={vol}
            onChange={(e) => {
              setVol(Number(e.target.value));
              if (muted) setMuted(false);
            }}
            aria-label="Soundboard volume"
            className="h-1 w-16 cursor-pointer accent-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {PADS.map((p) => (
          <button
            key={p.name}
            onClick={() => fire(p.name)}
            aria-label={`Play ${p.label}`}
            className={`flex flex-col items-center justify-center gap-1 rounded-lg border py-2.5 outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
              hit === p.name
                ? "scale-95 border-accent bg-accent/20 text-accent"
                : "border-white/8 bg-elevated/50 text-fg-dim hover:border-accent/40 hover:bg-elevated hover:text-fg"
            } ${muted ? "opacity-50" : ""}`}
          >
            <p.Icon size={18} strokeWidth={1.75} />
            <span className="font-mono text-[10px]">{p.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 px-1 font-mono text-[9px] leading-relaxed text-fg-muted">
        plays through your browser, OBS captures it as desktop audio so chat hears it too
      </p>
    </section>
  );
}

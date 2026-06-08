import { memo, useEffect, useRef, useState } from "react";
import type { Reaction } from "../lib/types";

// each soundboard pad → the emoji that floats up when it's fired
const EMOJI: Record<string, string> = {
  applause: "👏",
  airhorn: "📣",
  drumroll: "🥁",
  kaching: "💰",
  fanfare: "🏆",
  siren: "🚨",
  trombone: "😭",
  ding: "🔔",
  pump: "🚀",
  dump: "📉",
  bonk: "💥",
  success: "🎉",
};

type Particle = {
  key: string;
  emoji: string;
  left: number;
  size: number;
  dur: number;
  drift: number;
  spin: number;
  delay: number;
};

type ActiveGif = { key: string; url: string; left: number; top: number };

/**
 * Each particle/gif drives its own animation via the Web Animations API in a
 * memoized component. This is deliberate: the overlay re-renders constantly as
 * chat flows, and a CSS-class animation on a re-rendered element keeps restarting
 * (stuck at frame 0). A WAAPI animation started once in useEffect is immune to that.
 */
const Float = memo(function Float({ p }: { p: Particle }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = el.animate(
      [
        { transform: "translateY(0) translateX(0) scale(0.5) rotate(0deg)", opacity: 0 },
        { transform: "translateY(-8vh) scale(1)", opacity: 1, offset: 0.12 },
        { transform: `translateY(-82vh) translateX(${p.drift}px) scale(1) rotate(${p.spin}deg)`, opacity: 0 },
      ],
      { duration: p.dur * 1000, delay: p.delay * 1000, easing: "cubic-bezier(0.22,0.61,0.36,1)", fill: "forwards" },
    );
    return () => a.cancel();
  }, [p]);
  return (
    <span
      ref={ref}
      className="absolute bottom-0 select-none leading-none"
      style={{ left: `${p.left}vw`, fontSize: p.size, opacity: 0, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.55))" }}
    >
      {p.emoji}
    </span>
  );
});

const GifPlay = memo(function GifPlay({ g }: { g: ActiveGif }) {
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = el.animate(
      [
        { opacity: 0, transform: "translate(-50%,-50%) scale(0.85)" },
        { opacity: 0.62, transform: "translate(-50%,-50%) scale(1)", offset: 0.07 },
        { opacity: 0.62, transform: "translate(-50%,-50%) scale(1)", offset: 0.86 },
        { opacity: 0, transform: "translate(-50%,-50%) scale(1.03)" },
      ],
      { duration: 6000, easing: "ease-in-out", fill: "forwards" },
    );
    return () => a.cancel();
  }, [g]);
  return (
    <img
      ref={ref}
      src={g.url}
      alt=""
      className="absolute max-h-[45vh] max-w-[45vw] rounded-2xl object-contain shadow-2xl"
      style={{ left: `${g.left}%`, top: `${g.top}%`, opacity: 0 }}
    />
  );
});

/**
 * Floating reactions over the stream. Subscribes to ws reactions and either:
 *  - bursts Google-Meet-style emojis (soundboard pads), shown on overlay + cockpit, or
 *  - plays a semi-transparent GIF over the stream (gifs=true → overlay only).
 * Full-screen, pointer-events-none, so it never blocks the UI underneath.
 */
export function Reactions({
  onReaction,
  count = 16,
  gifs = false,
}: {
  onReaction: (cb: (r: Reaction) => void) => () => void;
  count?: number;
  gifs?: boolean;
}) {
  const [parts, setParts] = useState<Particle[]>([]);
  const [activeGifs, setActiveGifs] = useState<ActiveGif[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    return onReaction((r) => {
      if (r.gif) {
        if (!gifs) return; // GIFs only render where enabled (the overlay)
        const key = `${r.id}-g${seq.current++}`;
        const left = 50 + (Math.random() - 0.5) * 22;
        const top = 47 + (Math.random() - 0.5) * 18;
        setActiveGifs((g) => [...g.slice(-2), { key, url: r.gif as string, left, top }]);
        setTimeout(() => setActiveGifs((g) => g.filter((x) => x.key !== key)), 6300);
        return;
      }
      if (r.sound) {
        const emoji = EMOJI[r.sound] || "✨";
        const burst: Particle[] = [];
        for (let i = 0; i < count; i += 1) {
          burst.push({
            key: `${r.id}-${seq.current++}`,
            emoji,
            left: 3 + Math.random() * 94,
            size: 26 + Math.random() * 30,
            dur: 2.4 + Math.random() * 1.6,
            drift: (Math.random() - 0.5) * 170,
            spin: (Math.random() - 0.5) * 60,
            delay: Math.random() * 0.5,
          });
        }
        setParts((p) => [...p, ...burst]);
        const ids = new Set(burst.map((b) => b.key));
        setTimeout(() => setParts((p) => p.filter((x) => !ids.has(x.key))), 4800);
      }
    });
  }, [onReaction, count, gifs]);

  if (!parts.length && !activeGifs.length) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {activeGifs.map((g) => (
        <GifPlay key={g.key} g={g} />
      ))}
      {parts.map((p) => (
        <Float key={p.key} p={p} />
      ))}
    </div>
  );
}

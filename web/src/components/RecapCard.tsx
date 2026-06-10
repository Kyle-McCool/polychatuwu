import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Copy, Check, X } from "lucide-react";
import { PM_BLUE } from "../lib/polymarket";
import { hypeSeries, classify, AFFECT_META, type Affect } from "../lib/hype";
import { isBot } from "../lib/moderation";
import type { ChatMessage, Platform } from "../lib/types";

// brand: monochrome SaaS black + off-white; chat = off-white, market = Polymarket blue
const ACCENT = "#ECE9E2";
const W = 1200;
const H = 675;

const mascotImg: HTMLImageElement | null = typeof Image !== "undefined" ? new Image() : null;
if (mascotImg) mascotImg.src = "/mascot.png";

type Recap = {
  totalMsgs: number;
  uniqueChatters: number;
  durationMs: number;
  split: { platform: Platform; pct: number }[];
  topChatter: { user: string; count: number } | null;
  record: { resolved: number; chatWins: number; marketWins: number; winRate: number | null };
  peak: { affect: Affect; score: number; clockLabel: string; text: string; user: string } | null;
};

const PLAT_LABEL: Record<string, string> = { twitch: "TW", kick: "KICK", x: "X", tape: "TAPE" };

function fmtDur(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function buildRecap(messages: ChatMessage[]): Recap {
  const real = messages.filter((m) => !isBot(m.user));
  const users = new Map<string, number>();
  const plat = new Map<Platform, number>();
  let minTs = Infinity;
  let maxTs = 0;
  for (const m of real) {
    users.set(m.user, (users.get(m.user) || 0) + 1);
    plat.set(m.platform, (plat.get(m.platform) || 0) + 1);
    if (m.ts < minTs) minTs = m.ts;
    if (m.ts > maxTs) maxTs = m.ts;
  }
  const platTotal = [...plat.values()].reduce((a, b) => a + b, 0) || 1;
  const split = [...plat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([platform, c]) => ({ platform, pct: Math.round((c / platTotal) * 100) }));
  const top = [...users.entries()].sort((a, b) => b[1] - a[1])[0];

  // persisted Crowd vs Market scoreboard (the signature stat)
  let record: Recap["record"] = { resolved: 0, chatWins: 0, marketWins: 0, winRate: null };
  try {
    const raw = JSON.parse(localStorage.getItem("tape.crowdRecord") || "[]") as { led: boolean }[];
    const resolved = raw.length;
    const chatWins = raw.filter((r) => r.led).length;
    record = {
      resolved,
      chatWins,
      marketWins: resolved - chatWins,
      winRate: resolved ? Math.round((chatWins / resolved) * 100) : null,
    };
  } catch {
    /* no record yet */
  }

  // peak hype moment over the session buffer
  let peak: Recap["peak"] = null;
  if (real.length && maxTs > minTs) {
    const fromSec = Math.floor(minTs / 1000);
    const toSec = Math.floor(maxTs / 1000);
    const series = hypeSeries(messages, fromSec, toSec, fromSec);
    let best = series[0];
    for (const p of series) if (p.score > (best?.score ?? -1)) best = p;
    if (best) {
      // a representative line near the peak second (most affect-bearing, non-bot)
      const near = real.filter((m) => Math.abs(Math.floor(m.ts / 1000) - best.sec) <= 2);
      near.sort((a, b) => classify(b.text).emoteWeight - classify(a.text).emoteWeight || b.text.length - a.text.length);
      const sample = near[0];
      if (sample) {
        const d = new Date(best.sec * 1000);
        peak = {
          affect: best.affect,
          score: Math.round(best.score),
          clockLabel: d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          text: sample.text,
          user: sample.user,
        };
      }
    }
  }

  return {
    totalMsgs: real.length,
    uniqueChatters: users.size,
    durationMs: maxTs > minTs ? maxTs - minTs : 0,
    split,
    topChatter: top ? { user: top[0], count: top[1] } : null,
    record,
    peak,
  };
}

function ellip(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}

/**
 * Auto-generated STREAM RECAP card — the post-stream artifact built to spread on X.
 * Pulls the night's signature stats: the Crowd-vs-Market record, the peak hype moment
 * (with the line that set chat off), and the session totals. Canvas-rendered from only
 * same-origin assets so the PNG export never taints. Fully keyless.
 */
export function RecapCard({ messages, channel, onClose }: { messages: ChatMessage[]; channel: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const recap = useMemo(() => buildRecap(messages), [messages]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const render = () => {
      try {
        canvas.width = W;
        canvas.height = H;

        // bg — neutral SaaS black, zero blue tint
        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0, "#121212");
        g.addColorStop(1, "#0a0a0a");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = `${PM_BLUE}55`;
        ctx.lineWidth = 3;
        ctx.strokeRect(14, 14, W - 28, H - 28);

        // header
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "left";
        ctx.font = "700 30px 'Inter', sans-serif";
        ctx.fillStyle = "#f1efe9";
        ctx.fillText("Market Bubble", 112, 74);
        ctx.textAlign = "right";
        ctx.font = "700 22px 'Inter', sans-serif";
        ctx.fillStyle = PM_BLUE;
        ctx.fillText("◆ STREAM RECAP", W - 56, 72);

        ctx.textAlign = "left";
        ctx.font = "700 15px 'Inter', sans-serif";
        ctx.fillStyle = "#888379";
        const who = channel ? `@${channel.replace(/^@/, "")}` : "live chat";
        const dur = recap.durationMs ? ` · ${fmtDur(recap.durationMs)} live` : "";
        ctx.fillText(`${who.toUpperCase()}${dur}`, 56, 108);

        // HERO — Crowd vs Market record
        ctx.font = "700 16px 'Inter', sans-serif";
        ctx.fillStyle = "#888379";
        ctx.fillText("CHAT  vs  MARKET", 56, 168);

        if (recap.record.resolved > 0) {
          ctx.textBaseline = "alphabetic";
          ctx.font = "800 84px 'Inter', sans-serif";
          ctx.textAlign = "left";
          ctx.fillStyle = ACCENT;
          ctx.fillText(`CHAT ${recap.record.chatWins}`, 56, 256);
          const chatW = ctx.measureText(`CHAT ${recap.record.chatWins}`).width;
          ctx.fillStyle = "#5b574f";
          ctx.fillText("—", 56 + chatW + 28, 256);
          const dashW = ctx.measureText("—").width;
          ctx.fillStyle = PM_BLUE;
          ctx.fillText(`${recap.record.marketWins} MARKET`, 56 + chatW + 28 + dashW + 28, 256);

          ctx.font = "600 24px 'Inter', sans-serif";
          ctx.fillStyle = "#b3afa4";
          ctx.fillText(
            `chat led the market ${recap.record.winRate}% of ${recap.record.resolved} resolved calls`,
            56,
            300,
          );
        } else {
          ctx.font = "700 40px 'Inter', sans-serif";
          ctx.fillStyle = ACCENT;
          ctx.fillText("chat is a market", 56, 244);
          ctx.font = "600 22px 'Inter', sans-serif";
          ctx.fillStyle = "#888379";
          ctx.fillText("pin a Polymarket bet next stream to start the record", 56, 286);
        }

        // PEAK HYPE moment
        const py = 380;
        ctx.font = "700 16px 'Inter', sans-serif";
        ctx.fillStyle = "#888379";
        ctx.fillText("PEAK HYPE", 56, py);
        if (recap.peak) {
          const meta = AFFECT_META[recap.peak.affect];
          // affect chip
          ctx.font = "800 15px 'Inter', sans-serif";
          const chipText = meta.label.toUpperCase();
          const cw = ctx.measureText(chipText).width;
          ctx.fillStyle = `${meta.color}33`;
          ctx.beginPath();
          ctx.roundRect(160, py - 17, cw + 24, 24, 6);
          ctx.fill();
          ctx.fillStyle = meta.color;
          ctx.fillText(chipText, 172, py);
          ctx.fillStyle = "#888379";
          ctx.font = "600 15px 'Inter', sans-serif";
          ctx.fillText(`${recap.peak.clockLabel} · hype ${recap.peak.score}`, 160 + cw + 40, py);

          ctx.font = "600 34px 'Inter', sans-serif";
          ctx.fillStyle = "#f1efe9";
          const quote = ellip(ctx, `“${recap.peak.text.trim()}”`, W - 112);
          ctx.fillText(quote, 56, py + 56);
          ctx.font = "600 20px 'Inter', sans-serif";
          ctx.fillStyle = meta.color;
          ctx.fillText(`— @${recap.peak.user.replace(/^@/, "")}`, 56, py + 92);
        } else {
          ctx.font = "600 28px 'Inter', sans-serif";
          ctx.fillStyle = "#5b574f";
          ctx.fillText("not enough chat yet", 56, py + 46);
        }

        // STATS strip
        const sy = H - 96;
        ctx.strokeStyle = "rgba(255,255,255,0.10)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(56, sy - 30);
        ctx.lineTo(W - 56, sy - 30);
        ctx.stroke();

        ctx.font = "700 22px 'Inter', sans-serif";
        ctx.fillStyle = "#f1efe9";
        ctx.textAlign = "left";
        const parts: string[] = [
          `${recap.totalMsgs.toLocaleString()} messages`,
          `${recap.uniqueChatters.toLocaleString()} chatters`,
        ];
        if (recap.topChatter) parts.push(`top @${recap.topChatter.user.replace(/^@/, "")} (${recap.topChatter.count})`);
        if (recap.split.length) parts.push(recap.split.map((s) => `${PLAT_LABEL[s.platform] || s.platform} ${s.pct}%`).join(" / "));
        ctx.fillText(ellip(ctx, parts.join("   ·   "), W - 112), 56, sy);

        // footer brand line
        ctx.font = "600 22px 'Inter', sans-serif";
        ctx.fillStyle = "#b3afa4";
        ctx.fillText("unified chat · prediction-market terminal", 56, H - 40);
        ctx.textAlign = "right";
        ctx.fillStyle = ACCENT;
        ctx.fillText("Market Bubble", W - 56, H - 40);

        // mascot lockup, top-left (same-origin → export never taints)
        if (mascotImg && mascotImg.complete && mascotImg.naturalWidth) {
          ctx.drawImage(mascotImg, 46, 36, 52, 52);
        }
      } catch {
        /* older browsers may lack roundRect etc. — fail soft */
      }
    };
    render();
    if (mascotImg && !mascotImg.complete) {
      mascotImg.addEventListener("load", render, { once: true });
      return () => mascotImg.removeEventListener("load", render);
    }
  }, [recap, channel]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `market-bubble-recap-${Date.now()}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  }
  async function copy() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      download();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-fg-muted">Tonight's recap</span>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-fg-muted transition hover:text-fg">
            <X size={16} />
          </button>
        </div>
        <canvas ref={canvasRef} className="w-full rounded-lg border border-white/10" />
        <div className="mt-3 flex gap-2">
          <button
            onClick={download}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2 text-sm font-bold text-accent-ink outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Download size={15} /> Download PNG
          </button>
          <button
            onClick={copy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/15 py-2 text-sm font-semibold text-fg outline-none transition hover:bg-elevated focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied!" : "Copy image"}
          </button>
        </div>
      </div>
    </div>
  );
}

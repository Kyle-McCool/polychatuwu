import { useEffect, useRef, useState } from "react";
import { Download, Copy, Check, X } from "lucide-react";
import { PM_BLUE } from "../lib/polymarket";

export type ShareMoment = {
  channel: string;
  label: string;
  chatPct: number;
  marketPct: number;
  led: boolean | null;
};

// brand: monochrome SaaS black + off-white; chat = off-white, market = Polymarket blue
const ACCENT = "#ECE9E2";
const W = 1200;
const H = 675;

// preloaded once; same-origin so drawing it onto the canvas never taints the export
const mascotImg: HTMLImageElement | null = typeof Image !== "undefined" ? new Image() : null;
if (mascotImg) mascotImg.src = "/mascot.png";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/**
 * Auto-generated "CHAT vs MARKET" card — the shareable artifact built to spread
 * on X. Canvas-rendered with only same-origin assets (so export never taints),
 * one tap to download or copy a screenshot-ready PNG.
 */
export function ShareCard({ moment, onClose }: { moment: ShareMoment; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const render = () => {
    try {
    canvas.width = W;
    canvas.height = H;

    const spread = moment.chatPct - moment.marketPct;

    // bg — neutral SaaS black, zero blue tint
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#121212");
    g.addColorStop(1, "#0a0a0a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // accent frame
    ctx.strokeStyle = `${PM_BLUE}55`;
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, W - 28, H - 28);

    // header
    ctx.textBaseline = "alphabetic";
    ctx.font = "700 30px 'Inter', sans-serif";
    ctx.fillStyle = "#f1efe9";
    ctx.textAlign = "left";
    ctx.fillText("Market Bubble", 112, 74);
    ctx.font = "700 22px 'Inter', sans-serif";
    ctx.fillStyle = PM_BLUE;
    ctx.textAlign = "right";
    ctx.fillText("◆ POLYMARKET", W - 56, 72);

    ctx.font = "700 15px 'Inter', sans-serif";
    ctx.fillStyle = "#888379";
    ctx.textAlign = "left";
    ctx.fillText("CROWD  vs  MARKET", 56, 110);

    // question
    ctx.font = "600 38px 'Inter', sans-serif";
    ctx.fillStyle = "#f1efe9";
    const lines = wrap(ctx, moment.label || "Will it happen?", W - 112);
    lines.forEach((ln, i) => ctx.fillText(ln, 56, 168 + i * 48));

    // bars
    const barX = 56;
    const barW = W - 112;
    const drawRow = (y: number, label: string, pct: number, color: string) => {
      ctx.font = "800 26px 'Inter', sans-serif";
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.fillText(label, barX, y - 14);
      ctx.font = "800 26px 'Inter', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(`${pct}% YES`, barX + barW, y - 14);
      // track
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.roundRect(barX, y, barW, 22, 11);
      ctx.fill();
      // fill
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(barX, y, Math.max(22, (barW * pct) / 100), 22, 11);
      ctx.fill();
    };
    const baseY = lines.length >= 3 ? 360 : 340;
    drawRow(baseY, "CHAT", moment.chatPct, ACCENT);
    drawRow(baseY + 90, "MARKET", moment.marketPct, PM_BLUE);

    // headline
    ctx.textAlign = "center";
    ctx.font = "800 50px 'Inter', sans-serif";
    if (moment.led === true) {
      ctx.fillStyle = "#2FD39E";
      ctx.fillText("THE MARKET MOVED CHAT'S WAY", W / 2, baseY + 210);
    } else {
      const ahead = spread >= 0;
      ctx.fillStyle = ahead ? ACCENT : PM_BLUE;
      ctx.fillText(
        `CHAT IS ${Math.abs(spread)} PTS ${ahead ? "AHEAD OF" : "BEHIND"} THE MARKET`,
        W / 2,
        baseY + 210,
      );
    }

    // footer
    ctx.font = "600 22px 'Inter', sans-serif";
    ctx.fillStyle = "#b3afa4";
    ctx.textAlign = "left";
    const who = moment.channel ? `@${moment.channel.replace(/^@/, "")}` : "live chat";
    ctx.fillText(`${who} · chat is a market`, 56, H - 44);
    ctx.textAlign = "right";
    ctx.fillStyle = ACCENT;
    ctx.fillText("Market Bubble", W - 56, H - 44);

    // mascot brand lockup, top-left (same-origin image → export never taints)
    if (mascotImg && mascotImg.complete && mascotImg.naturalWidth) {
      ctx.drawImage(mascotImg, 46, 36, 52, 52);
    }
    } catch {
      /* older browsers may lack canvas roundRect etc. — fail soft */
    }
    };
    render();
    // if the mascot wasn't cached yet, redraw once it loads so the card includes it
    if (mascotImg && !mascotImg.complete) {
      mascotImg.addEventListener("load", render, { once: true });
      return () => mascotImg.removeEventListener("load", render);
    }
  }, [moment]);

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `chat-vs-market-${Date.now()}.png`;
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
      download(); // fallback if clipboard image write is unsupported
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-xs uppercase tracking-wider text-fg-muted">Share this moment</span>
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

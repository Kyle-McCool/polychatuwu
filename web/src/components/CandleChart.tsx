import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/types";
import { hypeSeries, type Affect } from "../lib/hype";

const UP = "#2FD39E";
const DOWN = "#F0616D";
const GOLD = "#F2B33C";

type C = { t: number; o: number; h: number; l: number; c: number; v: number; clip: boolean; synth: boolean; affect: Affect };

// Chat-hype candles = honest OHLC of the real multi-signal hype score (0..100) over
// each bucket: Open = score at bucket start, High/Low = max/min in the bucket,
// Close = score at end, Volume = messages. So the wicks/bodies encode genuine
// signal movement (not synthetic price). CLIP IT marks buckets where the
// multi-signal detector fired. Warm-up (pre-data) buckets render dim.
function buildCandles(messages: ChatMessage[], bucketSec: number): C[] {
  const nowSec = Math.floor(Date.now() / 1000);
  const cur = nowSec - (nowSec % bucketSec);
  const WINDOW = 34;
  const startBucket = cur - (WINDOW - 1) * bucketSec;

  let earliest = Infinity;
  for (const m of messages) {
    const s = Math.floor(m.ts / 1000);
    if (s < earliest) earliest = s;
  }
  const realStart = earliest === Infinity ? nowSec + 1 : Math.max(startBucket, earliest);

  const series = hypeSeries(messages, startBucket, cur, realStart);
  const bySec = new Map(series.map((p) => [p.sec, p]));

  const out: C[] = [];
  for (let b = startBucket; b <= cur; b += bucketSec) {
    let o = -1;
    let h = -Infinity;
    let l = Infinity;
    let c = 2;
    let v = 0;
    let clip = false;
    let allSynth = true;
    const aff: Record<Affect, number> = { funny: 0, hype: 0, rekt: 0, shock: 0, rage: 0, neutral: 0 };
    const end = Math.min(b + bucketSec, nowSec + 1);
    for (let s = b; s < end; s += 1) {
      const p = bySec.get(s);
      if (!p) continue;
      if (o < 0) o = p.score;
      h = Math.max(h, p.score);
      l = Math.min(l, p.score);
      c = p.score;
      v += p.rate;
      if (p.fired) clip = true;
      if (s >= realStart) allSynth = false;
      aff[p.affect] += 1;
    }
    if (o < 0) {
      o = h = l = c = 2;
    }
    let affect: Affect = "neutral";
    let best = 0;
    for (const k of ["funny", "hype", "rekt", "shock", "rage"] as Affect[]) if (aff[k] > best) { best = aff[k]; affect = k; }
    out.push({ t: b, o, h, l, c, v, clip, synth: allSynth, affect });
  }
  return out;
}

export function CandleChart({ messages, bucketSec = 60, compact = false }: { messages: ChatMessage[]; bucketSec?: number; compact?: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const msgsRef = useRef(messages);
  msgsRef.current = messages;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let disposed = false;

    const draw = () => {
      if (disposed) return;
      const dpr = window.devicePixelRatio || 1;
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      // skip transient / blown-out measurements so the canvas never bakes in a huge size
      if (W < 1 || H < 1 || W > 4000) return;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const candles = buildCandles(msgsRef.current, bucketSec);
      if (!candles.length) return;

      const padR = compact ? 2 : 48;
      const padT = compact ? 3 : 10;
      const padB = compact ? 3 : 18;
      const volH = compact ? 0 : (H - padT - padB) * 0.18;
      const candH = H - padT - padB - volH - 6;
      const candW = W - padR - 6;
      const x0 = 4;
      const n = candles.length;
      const slot = candW / Math.max(n, 1);
      const bodyW = Math.max(2.5, Math.min(slot * 0.64, 14));

      let pMax = -Infinity;
      let pMin = Infinity;
      let vMax = 0;
      for (const k of candles) {
        pMax = Math.max(pMax, k.h);
        pMin = Math.min(pMin, k.l);
        vMax = Math.max(vMax, k.v);
      }
      if (pMax === pMin) {
        pMax += 1;
        pMin = Math.max(0, pMin - 1);
      }
      const pad = (pMax - pMin) * 0.12;
      pMax += pad;
      pMin = Math.max(0, pMin - pad);
      const yOf = (val: number) => padT + (1 - (val - pMin) / (pMax - pMin)) * candH;

      // grid + price axis (hidden in compact so it reads as a clean sparkline strip)
      ctx.font = "10px 'Inter', sans-serif";
      ctx.textBaseline = "middle";
      if (!compact)
        for (let i = 0; i <= 4; i += 1) {
          const val = pMin + ((pMax - pMin) * i) / 4;
          const y = yOf(val);
          ctx.strokeStyle = "rgba(255,255,255,0.04)";
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W - padR, y);
          ctx.stroke();
          ctx.fillStyle = "#8b95a3";
          ctx.textAlign = "left";
          ctx.fillText(val.toFixed(0), W - padR + 6, y);
        }

      // candles + volume + clip markers. Warm-up (synthetic) candles render
      // dim + hollow + greyed so they're visibly NOT real market data; the live
      // region is solid colour, separated by a "● LIVE" divider.
      let firstReal = -1;
      let lastClip = -1;
      for (let i = n - 1; i >= 0; i -= 1) {
        if (candles[i].clip && !candles[i].synth) {
          lastClip = i;
          break;
        }
      }
      for (let i = 0; i < n; i += 1) {
        const k = candles[i];
        if (firstReal < 0 && !k.synth) firstReal = i;
        const cx = x0 + i * slot + slot / 2;
        const up = k.c >= k.o;
        const col = up ? UP : DOWN;
        const yO = yOf(k.o);
        const yC = yOf(k.c);
        const bodyTop = Math.min(yO, yC);
        const bodyH = Math.max(1, Math.abs(yC - yO));

        // warm-up candles use the real up/down colours, just dimmer (not hollow)
        ctx.globalAlpha = k.synth ? 0.34 : 1;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, yOf(k.h));
        ctx.lineTo(cx, yOf(k.l));
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH);

        const vBarH = vMax ? (k.v / vMax) * volH : 0;
        ctx.globalAlpha = k.synth ? 0.12 : 0.42;
        ctx.fillStyle = col;
        ctx.fillRect(cx - bodyW / 2, H - padB - vBarH, bodyW, vBarH);
        ctx.globalAlpha = 1;

        if (k.clip && !k.synth) {
          const yTop = yOf(k.h);
          ctx.fillStyle = GOLD;
          ctx.beginPath();
          ctx.moveTo(cx, yTop - 5);
          ctx.lineTo(cx - 3.5, yTop - 10);
          ctx.lineTo(cx + 3.5, yTop - 10);
          ctx.closePath();
          ctx.fill();
          // only label the most-recent spike, and only if there's room — avoids
          // "CLIP IT" texts overlapping into garble on dense / small charts
          if (i === lastClip && slot > 18) {
            ctx.font = "bold 9px 'Inter', sans-serif";
            ctx.textAlign = "center";
            const lbl = k.affect !== "neutral" ? `CLIP · ${k.affect}` : "CLIP IT";
            ctx.fillText(lbl, cx, yTop - 16);
            ctx.font = "10px 'Inter', sans-serif";
          }
        }
      }

      if (!compact && firstReal > 0) {
        const bx = x0 + firstReal * slot;
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = UP;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(bx, padT);
        ctx.lineTo(bx, H - padB);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = UP;
        ctx.font = "bold 8px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("● LIVE", bx + 4, padT + 5);
        ctx.globalAlpha = 1;
      }

      // live "last value" marker on the price axis (trading-terminal touch)
      const lastC = candles[candles.length - 1];
      if (!compact && lastC && !lastC.synth) {
        const y = yOf(lastC.c);
        const col = lastC.c >= lastC.o ? UP : DOWN;
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = col;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.fillStyle = col;
        ctx.fillRect(W - padR, y - 7, padR, 14);
        ctx.fillStyle = "#07090d";
        ctx.font = "bold 10px 'Inter', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(String(Math.round(lastC.c)), W - padR + 6, y);
        ctx.textBaseline = "alphabetic";
      }
    };

    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    draw();
    const id = setInterval(draw, 1000);

    return () => {
      disposed = true;
      clearInterval(id);
      ro.disconnect();
    };
  }, [bucketSec, compact]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Live chat-velocity candlestick chart with clip-moment markers"
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}

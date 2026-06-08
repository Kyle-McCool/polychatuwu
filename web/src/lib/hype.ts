import type { ChatMessage } from "./types";
import { isBot } from "./moderation";

/**
 * $HYPE — a multi-signal chat hype score (not raw message rate, which the
 * research flags as the weakest, most gameable signal: chat goes quiet during
 * the real moment, lags it, and is fooled by raids/spam/bots).
 *
 * Per second we combine four normalized inputs over the recent window:
 *   • rate vs a rolling baseline (how busy vs normal)
 *   • emote AFFECT burst (KEKW=funny, Pog/🚀=hype, Sadge/📉=rekt, monkaS=shock…)
 *   • CONVERGENCE — many different users typing the SAME thing at once (the gold
 *     signal that separates a real moment from a raid/ambient spam flood)
 *   • a bot/raid guard that down-weights first-seen floods + caps per-message bots
 * → a bounded 0..100 hype score. CLIP IT fires on the composite with a cooldown.
 */

export type Affect = "funny" | "hype" | "rekt" | "shock" | "rage" | "neutral";

export const AFFECT_META: Record<Affect, { label: string; color: string }> = {
  funny: { label: "funny", color: "#f2b33c" },
  hype: { label: "hype", color: "#2fd39e" },
  rekt: { label: "rekt", color: "#f0616d" },
  shock: { label: "shock", color: "#3b8edf" },
  rage: { label: "rage", color: "#ff8a3d" },
  neutral: { label: "chatting", color: "#828d9c" },
};

// word-token → affect (lowercase, repeated chars collapsed before lookup)
const TOKEN_AFFECT: Record<string, Affect> = {};
const reg = (a: Affect, toks: string[]) => toks.forEach((t) => (TOKEN_AFFECT[t] = a));
reg("funny", ["lul", "lel", "lmao", "lmfao", "omegalul", "kekw", "kek", "icant", "lulw", "haha", "ahah"]);
reg("hype", ["pog", "pogu", "poggers", "pogchamp", "letsgo", "lesgo", "lfg", "hype", "hyped", "gigachad", "ez", "wagmi", "moon", "pump", "bullish"]);
reg("rekt", ["sadge", "pepehands", "rip", "rekt", "ngmi", "oof", "copium", "dump", "liq", "liquidated", "bearish", "rugged"]);
reg("shock", ["monkas", "omg", "wtf", "noway", "holy", "insane", "sheesh", "omfg", "wtff"]);
reg("rage", ["mald", "malding", "cringe", "ratio", "trash", "clown"]);

// emoji → affect (scanned as substrings)
const EMOJI_AFFECT: [string, Affect][] = [
  ["💀", "funny"], ["😂", "funny"], ["🤣", "funny"],
  ["🚀", "hype"], ["📈", "hype"], ["🔥", "hype"], ["🟢", "hype"],
  ["😭", "rekt"], ["😢", "rekt"], ["📉", "rekt"], ["🔴", "rekt"],
  ["😱", "shock"], ["🤯", "shock"], ["👀", "shock"],
  ["🤡", "rage"],
];

// tokens that read as "this is a clip moment"
const CLIP_KEYWORDS = new Set([
  "clip", "clipit", "clipthat", "lmao", "lmfao", "omg", "holy", "insane",
  "noway", "lfg", "rekt", "sheesh", "w", "l", "kekw", "pog", "based", "sniped",
]);
const CLIP_EMOJI = new Set(["🚀", "💀", "😂", "🤣", "😭", "🔥", "🤯", "😱"]);

function collapse(w: string): string {
  return w.replace(/(.)\1{2,}/g, "$1$1"); // "lmaooo" → "lmaoo" → token "lmao" still matched below via prefix? keep 2
}

export interface MsgSignal {
  affect: Affect | null;
  emoteWeight: number; // count of affect-bearing tokens/emojis
  clipKw: boolean;
  norm: string; // normalized text for convergence
}

export function classify(text: string): MsgSignal {
  const lower = (text || "").toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean).map(collapse);
  let affect: Affect | null = null;
  let emoteWeight = 0;
  let clipKw = false;
  for (const w0 of words) {
    const w = w0.replace(/(.)\1+$/, "$1"); // trailing repeat ("lmaoo"→"lmao")
    const a = TOKEN_AFFECT[w] || TOKEN_AFFECT[w0];
    if (a) {
      affect = affect ?? a;
      emoteWeight += 1;
    }
    if (CLIP_KEYWORDS.has(w) || CLIP_KEYWORDS.has(w0)) clipKw = true;
  }
  const trimmed = lower.trim();
  if (trimmed === "w") {
    affect = affect ?? "hype";
    clipKw = true;
    emoteWeight += 1;
  } else if (trimmed === "l") {
    affect = affect ?? "rekt";
    clipKw = true;
    emoteWeight += 1;
  }
  for (const [emo, a] of EMOJI_AFFECT) {
    if (text.includes(emo)) {
      affect = affect ?? a;
      emoteWeight += 1;
      if (CLIP_EMOJI.has(emo)) clipKw = true;
    }
  }
  // convergence key: collapse repeats hard so "LMAOOOO"/"lmaooo" group together
  const norm = words.map((w) => w.replace(/(.)\1+/g, "$1")).join(" ") || trimmed.replace(/(.)\1+/g, "$1");
  return { affect, emoteWeight, clipKw, norm };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface HypePoint {
  sec: number;
  score: number; // 0..100 smoothed hype
  rate: number; // msgs that second
  fired: boolean; // clip fired this second (cooldown-respected)
  affect: Affect; // dominant affect this second
}

const COOLDOWN_SEC = 20;

/**
 * Per-second hype series over [fromSec, toSec]. Single source of truth for the
 * candle, the overlay banner, and the streamer pulse. `seedBefore` seconds get a
 * calm synthetic walk so the chart looks full on cold-load (caller marks dim).
 */
export function hypeSeries(messages: ChatMessage[], fromSec: number, toSec: number, realStartSec: number): HypePoint[] {
  // bucket messages by second
  type Agg = { count: number; aff: Record<Affect, number>; clipKw: number; norms: Map<string, number>; bots: number; users: Map<string, number> };
  const bySec = new Map<number, Agg>();
  for (const m of messages) {
    const s = Math.floor(m.ts / 1000);
    if (s < fromSec || s > toSec) continue;
    let a = bySec.get(s);
    if (!a) {
      a = { count: 0, aff: { funny: 0, hype: 0, rekt: 0, shock: 0, rage: 0, neutral: 0 }, clipKw: 0, norms: new Map(), bots: 0, users: new Map() };
      bySec.set(s, a);
    }
    a.count += 1;
    if (isBot(m.user)) a.bots += 1;
    a.users.set(m.user, (a.users.get(m.user) || 0) + 1);
    const sig = classify(m.text);
    if (sig.affect) a.aff[sig.affect] += sig.emoteWeight;
    if (sig.clipKw) a.clipKw += 1;
    a.norms.set(sig.norm, (a.norms.get(sig.norm) || 0) + 1);
  }

  const out: HypePoint[] = [];
  let ema = 2; // rolling baseline rate
  let emaScore = 0.2;
  let lastFired = -Infinity;
  let seed = fromSec * 2654435761;

  for (let s = fromSec; s <= toSec; s += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const rnd = (seed / 0x7fffffff - 0.5);

    if (s < realStartSec) {
      // calm synthetic warm-up (no real data yet)
      const synthRate = 2 + Math.abs(Math.round(rnd * 4));
      ema = ema * 0.9 + synthRate * 0.1;
      emaScore = emaScore * 0.85 + (0.18 + rnd * 0.06) * 0.15;
      out.push({ sec: s, score: clamp(emaScore * 100, 2, 100), rate: synthRate, fired: false, affect: "neutral" });
      continue;
    }

    const a = bySec.get(s);
    const rate = a?.count || 0;
    ema = ema * 0.9 + rate * 0.1;

    const uniqueUsers = a ? a.users.size : 0;
    // per-user cap: one account spamming 40 msgs can't inflate the signal
    let capped = 0;
    if (a) for (const c of a.users.values()) capped += Math.min(c, 3);
    const diversity = rate > 0 ? uniqueUsers / rate : 0; // 1 = all distinct users, low = few accounts spamming
    const humanRate = a ? Math.max(0, capped - a.bots) : 0;
    const botFrac = rate > 0 && a ? a.bots / rate : 0;
    const guard = clamp(1 - botFrac, 0.25, 1);

    const ratePart = clamp(capped / Math.max(ema * 2, 3), 0, 1);
    const affectSum = a ? a.aff.funny + a.aff.hype + a.aff.rekt + a.aff.shock + a.aff.rage : 0;
    const emotePart = clamp(affectSum / Math.max(humanRate, 1), 0, 1);
    let topNorm = 0;
    if (a) for (const v of a.norms.values()) if (v > topNorm) topNorm = v;
    const convPart = clamp(topNorm / Math.max(rate, 1), 0, 1);

    const raw = guard * (0.45 * ratePart + 0.3 * emotePart + 0.25 * convPart);
    emaScore = emaScore * 0.7 + raw * 0.3;
    const score = clamp(emaScore * 100, 2, 100);

    // clip composite (rate-novelty + affect + keyword + convergence), guarded by
    // bot-fraction + user diversity (a real moment = many DISTINCT users, not a raid)
    const zr = (capped - ema) / Math.max(Math.sqrt(ema), 1);
    const clipKwPart = a ? clamp(a.clipKw / Math.max(humanRate, 1), 0, 1) : 0;
    const clipScore = guard * (0.3 * clamp(zr / 3, 0, 1) + 0.3 * emotePart + 0.2 * clipKwPart + 0.2 * convPart);
    const fire =
      clipScore >= 0.6 &&
      rate >= Math.max(6, ema * 1.6) &&
      uniqueUsers >= 4 &&
      diversity >= 0.45 &&
      (convPart >= 0.35 || emotePart >= 0.4) &&
      s - lastFired >= COOLDOWN_SEC;
    if (fire) lastFired = s;

    // dominant affect this second
    let affect: Affect = "neutral";
    let best = 0;
    if (a) for (const k of ["funny", "hype", "rekt", "shock", "rage"] as Affect[]) if (a.aff[k] > best) { best = a.aff[k]; affect = k; }

    out.push({ sec: s, score, rate, fired: fire, affect });
  }
  return out;
}

export interface HypeNow {
  score: number; // 0..100
  perSec: number; // msgs/sec (last 5s)
  base: number; // baseline msgs/sec
  intensity: "calm" | "active" | "spiking";
  clip: boolean; // a clip fired in the last few seconds
  affect: Affect; // dominant vibe over the last ~8s
}

/** Current hype state for the overlay/desk readouts (derived from the same series). */
export function hypeNow(messages: ChatMessage[], nowMs: number): HypeNow {
  const nowSec = Math.floor(nowMs / 1000);
  const from = nowSec - 90;
  const series = hypeSeries(messages, from, nowSec, from); // all real (no synth seed)
  const last = series[series.length - 1];
  const recent = series.slice(-8);
  const last5 = series.slice(-5).reduce((s, p) => s + p.rate, 0);
  const trailing = series.slice(0, -5).reduce((s, p) => s + p.rate, 0);
  const base = trailing > 0 ? trailing / Math.max(series.length - 5, 1) : 0;
  const perSec = Math.round((last5 / 5) * 10) / 10;
  // suppress clips until we've observed ~12s of chat, so a cold load (or a burst of
  // replayed history) can't fire "CLIP IT" the instant the overlay opens.
  let earliest = Infinity;
  for (const m of messages) if (m.ts >= from * 1000 && m.ts < earliest) earliest = m.ts;
  const dataAgeMs = earliest === Infinity ? 0 : nowMs - earliest;
  const clip = dataAgeMs >= 12000 && recent.some((p) => p.fired);

  // dominant affect over the recent window
  const tally: Record<Affect, number> = { funny: 0, hype: 0, rekt: 0, shock: 0, rage: 0, neutral: 0 };
  for (const p of recent) if (p.affect !== "neutral") tally[p.affect] += 1;
  let affect: Affect = "neutral";
  let best = 0;
  for (const k of ["funny", "hype", "rekt", "shock", "rage"] as Affect[]) if (tally[k] > best) { best = tally[k]; affect = k; }

  const score = last?.score ?? 2;
  const intensity: HypeNow["intensity"] = clip || score >= 70 ? "spiking" : score >= 42 ? "active" : "calm";
  return { score: Math.round(score), perSec, base: Math.round(base * 10) / 10, intensity, clip, affect };
}

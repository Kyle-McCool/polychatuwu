// Client-side chat hygiene + signal helpers — DETECTION ONLY.
// No platform actions and no auth required: we classify messages off the chat
// stream we already have, so we can hide junk from the unified feed and flag
// raids. (Actually banning a user on Twitch/Kick needs the streamer's OAuth,
// which is out of scope — this makes OUR view clean without it.)
//
// The actual banned terms live in ./wordlist.ts (readable + documented).

import {
  SLUR_MATCHER,
  SCAM_PATTERNS,
  deleet,
  buildMatcher,
  THREAT_MATCHER,
  THREAT_TARGET,
  SELFHARM_RE,
  INSULT_MATCHER,
  DOXX_PATTERNS,
} from "./wordlist";
import type { Platform } from "./types";

// The streamer's own block list (from the Sidebar "Blocked words" box). Compiled
// once whenever it changes so per-message checks stay cheap.
let customMatcher: RegExp | null = null;
let customCount = 0;
export function setCustomBlocklist(words: string[]): void {
  const cleaned = words.map((w) => w.trim()).filter(Boolean);
  customCount = cleaned.length;
  customMatcher = buildMatcher(cleaned);
}
export function customBlocklistCount(): number {
  return customCount;
}

export function hasSlur(text: string): boolean {
  const d = deleet(text);
  if (SLUR_MATCHER && SLUR_MATCHER.test(d)) return true;
  if (customMatcher && customMatcher.test(d)) return true;
  return false;
}

export function isScam(text: string): boolean {
  return SCAM_PATTERNS.some((re) => re.test(text));
}

/** Junk we hide from the unified feed when "clean chat" is on. */
export function isJunk(text: string): boolean {
  return hasSlur(text) || isScam(text);
}

// known-safe link hosts (the platforms + Polymarket) that should NOT be flagged
const SAFE_LINK = /(?:twitch\.tv|kick\.com|x\.com|twitter\.com|youtu\.be|youtube\.com|polymarket\.com)/i;
const LINKISH = /\bhttps?:\/\/\S+|\b[a-z0-9-]{2,}\.(?:com|net|io|xyz|gg|tv|ly|link|shop|app|co|me|info|vip|win|live|fun)\b/i;

// Moderation taxonomy. Severity:
//   3 = act now   (slurs, credible threats, self-harm targeting, doxxing)
//   2 = review    (scams, targeted harassment)
//   1 = watch     (off-platform links, caps shouting, copypasta spam)
export type ModCategory =
  | "slur" | "threat" | "self-harm" | "doxx" | "scam" | "harassment" | "link" | "caps" | "spam";
export type ModFlag = { level: 1 | 2 | 3; category: ModCategory };

/**
 * Context-aware severity classifier for the Mod queue. Reads the chat stream we already
 * have (keyless) and grades each message, with guards to keep banter out of the queue:
 * threats need a violence verb AND a second-person target, harassment needs a real insult
 * AND a target, so "kill the boss" / "this game is trash" stay clean.
 */
export function classifyMessage(text: string): ModFlag | null {
  const t = (text || "").trim();
  if (!t) return null;
  const d = deleet(t);

  // ── level 3: act now ──
  if (hasSlur(t)) return { level: 3, category: "slur" };
  if (SELFHARM_RE.test(t)) return { level: 3, category: "self-harm" };
  if (THREAT_MATCHER && THREAT_MATCHER.test(d) && THREAT_TARGET.test(t)) return { level: 3, category: "threat" };
  if (DOXX_PATTERNS.some((re) => re.test(t))) return { level: 3, category: "doxx" };

  // ── level 2: review ──
  if (isScam(t)) return { level: 2, category: "scam" };
  if (INSULT_MATCHER && INSULT_MATCHER.test(d) && THREAT_TARGET.test(t)) return { level: 2, category: "harassment" };

  // ── level 1: watch ──
  if (LINKISH.test(t) && !SAFE_LINK.test(t)) return { level: 1, category: "link" };
  const letters = t.replace(/[^a-zA-Z]/g, "");
  if (letters.length >= 14 && letters === letters.toUpperCase()) return { level: 1, category: "caps" };
  if (/(.)\1{9,}/.test(t)) return { level: 1, category: "spam" };
  return null;
}

/**
 * Paste-ready chat moderation command for a platform. These are the native chat commands
 * a streamer (or their mods) type into their OWN chat — so they work with zero auth, which
 * keeps the app keyless while still being one paste from an actual ban/timeout. X live chat
 * has no such command, so callers fall back to copying the @handle there.
 */
export function modCommand(platform: Platform, user: string, action: "ban" | "timeout"): string | null {
  const u = user.replace(/^@/, "");
  if (!u) return null;
  switch (platform) {
    case "twitch":
      return action === "ban" ? `/ban ${u}` : `/timeout ${u} 600`; // seconds
    case "kick":
      return action === "ban" ? `/ban ${u}` : `/timeout ${u} 10`; // minutes
    default:
      return null; // X / native — no chat mod command; copy the @handle instead
  }
}

// Known chat bots — excluded from raffle votes, predictions, and leaderboards
// so a bot can never win a giveaway or top the chatter list.
const BOTS = new Set([
  "nightbot", "fossabot", "streamelements", "streamlabs", "moobot", "wizebot", "soundalerts",
  "sery_bot", "botrix", "kofistreambot", "commanderroot", "tangiabot", "pretzelrocks",
  "streamlootsbot", "phantombot", "coebot", "ankhbot", "deepbot", "ohbot", "scottybot",
  "buttsbot", "supibot", "lattemotte", "own3d", "blerp", "stay_hydrated_bot",
]);
export function isBot(user: string): boolean {
  return BOTS.has((user || "").toLowerCase().replace(/^@/, ""));
}

/** A genuine question worth surfacing — filters out reaction spam like "LMAO????". */
export function isQuestion(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  const words = t.split(/\s+/).length;
  const hasQ = t.includes("?");
  // all-caps with no "?" is almost always a hype reaction ("WHAT THE HECK"), not a question
  if (!hasQ && t === t.toUpperCase() && /[A-Z]/.test(t)) return false;
  const startsQ =
    /^(how|what|why|when|where|who|which|can|do|does|did|is|are|should|could|would|will|any|anyone|whats|hows)\b/i.test(t);
  if (startsQ && words >= 2) return true;
  if (hasQ && words >= 4) return true; // a real sentence ending in ?
  return false;
}

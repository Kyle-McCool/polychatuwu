// Client-side chat hygiene + signal helpers — DETECTION ONLY.
// No platform actions and no auth required: we classify messages off the chat
// stream we already have, so we can hide junk from the unified feed and flag
// raids. (Actually banning a user on Twitch/Kick needs the streamer's OAuth,
// which is out of scope — this makes OUR view clean without it.)
//
// The actual banned terms live in ./wordlist.ts (readable + documented).

import { SLUR_MATCHER, SCAM_PATTERNS, deleet, buildMatcher } from "./wordlist";

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

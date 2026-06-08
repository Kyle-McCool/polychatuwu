// Shared chat sentiment scoring for the Oracle + $MOOD index.
// Fixes the old substring bug ("up" matched "group", "red" matched "bored") by
// matching whole words only, and counts ONE bull/bear vote per message (not one
// per keyword) so a single hype message can't read as "100% bull".

const BULL_WORDS = [
  "moon", "mooning", "pump", "pumping", "bull", "bullish", "bullrun", "lfg", "green",
  "buy", "buying", "long", "longing", "based", "ath", "breakout", "hodl", "wagmi",
  "gm", "send", "sending", "up", "green", "rocket", "based",
];
const BEAR_WORDS = [
  "dump", "dumping", "bear", "bearish", "rug", "rugged", "rekt", "ngmi", "sell",
  "selling", "short", "shorting", "red", "liquidated", "crash", "crashing", "dead",
  "scam", "cooked", "down", "rip", "over",
];
const BULL_EMOJI = ["🚀", "📈", "🟢", "🔥", "💎", "🌙"];
const BEAR_EMOJI = ["📉", "🔴", "💀", "🩸", "⚰️"];

function compile(words: string[]): RegExp {
  return new RegExp(`\\b(?:${[...new Set(words)].join("|")})\\b`, "i");
}
const BULL_RE = compile(BULL_WORDS);
const BEAR_RE = compile(BEAR_WORDS);

/** One vote each way per message (0 or 1), word-boundary matched. */
export function sentimentOf(text: string): { bull: number; bear: number } {
  const bull = BULL_RE.test(text) || BULL_EMOJI.some((e) => text.includes(e)) ? 1 : 0;
  const bear = BEAR_RE.test(text) || BEAR_EMOJI.some((e) => text.includes(e)) ? 1 : 0;
  return { bull, bear };
}

// Below this many directional votes, a percentage is just noise — show neutral.
export const MIN_SENTIMENT_SAMPLE = 4;

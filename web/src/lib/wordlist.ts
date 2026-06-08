// ─────────────────────────────────────────────────────────────────────────────
// CENSOR WORD LIST — the single source of truth for what "Clean chat" hides.
//
// HOW MATCHING WORKS (so it's fully transparent + tunable):
//   1. Text is "de-leeted": lowercased and common leetspeak is folded back to
//      letters (0→o, 1/!→i, 3→e, 4/@→a, 5/$→s, 7→t, 8→b, |→i) so "n1gg3r" and
//      "f@ggot" still match.
//   2. Matched with WORD BOUNDARIES + an optional suffix group (s, er, a, ing…),
//      so "spic" matches "spics" but NOT "despicable", and "homo" matches the
//      slur but not "homogenize". (This avoids the classic Scunthorpe problem.)
//   3. The active block set = SLURS (below) ∪ the streamer's custom words.
//      SCAM_PATTERNS (regex) catch bot/spam copypasta separately.
//
// KNOWN LIMITATION: fully spaced-out evasion ("n i g g e r") isn't caught yet.
// To extend the list, add base terms here OR use the in-app "Blocked words" box
// (Sidebar) — that list is yours, persists locally, and needs no rebuild.
// ─────────────────────────────────────────────────────────────────────────────

// Base hate/slur terms (the matcher auto-covers plurals & leetspeak variants).
// Grouped only for readability; all are treated identically.
export const SLURS: string[] = [
  // anti-Black
  "nigger", "nigga", "niglet", "coon", "porchmonkey", "jigaboo", "spook", "tarbaby",
  // anti-LGBTQ  (note: "queer"/"homo" deliberately excluded — reclaimed / too many
  // false positives; add them to your custom list if your community wants them gone)
  "faggot", "dyke", "tranny", "trannie", "shemale", "fudgepacker",
  // anti-Asian
  "chink", "gook", "chinaman", "slanteye", "zipperhead", "ricer",
  // anti-Latino
  "spic", "beaner", "wetback", "greaser", "wab",
  // anti-Semitic / anti-Arab / anti-religion
  "kike", "heeb", "yid", "shylock", "raghead", "sandnigger", "towelhead", "cameljockey",
  // anti-Indigenous / other ethnic
  "injun", "redskin", "abo", "gypsy", "gyppo", "paki", "currymuncher",
  // ableist
  "retard", "retarded", "tard", "mongoloid",
];

// Scam / spam-bot copypasta (the stuff that floods under-moderated chats).
// These are regex so they can match phrases & domains, not just words.
export const SCAM_PATTERNS: RegExp[] = [
  /\b(cheap|best|buy|get|need)\s+(viewers?|followers?|subs?|primes?)\b/i,
  /\bfree\s+(followers?|subs?|primes?|gift\s?cards?|vbucks?|nitro)\b/i,
  /\bg[i1]ft\s?cards?\b/i,
  /\bbecome\s+(famous|big|viral)\b/i,
  /\b(promo|grow|boost)\s+(your\s+)?(channel|stream|account)\b/i,
  /\b(bit\.ly|tinyurl|cutt\.ly|t\.me|is\.gd)\b/i,
  /\b[a-z0-9-]{2,}\.(ru|tk|xyz|top|click|shop|gift|live|buzz)\b/i,
  /\bviewers?\s+on\s+[a-z0-9.]+\b/i,
  /\bonlyfans\b|\bo\W?f\b.*\b(link|sale|free)\b/i,
];

// Suffixes the matcher allows after a base term (plurals / inflections).
const SUFFIX = "(?:s|z|es|er|ers|a|ah|az|as|in|ing|ed|y|ies|o|oid)?";

/** Fold leetspeak/obfuscation back to plain letters. */
export function deleet(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/9/g, "g");
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compile a word-boundary matcher for a set of base terms (+ suffixes). */
export function buildMatcher(terms: string[]): RegExp | null {
  const clean = terms.map((t) => deleet(t.trim())).filter(Boolean);
  if (!clean.length) return null;
  const alt = clean.map(escapeRe).join("|");
  return new RegExp(`\\b(?:${alt})${SUFFIX}\\b`, "i");
}

// Pre-compiled built-in slur matcher (custom words compile separately at runtime).
export const SLUR_MATCHER = buildMatcher(SLURS);

/** Total count for transparency / UI display. */
export const BUILTIN_SLUR_COUNT = SLURS.length;
export const SCAM_PATTERN_COUNT = SCAM_PATTERNS.length;

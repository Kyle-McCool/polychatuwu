// Regular-viewer memory — persists every chatter the streamer has ever seen, so we can
// tell a genuine first-timer apart from a regular who's just new to THIS session. Keyless,
// local-only (localStorage). The research flagged "memory of regular viewers" as a top
// multi-platform-streamer want; this is the lightweight, no-account version.

const KEY = "tape.knownUsers";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

const known = load();
// snapshot of who we knew BEFORE this session started — that's what "returning" means
const seenBefore = new Set(known);
let dirty = false;

/** True if this user chatted in a previous session (a known regular, not a first-timer). */
export function isReturning(user: string): boolean {
  return seenBefore.has((user || "").toLowerCase());
}

/** Record that a user has chatted (added to the persisted memory for next session). */
export function rememberUser(user: string): void {
  const u = (user || "").toLowerCase();
  if (u && !known.has(u)) {
    known.add(u);
    dirty = true;
  }
}

// flush to localStorage on a relaxed cadence so a chat firehose never thrashes storage
if (typeof window !== "undefined") {
  setInterval(() => {
    if (!dirty) return;
    dirty = false;
    try {
      // cap so the store can't grow unbounded; keep the most recent ~4000
      localStorage.setItem(KEY, JSON.stringify([...known].slice(-4000)));
    } catch {
      /* quota / private mode */
    }
  }, 12000);
}

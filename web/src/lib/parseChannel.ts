import type { ChannelConfig, Platform } from "./types";

/**
 * Turn a typed handle or pasted URL into a ChannelConfig.
 *
 * Twitch / Kick are identified by a bare channel handle (socket reader joins it).
 * X has no chat socket, so its "channel" is the FULL url of a specific post or
 * broadcast — the XSource navigates there and scrapes replies.
 *
 *   "zackrawrr"                              -> { twitch, "zackrawrr" }   (via selected tab)
 *   "https://twitch.tv/zackrawrr"            -> { twitch, "zackrawrr" }
 *   "kick.com/classybeef"                    -> { kick,   "classybeef" }
 *   "https://x.com/user/status/123"          -> { x,      "https://x.com/user/status/123" }
 *   "x.com/i/broadcasts/abc"                 -> { x,      "https://x.com/i/broadcasts/abc" }
 */
/** Extract the broadcast/space id from an x.com/i/broadcasts/<id> URL (else null). */
export function broadcastId(channel: string): string | null {
  const m = (channel || "").match(/\/i\/(?:broadcasts|spaces)\/([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

/**
 * A clean, human label for a source chip. Twitch / Kick are already plain handles; an X source
 * can be a profile, a post URL, or a raw broadcast id, so normalize: a broadcast shows "X live",
 * a profile / post shows "@handle", and a bare broadcast id (mixed-case base62) falls back to
 * "X live" rather than dumping the id into the toolbar.
 */
export function channelLabel(platform: Platform, channel: string): string {
  const c = (channel || "").trim();
  if (platform !== "x") return c;
  if (broadcastId(c)) return "X live"; // x.com/i/broadcasts/<id> or /spaces/<id>
  const inUrl = c.match(/(?:x|twitter)\.com\/(@?[A-Za-z0-9_]{1,15})(?:\/|$)/i);
  if (inUrl) return "@" + inUrl[1].replace(/^@/, "");
  const bare = c.replace(/^@/, "");
  // a real handle is <= 15 chars and not the long, mixed-case id of a broadcast
  if (/^[A-Za-z0-9_]{1,15}$/.test(bare) && !(bare.length >= 10 && /[a-z]/.test(bare) && /[A-Z]/.test(bare))) {
    return "@" + bare;
  }
  return "X live";
}

export function parseChannelInput(raw: string, fallback: Platform): ChannelConfig | null {
  const s = raw.trim();
  if (!s) return null;

  // Explicit platform URLs win regardless of the selected tab.
  if (/^(?:https?:\/\/)?(?:www\.)?(?:x\.com|twitter\.com)\/\S+/i.test(s)) {
    const url = s.replace(/^@/, "").replace(/^(?:https?:\/\/)?(?:www\.)?/i, "https://");
    return { platform: "x", channel: url };
  }
  const tk = s
    .replace(/^@/, "")
    .match(/^(?:https?:\/\/)?(?:www\.)?(twitch\.tv|kick\.com)\/(@?[A-Za-z0-9_]+)/i);
  if (tk) {
    const host = tk[1].toLowerCase();
    const handle = tk[2].replace(/^@/, "");
    return { platform: host.includes("twitch") ? "twitch" : "kick", channel: handle };
  }

  // No URL → use the selected tab.
  if (fallback === "x") {
    const h = s.replace(/^@/, "");
    if (/^[A-Za-z0-9_]{1,15}$/.test(h)) return { platform: "x", channel: `https://x.com/${h}` };
    return null; // X really wants a post/broadcast URL
  }
  const bare = s.replace(/^@/, "");
  if (/^[A-Za-z0-9_]{2,30}$/.test(bare)) return { platform: fallback, channel: bare };
  return null;
}

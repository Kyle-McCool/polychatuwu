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

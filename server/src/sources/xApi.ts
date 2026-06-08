// Keyless access to X (Twitter) live broadcasts via the public guest-token API — the
// exact endpoints x.com's own logged-out web player uses. No OAuth, no login, no API key.
//   guest token -> broadcasts/show -> live_video_stream/status  (HLS url + chatToken)
//   chatToken   -> proxsee accessChatPublic                     (chatman WS + access token)
// Everything is wrapped so a dead/changed endpoint degrades gracefully instead of throwing.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
// The public web bearer x.com ships to logged-out browsers. Not a secret; it rotates rarely.
const WEB_BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export { UA as X_UA };

/** Pull the broadcast id out of any x.com/i/broadcasts/<id> (or /spaces/) URL. */
export function broadcastIdFromUrl(url: string): string | null {
  const m = (url || "").match(/\/i\/(?:broadcasts|spaces)\/([A-Za-z0-9]+)/i);
  return m ? m[1] : null;
}

export async function xFetchJson(url: string, init?: any): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let guestToken = "";
let guestAt = 0;
const GUEST_TTL = 2.5 * 60 * 60 * 1000; // refresh well inside X's ~3h rotation

async function getGuestToken(force = false): Promise<string> {
  if (!force && guestToken && Date.now() - guestAt < GUEST_TTL) return guestToken;
  const j = await xFetchJson("https://api.twitter.com/1.1/guest/activate.json", {
    method: "POST",
    headers: { Authorization: WEB_BEARER, "User-Agent": UA },
  });
  if (j?.guest_token) {
    guestToken = j.guest_token;
    guestAt = Date.now();
  }
  return guestToken;
}

function authHeaders(gt: string) {
  return { Authorization: WEB_BEARER, "x-guest-token": gt, "User-Agent": UA };
}

export interface BroadcastInfo {
  id: string;
  state: string; // RUNNING | ENDED | TIMED_OUT | ...
  live: boolean;
  username: string; // twitter handle
  name: string; // display name
  mediaKey: string;
  hlsUrl: string; // HLS .m3u8 (server-fetchable; proxy it to the browser)
  chatToken: string;
}

/**
 * Resolve a broadcast to its metadata + HLS url + chat token. Retries once on a fresh
 * guest token, since a cached guest token can expire and yields an empty broadcasts map.
 */
export async function resolveBroadcast(bid: string): Promise<BroadcastInfo | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const gt = await getGuestToken(attempt === 1);
    if (!gt) continue;
    const h = authHeaders(gt);
    const show = await xFetchJson(`https://api.twitter.com/1.1/broadcasts/show.json?ids=${bid}`, { headers: h });
    const b = show?.broadcasts?.[bid];
    if (!b) continue; // stale guest token or unknown broadcast → retry fresh once
    const mediaKey: string = b.media_key || "";
    const status = mediaKey
      ? await xFetchJson(
          `https://api.twitter.com/1.1/live_video_stream/status/${mediaKey}?client=web&use_syndication_guest_id=false&cookie_set_host=x.com`,
          { headers: h },
        )
      : null;
    return {
      id: bid,
      state: b.state || "",
      live: b.state === "RUNNING",
      username: b.twitter_username || b.username || "",
      name: b.user_display_name || b.username || "",
      mediaKey,
      hlsUrl: status?.source?.location || "",
      chatToken: status?.chatToken || "",
    };
  }
  return null;
}

export interface ChatAccess {
  endpoint: string; // https://prod-chatman-...pscp.tv
  accessToken: string;
  roomId: string;
}

/** Trade the broadcast's chatToken for the chatman websocket endpoint + access token. */
export async function accessChat(chatToken: string): Promise<ChatAccess | null> {
  const j = await xFetchJson("https://proxsee.pscp.tv/api/v2/accessChatPublic", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ chat_token: chatToken }),
  });
  if (!j?.endpoint || !j?.access_token) return null;
  return { endpoint: j.endpoint, accessToken: j.access_token, roomId: j.room_id || "" };
}

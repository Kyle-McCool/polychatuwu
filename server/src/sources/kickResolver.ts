import { chromium, type Browser } from "playwright";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface KickChannelInfo {
  chatroomId: number;
  live: boolean;
}

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium
      .launch({ headless: true, args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"] })
      .then((b) => {
        b.on("disconnected", () => { browserPromise = null; }); // if Chromium dies, relaunch on next use
        return b;
      })
      .catch((e) => { browserPromise = null; throw e; }); // never cache a failed launch forever
  }
  return browserPromise;
}

export async function closeKickBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

/**
 * Resolve a Kick channel's chatroom id (and live state).
 * Tries a plain fetch first (works from residential IPs); if Cloudflare 403s it
 * — as it does from datacenter/Node — falls back to loading the channel page in a
 * real Chromium context to obtain cf_clearance, then fetches the API same-origin.
 */
export async function resolveKickChannel(slug: string): Promise<KickChannelInfo> {
  // 1) cheap path
  try {
    const r = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (r.ok) {
      const j: any = await r.json();
      if (j?.chatroom?.id) return { chatroomId: j.chatroom.id, live: j.livestream != null };
    }
  } catch {
    /* fall through to browser */
  }

  // 2) browser path (clears Cloudflare)
  const browser = await getBrowser();
  const ctx = await browser.newContext({ userAgent: UA, locale: "en-US" });
  const page = await ctx.newPage();
  try {
    await page.goto(`https://kick.com/${encodeURIComponent(slug)}`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    const handle = await page.waitForFunction(
      async (s) => {
        try {
          const r = await fetch(`/api/v2/channels/${s}`, { headers: { Accept: "application/json" } });
          if (!r.ok) return null;
          const j = await r.json();
          return j?.chatroom?.id ? j : null;
        } catch {
          return null;
        }
      },
      slug,
      { timeout: 30000, polling: 1000 },
    );
    const j: any = await handle.jsonValue();
    if (j?.chatroom?.id) return { chatroomId: j.chatroom.id, live: j.livestream != null };
    throw new Error("no chatroom id from browser context");
  } finally {
    await ctx.close();
  }
}

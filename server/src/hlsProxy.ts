import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { resolveBroadcast, X_UA } from "./sources/xApi";

/**
 * Tiny HLS pass-through proxy for X broadcasts. The pscp.tv video CDN serves the
 * playlist + segments fine to a server, but sends NO CORS header, so a browser / hls.js
 * cannot fetch them directly. We resolve the broadcast keyless, proxy the playlists, and
 * rewrite every variant/segment URL to route back through us with permissive CORS.
 *   GET /x-hls/<broadcastId>.m3u8   -> resolve + proxy the master playlist
 *   GET /x-hls/seg?u=<base64url>    -> proxy a nested playlist or a media segment
 * URLs are rewritten RELATIVE to /x-hls/ so playback works on any host/scheme.
 */

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString("utf8");

// only ever fetch X's own video CDN through the proxy (never an arbitrary URL)
const ALLOW_HOST = /(?:^|\.)pscp\.tv$/i;

const resolveCache = new Map<string, { url: string; at: number }>();
const RESOLVE_TTL = 45_000; // the master url is stable for a while; re-resolve occasionally

async function masterUrl(bid: string): Promise<string> {
  const c = resolveCache.get(bid);
  if (c && Date.now() - c.at < RESOLVE_TTL) return c.url;
  const info = await resolveBroadcast(bid);
  const url = info?.hlsUrl || "";
  if (url) resolveCache.set(bid, { url, at: Date.now() });
  return url;
}

function rewritePlaylist(body: string, baseUrl: string): string {
  const base = new URL(baseUrl);
  const through = (u: string) => `seg?u=${b64(new URL(u, base).toString())}`;
  return body
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith("#")) {
        // rewrite URI="..." inside tags (EXT-X-MAP / EXT-X-MEDIA / EXT-X-KEY)
        return line.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${through(u)}"`);
      }
      return through(t); // a variant-playlist or segment URL line
    })
    .join("\n");
}

function isPlaylist(url: string, contentType: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /mpegurl/i.test(contentType);
}

async function pipeThrough(targetUrl: string, res: ServerResponse) {
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, { headers: { "User-Agent": X_UA, Referer: "https://x.com/" } });
  } catch {
    res.writeHead(502); res.end(); return;
  }
  if (!upstream.ok || !upstream.body) { res.writeHead(upstream.status || 502); res.end(); return; }
  const ct = upstream.headers.get("content-type") || "";
  if (isPlaylist(targetUrl, ct)) {
    const text = await upstream.text();
    res.writeHead(200, {
      "content-type": "application/vnd.apple.mpegurl",
      "access-control-allow-origin": "*",
      "cache-control": "no-cache",
    });
    res.end(rewritePlaylist(text, targetUrl));
  } else {
    res.writeHead(200, {
      "content-type": ct || "video/mp2t",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=15",
    });
    Readable.fromWeb(upstream.body as any).pipe(res);
  }
}

/** Returns true if this request was an /x-hls/ request (handled here), false otherwise. */
export async function handleHls(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url || "";
  if (!url.startsWith("/x-hls/")) return false;
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" });
    res.end();
    return true;
  }
  try {
    const u = new URL(url, "http://x");
    if (u.pathname === "/x-hls/seg") {
      const enc = u.searchParams.get("u");
      if (!enc) { res.writeHead(400); res.end(); return true; }
      const target = unb64(enc);
      const host = (() => { try { return new URL(target).hostname; } catch { return ""; } })();
      if (!ALLOW_HOST.test(host)) { res.writeHead(403); res.end(); return true; }
      await pipeThrough(target, res);
      return true;
    }
    const mm = u.pathname.match(/^\/x-hls\/([A-Za-z0-9]+)\.m3u8$/);
    if (mm) {
      const master = await masterUrl(mm[1]);
      if (!master) { res.writeHead(404); res.end(); return true; }
      await pipeThrough(master, res);
      return true;
    }
    res.writeHead(404); res.end(); return true;
  } catch {
    try { res.writeHead(502); res.end(); } catch { /* already sent */ }
    return true;
  }
}

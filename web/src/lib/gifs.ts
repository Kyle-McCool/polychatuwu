/**
 * GIF search via Tenor (Google) — free, CORS-enabled, no OAuth. Uses the public
 * demo key by default so it works out of the box; set VITE_TENOR_KEY to your own
 * free key for production. Content-filtered to medium (stream-safe).
 *
 * Get a free key: https://developers.google.com/tenor/guides/quickstart
 */

const KEY = import.meta.env.VITE_TENOR_KEY || "LIVDSRZULELA"; // public demo key
const BASE = "https://g.tenor.com/v1";

export type Gif = { id: string; preview: string; full: string; desc: string };

interface TenorResult {
  id: string;
  title?: string;
  content_description?: string;
  media?: Array<Record<string, { url: string }>>;
}

function parse(results: TenorResult[] | undefined): Gif[] {
  return (results || [])
    .map((r) => {
      const m = r.media?.[0] || {};
      return {
        id: String(r.id),
        preview: m.tinygif?.url || m.nanogif?.url || m.gif?.url || "",
        full: m.mediumgif?.url || m.gif?.url || m.tinygif?.url || "",
        desc: r.content_description || r.title || "gif",
      };
    })
    .filter((g) => g.preview && g.full);
}

export async function trendingGifs(limit = 24): Promise<Gif[]> {
  try {
    const r = await fetch(`${BASE}/trending?key=${KEY}&limit=${limit}&contentfilter=medium`);
    if (!r.ok) return [];
    return parse((await r.json()).results);
  } catch {
    return [];
  }
}

export async function searchGifs(q: string, limit = 24): Promise<Gif[]> {
  try {
    const r = await fetch(`${BASE}/search?key=${KEY}&q=${encodeURIComponent(q)}&limit=${limit}&contentfilter=medium`);
    if (!r.ok) return [];
    return parse((await r.json()).results);
  } catch {
    return [];
  }
}

// hosts we accept for broadcast (so a relayed gif URL can't be arbitrary)
export const GIF_HOSTS = /(^|\.)(tenor\.com|giphy\.com|googleusercontent\.com)$/i;

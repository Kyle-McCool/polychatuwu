export type Platform = "twitch" | "kick" | "x" | "tape";

export interface ChatMessage {
  id: string;
  platform: Platform;
  channel: string;
  user: string;
  color: string | null;
  badges: string[];
  text: string;
  ts: number;
  amount?: number;
  cashtags?: string[];
  host?: boolean; // streamer/host reply (posted from the dashboard) — highlighted on overlay + feed
}

export interface SourceStatus {
  platform: Platform;
  channel: string;
  state: "connecting" | "live" | "error" | "offline";
  detail?: string;
}

export interface ChannelConfig {
  platform: Platform;
  channel: string;
}

export interface Reaction {
  sound?: string; // which soundboard pad fired it
  gif?: string; // or a GIF url to play on the overlay
  id: string;
  ts: number;
}

// Auto-monitored crypto newswire item (top X accounts via syndication + news RSS).
export interface NewsItem {
  id: string;
  kind: "tweet" | "news";
  handle?: string; // tweet author screen_name (no @)
  name: string; // display name (tweet) or publisher (news)
  text: string;
  url: string;
  source: string; // "X" | "Decrypt" | "Cointelegraph" | "CoinDesk" | "Bitcoin Magazine"
  ts: number;
  avatar?: string; // tweet author profile image URL (X), when available
}

// Live price ticker item (top crypto + memecoins via CoinGecko, stocks via Yahoo).
export interface PriceItem {
  symbol: string;
  price: number;
  change: number; // 24h % change (signed)
  kind: "crypto" | "meme" | "stock";
}

// Overlay configuration the streamer controls from /app; relayed to the overlay.
export type OverlayFeature = "index" | "candle" | "market" | "chat" | "chatters" | "wire" | "ticker" | "reactions" | "audio" | "news" | "lowerThird" | "scoreboard";

// The persisted Crowd-vs-Market track record, summarized and relayed to the overlay so
// the audience sees the on-air scoreboard (the dashboard owns the record in localStorage;
// the OBS overlay is a separate browser, so it can only get this through the server relay).
export interface CrowdScore {
  chatWins: number; // rounds where the market later moved toward chat's call
  marketWins: number; // rounds where the market moved the other way
  resolved: number; // total resolved calls
  winRate: number; // 0..100, how often the market moved chat's way
  streak: number; // current chat-led streak
}

export interface PinnedMarket {
  slug: string;
  label: string;
}

export interface Chyron {
  topic: string; // the "NOW DISCUSSING" lower-third headline
  guests: string[]; // guest name plates (e.g. Ansem, Banks)
}

export interface OverlayConfig {
  features: Record<OverlayFeature, boolean>;
  market: PinnedMarket | null; // null = auto-pick top crypto market
  chyron: Chyron; // broadcast lower-third (shown when features.lowerThird is on)
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  features: { index: true, candle: true, market: true, chat: true, chatters: true, wire: true, ticker: true, reactions: true, audio: true, news: true, lowerThird: false, scoreboard: true },
  market: null,
  chyron: { topic: "", guests: [] },
};

// What music the streamer is playing — relayed to the overlay for the waveform widget.
export interface NowPlaying {
  title: string;
  author?: string; // YouTube channel name, for on-stream crediting
  playing: boolean;
}

export type ServerEvent =
  | { type: "message"; data: ChatMessage }
  | { type: "history"; data: ChatMessage[] }
  | { type: "status"; data: SourceStatus[] }
  | { type: "hello"; data: { channels: ChannelConfig[]; overlayConfig: OverlayConfig; nowPlaying: NowPlaying | null; news: NewsItem[]; prices: PriceItem[]; watch: ChannelConfig | null; crowdScore: CrowdScore | null } }
  | { type: "reaction"; data: Reaction }
  | { type: "overlayConfig"; data: OverlayConfig }
  | { type: "nowPlaying"; data: NowPlaying | null }
  | { type: "watch"; data: ChannelConfig | null }
  | { type: "crowdScore"; data: CrowdScore | null }
  | { type: "newsItem"; data: NewsItem }
  | { type: "newsToast"; data: NewsItem }
  | { type: "prices"; data: PriceItem[] };

export const SRC_META: Record<Platform, { label: string; color: string; glyph: string }> = {
  twitch: { label: "Twitch", color: "var(--color-twitch)", glyph: "T" },
  kick: { label: "Kick", color: "var(--color-kick)", glyph: "K" },
  x: { label: "X", color: "var(--color-x)", glyph: "𝕏" },
  tape: { label: "Shared", color: "var(--color-accent)", glyph: "P" },
};

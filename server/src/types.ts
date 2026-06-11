export type Platform = "twitch" | "kick" | "x" | "tape"; // tape = native shared-chat post

export interface ChatMessage {
  id: string;
  platform: Platform;
  channel: string;
  user: string;
  color: string | null;
  badges: string[];
  text: string;
  ts: number; // unix ms
  amount?: number; // bits / gifted subs / tip value, if any
  cashtags?: string[]; // detected $TICKERs
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
  channel: string; // login / slug / handle
}

export interface Reaction {
  sound?: string;
  gif?: string;
  id: string;
  ts: number;
}

export interface NewsItem {
  id: string;
  kind: "tweet" | "news";
  handle?: string;
  name: string;
  text: string;
  url: string;
  source: string;
  ts: number;
  avatar?: string; // tweet author profile image URL (X), when available
}

export interface PriceItem {
  symbol: string;
  price: number;
  change: number;
  kind: "crypto" | "meme" | "stock";
}

export type OverlayFeature = "index" | "candle" | "market" | "chat" | "chatters" | "wire" | "ticker" | "reactions" | "audio" | "news" | "lowerThird" | "scoreboard";

// Persisted Crowd-vs-Market track record, summarized + relayed to the overlay.
export interface CrowdScore {
  chatWins: number;
  marketWins: number;
  resolved: number;
  winRate: number;
  streak: number;
}

export interface PinnedMarket {
  slug: string;
  label: string;
}

export interface Chyron {
  topic: string;
  guests: string[];
}

export interface OverlayConfig {
  features: Record<OverlayFeature, boolean>;
  market: PinnedMarket | null;
  chyron: Chyron; // broadcast lower-third (shown when features.lowerThird is on)
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  features: { index: true, candle: true, market: true, chat: true, chatters: true, wire: true, ticker: true, reactions: true, audio: true, news: true, lowerThird: false, scoreboard: true },
  market: null,
  chyron: { topic: "", guests: [] },
};

export interface NowPlaying {
  title: string;
  author?: string;
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

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChannelConfig, ChatMessage, CrowdScore, NewsItem, NowPlaying, OverlayConfig, PriceItem, Reaction, ServerEvent, SourceStatus } from "../lib/types";
import { DEFAULT_OVERLAY_CONFIG } from "../lib/types";

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${location.hostname}:8787`;
const MAX = 1500;

// Host token: control messages (channels/overlay/music/reactions) + the host chat
// badge are authorized with this. The streamer opens the dashboard at /app?key=<token>
// (persisted to localStorage); viewers never have it, so they can chat but cannot
// control the broadcast. Empty in local dev, where the server leaves auth open.
const HOST_TOKEN = (() => {
  try {
    const fromUrl = new URLSearchParams(location.search).get("key");
    if (fromUrl) localStorage.setItem("tape.hostKey", fromUrl);
    return fromUrl || localStorage.getItem("tape.hostKey") || "";
  } catch {
    return "";
  }
})();

export function useChatSocket() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statuses, setStatuses] = useState<SourceStatus[]>([]);
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [connected, setConnected] = useState(false);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(DEFAULT_OVERLAY_CONFIG);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [prices, setPrices] = useState<PriceItem[]>([]);
  const [watch, setWatchLocal] = useState<ChannelConfig | null>(null);
  const [crowdScore, setCrowdScore] = useState<CrowdScore | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bufRef = useRef<ChatMessage[]>([]);
  const reactionListeners = useRef<Set<(r: Reaction) => void>>(new Set());
  const newsToastListeners = useRef<Set<(n: NewsItem) => void>>(new Set());

  // Flush buffered messages on a fixed interval — robust even when the tab or an
  // OBS browser source is backgrounded (where requestAnimationFrame is paused).
  useEffect(() => {
    const id = setInterval(() => {
      const incoming = bufRef.current;
      if (!incoming.length) return;
      bufRef.current = [];
      setMessages((prev) => {
        const seen = new Set(prev.map((x) => x.id));
        const fresh: ChatMessage[] = [];
        for (const msg of incoming) {
          if (!seen.has(msg.id)) {
            seen.add(msg.id);
            fresh.push(msg);
          }
        }
        if (!fresh.length) return prev;
        let next = prev.concat(fresh);
        if (next.length > MAX) next = next.slice(next.length - MAX);
        return next;
      });
    }, 120);
    return () => clearInterval(id);
  }, []);

  const connect = useCallback(() => {
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    const prev = wsRef.current;
    if (prev) {
      prev.onopen = prev.onclose = prev.onmessage = null; // detach so a stale socket can't trigger reconnects
      try {
        prev.close();
      } catch {
        /* ignore */
      }
    }
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      if (wsRef.current === ws) setConnected(true);
    };
    ws.onclose = () => {
      if (wsRef.current !== ws) return; // superseded by a newer socket — ignore
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 1500);
    };
    ws.onmessage = (e) => {
      let ev: ServerEvent;
      try { ev = JSON.parse(e.data); } catch { return; }
      if (ev.type === "message") {
        bufRef.current.push(ev.data);
      } else if (ev.type === "history") {
        for (const m of ev.data) bufRef.current.push(m);
      } else if (ev.type === "status") {
        setStatuses(ev.data);
      } else if (ev.type === "hello") {
        setChannels(ev.data.channels);
        if (ev.data.overlayConfig) setOverlayConfig(ev.data.overlayConfig);
        setNowPlaying(ev.data.nowPlaying ?? null);
        if (ev.data.news) setNews(ev.data.news);
        if (ev.data.prices) setPrices(ev.data.prices);
        setWatchLocal(ev.data.watch ?? null);
        setCrowdScore(ev.data.crowdScore ?? null);
      } else if (ev.type === "crowdScore") {
        setCrowdScore(ev.data);
      } else if (ev.type === "prices") {
        setPrices(ev.data);
      } else if (ev.type === "overlayConfig") {
        setOverlayConfig(ev.data);
      } else if (ev.type === "nowPlaying") {
        setNowPlaying(ev.data);
      } else if (ev.type === "watch") {
        setWatchLocal(ev.data);
      } else if (ev.type === "newsItem") {
        setNews((prev) => [ev.data, ...prev.filter((n) => n.id !== ev.data.id)].slice(0, 40));
      } else if (ev.type === "newsToast") {
        for (const cb of newsToastListeners.current) cb(ev.data);
      } else if (ev.type === "reaction") {
        for (const cb of reactionListeners.current) cb(ev.data);
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  const send = useCallback((obj: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(HOST_TOKEN ? { ...obj, token: HOST_TOKEN } : obj));
    }
  }, []);

  const setServerChannels = useCallback(
    (ch: ChannelConfig[]) => send({ type: "setChannels", data: ch }),
    [send],
  );
  const clear = useCallback(() => setMessages([]), []);

  const sendReaction = useCallback((sound: string) => send({ type: "reaction", data: { sound } }), [send]);
  const sendGif = useCallback((gif: string) => send({ type: "reaction", data: { gif } }), [send]);
  const sendChat = useCallback(
    (user: string, text: string, host?: boolean) => send({ type: "chatSend", data: { user, text, host } }),
    [send],
  );
  const setServerOverlayConfig = useCallback(
    (cfg: OverlayConfig) => {
      setOverlayConfig(cfg); // optimistic so the streamer's toggles feel instant
      send({ type: "overlayConfig", data: cfg });
    },
    [send],
  );
  const sendNowPlaying = useCallback((np: NowPlaying | null) => send({ type: "nowPlaying", data: np }), [send]);
  const sendCrowdScore = useCallback((score: CrowdScore) => send({ type: "crowdScore", data: score }), [send]);
  const setWatch = useCallback(
    (c: ChannelConfig | null) => {
      setWatchLocal(c); // optimistic so the dashboard stream switch feels instant
      send({ type: "setWatch", data: c });
    },
    [send],
  );
  // subscribe to incoming reactions; returns an unsubscribe fn (transient, no re-render)
  const onReaction = useCallback((cb: (r: Reaction) => void) => {
    reactionListeners.current.add(cb);
    return () => {
      reactionListeners.current.delete(cb);
    };
  }, []);
  // subscribe to throttled news toasts (overlay) — transient, no re-render
  const onNewsToast = useCallback((cb: (n: NewsItem) => void) => {
    newsToastListeners.current.add(cb);
    return () => {
      newsToastListeners.current.delete(cb);
    };
  }, []);

  return {
    messages,
    statuses,
    channels,
    connected,
    overlayConfig,
    nowPlaying,
    news,
    prices,
    watch,
    crowdScore,
    setServerChannels,
    setServerOverlayConfig,
    sendNowPlaying,
    sendCrowdScore,
    setWatch,
    clear,
    sendReaction,
    sendGif,
    sendChat,
    onReaction,
    onNewsToast,
  };
}

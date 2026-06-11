import { useEffect, useRef, useState } from "react";
import { useChatSocket } from "./hooks/useChatSocket";
import { usePersisted } from "./hooks/usePersisted";
import { Feed, type FeedFilter } from "./components/Feed";
import { CommandPalette } from "./components/CommandPalette";
import { ResizeHandle } from "./components/ResizeHandle";
import { StatusBar } from "./components/StatusBar";
import { Sidebar } from "./components/Sidebar";
import { RightRail } from "./components/RightRail";
import { IndexBoard } from "./components/IndexBoard";
import { Atmosphere } from "./components/Atmosphere";
import { IconRail } from "./components/IconRail";
import { BottomBar } from "./components/BottomBar";
import { CandleChart } from "./components/CandleChart";
import { WatchPlayer } from "./components/WatchPlayer";
import { PolymarketTicker } from "./components/PolymarketTicker";
import { PriceTicker } from "./components/PriceTicker";
import { LineChart, Tv } from "lucide-react";
import { PlatformIcon, SegmentedControl } from "./components/ui";
import { ShareCard, type ShareMoment } from "./components/ShareCard";
import { RecapCard } from "./components/RecapCard";
import { Reactions } from "./components/Reactions";
import { setCustomBlocklist } from "./lib/moderation";
import { setTickerPrices } from "./lib/coins";
import { broadcastId } from "./lib/parseChannel";
import type { ChannelConfig, Platform } from "./lib/types";

export function Terminal() {
  const sock = useChatSocket();
  const [enabled, setEnabled] = usePersisted<Record<Platform, boolean>>("tape.enabled", {
    twitch: true,
    kick: true,
    x: true,
    tape: true,
  });
  const [tf, setTf] = usePersisted("tape.tf", 60);
  const [leftOpen, setLeftOpen] = usePersisted("tape.leftOpen", true);
  const [rightOpen, setRightOpen] = usePersisted("tape.rightOpen", true);
  const [leftW, setLeftW] = usePersisted("tape.leftW", 264);
  const [rightW, setRightW] = usePersisted("tape.rightW", 300);
  const [youtubeUrl, setYoutubeUrl] = usePersisted("tape.youtube", "");
  const [centerView, setCenterView] = usePersisted<"chart" | "watch">("tape.centerView", "chart");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>({ mode: "all", query: "" });
  const [cleanChat, setCleanChat] = usePersisted("tape.cleanChat", false);
  const [blockedWords, setBlockedWords] = usePersisted<string[]>("tape.blockedWords", []);
  const [savedChannels, setSavedChannels] = usePersisted<ChannelConfig[]>("tape.channels", []);

  // keep the moderation matcher in sync with the streamer's custom block list
  useEffect(() => {
    setCustomBlocklist(blockedWords);
  }, [blockedWords]);

  // feed live ticker prices into the cashtag-hover store (instant for top coins)
  useEffect(() => {
    setTickerPrices(sock.prices);
  }, [sock.prices]);

  // Restore persisted channels to the server once (re)connected. Only ever PUSH our
  // own saved set; never clear/seed when we have none — doing so used to wipe channels
  // another dashboard (or the overlay) had already configured, because on connect
  // sock.channels is briefly empty before the server's hello arrives.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (sock.connected && !restoredRef.current) {
      restoredRef.current = true;
      if (savedChannels.length) sock.setServerChannels(savedChannels);
    } else if (!sock.connected) {
      restoredRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sock.connected]);

  function addChannel(c: ChannelConfig) {
    const dup = sock.channels.some(
      (x) => x.platform === c.platform && x.channel.toLowerCase() === c.channel.toLowerCase(),
    );
    if (dup) return;
    const next = [...sock.channels, c];
    setSavedChannels(next);
    sock.setServerChannels(next);
  }
  function removeChannel(c: ChannelConfig) {
    const next = sock.channels.filter((x) => !(x.platform === c.platform && x.channel === c.channel));
    setSavedChannels(next);
    sock.setServerChannels(next);
  }
  // Bumped on "clear feed" to reset ref-held state (raffle entries, rounds).
  const [raffleKey, setRaffleKey] = useState(0);
  function clearAll() {
    sock.clear();
    setRaffleKey((k) => k + 1);
  }

  const messages = sock.messages;
  const [share, setShare] = useState<ShareMoment | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const channel = sock.channels.find((c) => c.platform !== "x")?.channel ?? sock.channels[0]?.channel ?? "";

  return (
    <div className="grid h-full grid-cols-1 grid-rows-[auto_auto_auto_1fr_auto_auto] bg-transparent text-fg">
      <Atmosphere />
      <StatusBar statuses={sock.statuses} connected={sock.connected} />
      <IndexBoard messages={messages} />
      <PriceTicker prices={sock.prices} />
      <div
        className="grid min-h-0 min-w-0 overflow-hidden"
        style={{
          gridTemplateColumns: `64px ${leftOpen ? leftW + "px" : "0px"} minmax(0, 1fr) ${rightOpen ? rightW + "px" : "0px"}`,
        }}
      >
        <IconRail
          leftOpen={leftOpen}
          rightOpen={rightOpen}
          onToggleLeft={() => setLeftOpen((v) => !v)}
          onToggleRight={() => setRightOpen((v) => !v)}
        />
        <div className="relative min-h-0 min-w-0 overflow-hidden">
          {leftOpen && <ResizeHandle side="left" onDelta={(dx) => setLeftW((w) => Math.max(210, Math.min(460, w + dx)))} />}
          <Sidebar
          channels={sock.channels}
          statuses={sock.statuses}
          enabled={enabled}
          setEnabled={setEnabled}
          onAdd={addChannel}
          onRemove={removeChannel}
          onClear={clearAll}
          youtubeUrl={youtubeUrl}
          setYoutubeUrl={setYoutubeUrl}
          onNowPlaying={sock.sendNowPlaying}
          cleanChat={cleanChat}
          setCleanChat={setCleanChat}
          blockedWords={blockedWords}
          setBlockedWords={setBlockedWords}
          overlayConfig={sock.overlayConfig}
          onOverlayConfig={sock.setServerOverlayConfig}
          messages={messages}
          channel={channel}
          onShare={setShare}
          onRecap={() => setRecapOpen(true)}
          onScore={sock.sendCrowdScore}
          />
        </div>
        <main className="grid min-h-0 min-w-0 grid-cols-1 overflow-hidden grid-rows-[320px_1fr] border-x border-line">
          <div className="relative min-h-0 overflow-hidden border-b border-line">
            <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-3 py-2">
              <SegmentedControl
                value={centerView}
                onChange={(v) => setCenterView(v)}
                options={[
                  { value: "chart", label: <span className="flex items-center gap-1"><LineChart size={11} /> Chat Hype</span> },
                  { value: "watch", label: <span className="flex items-center gap-1"><Tv size={11} /> Watch</span> },
                ]}
              />
              {centerView === "chart" && (
                <SegmentedControl
                  value={String(tf)}
                  onChange={(v) => setTf(Number(v))}
                  options={[
                    { value: "10", label: "10s" },
                    { value: "60", label: "1m" },
                    { value: "300", label: "5m" },
                    { value: "900", label: "15m" },
                  ]}
                />
              )}
              {/* stream picker — lives in the toolbar (above the iframe layer) so real
                  clicks always register. Selecting a channel shows it here AND on the overlay. */}
              {centerView === "watch" && (
                <div className="flex items-center gap-1">
                  {sock.channels
                    .filter((c) => c.platform === "twitch" || c.platform === "kick" || (c.platform === "x" && !!broadcastId(c.channel)))
                    .map((c) => {
                      const on = sock.watch?.platform === c.platform && sock.watch?.channel === c.channel;
                      const label = c.platform === "x" ? "X live" : c.channel;
                      return (
                        <button
                          key={c.platform + c.channel}
                          onClick={() => sock.setWatch(c)}
                          title={`Show ${label} on the overlay`}
                          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px] outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
                            on
                              ? "border-accent/60 bg-accent text-accent-ink"
                              : "border-line bg-elevated/70 text-fg-dim backdrop-blur hover:text-fg"
                          }`}
                        >
                          <PlatformIcon platform={c.platform} size={12} /> {label}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
            {/* Both stay mounted; we flip visibility with opacity/z-index (never unmount,
                never display:none) so the live stream keeps playing when you switch to the
                candle and back. An opacity-0 iframe stays "visible" to the player, so it
                does not pause. The chart layer is opaque (bg-base) to cover the video. */}
            <div
              className={`absolute inset-0 bg-base ${centerView === "chart" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"}`}
            >
              <CandleChart messages={messages} bucketSec={tf} />
            </div>
            <div
              className={`absolute inset-0 ${centerView === "watch" ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"}`}
            >
              <WatchPlayer channels={sock.channels} active={sock.watch} />
            </div>
          </div>
          <Feed
            messages={messages}
            enabled={enabled}
            cleanChat={cleanChat}
            onSend={sock.sendChat}
            allowHost
            filter={feedFilter}
            onClearFilter={() => setFeedFilter({ mode: "all", query: "" })}
          />
        </main>
        <div className="relative min-h-0 min-w-0 overflow-hidden">
          {rightOpen && <ResizeHandle side="right" onDelta={(dx) => setRightW((w) => Math.max(230, Math.min(480, w - dx)))} />}
          <RightRail key={raffleKey} messages={messages} news={sock.news} prices={sock.prices} onSound={sock.sendReaction} onGif={sock.sendGif} />
        </div>
      </div>
      <BottomBar connected={sock.connected} statuses={sock.statuses} count={messages.length} />
      <PolymarketTicker />
      {share && <ShareCard moment={share} onClose={() => setShare(null)} />}
      {recapOpen && <RecapCard messages={messages} channel={channel} onClose={() => setRecapOpen(false)} />}
      <Reactions onReaction={sock.onReaction} />
      <CommandPalette
        onFilter={(mode) => setFeedFilter((f) => ({ ...f, mode }))}
        onSearch={(query) => setFeedFilter((f) => ({ ...f, query }))}
        onClearFeed={clearAll}
      />
    </div>
  );
}

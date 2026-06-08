import { Tv } from "lucide-react";
import { useEffect, useRef } from "react";
import Hls from "hls.js";
import type { ChannelConfig } from "../lib/types";
import { HTTP_URL } from "../lib/server";
import { broadcastId } from "../lib/parseChannel";
import { EmptyState } from "./ui";

declare global {
  interface Window {
    Twitch?: any;
  }
}

// Load Twitch's JS Embed API once (cached promise).
let twitchScript: Promise<any> | null = null;
function loadTwitch(): Promise<any> {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  if (twitchScript) return twitchScript;
  twitchScript = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://player.twitch.tv/js/embed/v1.js";
    s.async = true;
    s.onload = () => resolve(window.Twitch);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return twitchScript;
}

/**
 * Twitch via the JS Embed API instead of a raw iframe — the iframe `autoplay`
 * param is unreliable (Twitch often loads paused), so we create the player with
 * muted+autoplay and then explicitly play() muted on READY, plus a few nudges if it
 * still loads paused. Muted playback is allowed by autoplay policies, so this starts
 * on its own in OBS and in normal browsers without a click.
 */
function TwitchEmbed({ channel, host }: { channel: string; host: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let player: any;
    let disposed = false;
    let nudges = 0;
    loadTwitch()
      .then((Twitch) => {
        if (disposed || !ref.current || !Twitch?.Player) return;
        ref.current.innerHTML = "";
        player = new Twitch.Player(ref.current, {
          channel: channel.replace(/^#/, ""),
          parent: [host],
          width: "100%",
          height: "100%",
          muted: true,
          autoplay: true,
        });
        const play = () => {
          try {
            player.setMuted(true);
            player.play();
          } catch {
            /* policy may still block; OBS + allowed browsers play fine */
          }
        };
        player.addEventListener(Twitch.Player.READY, play);
        // if it loaded paused, nudge a few times (capped so we never tight-loop)
        player.addEventListener(Twitch.Player.PAUSE, () => {
          if (nudges++ < 4) play();
        });
      })
      .catch(() => {});
    return () => {
      disposed = true;
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [channel, host]);
  return <div ref={ref} className="h-full w-full" />;
}

/**
 * X (Twitter) live broadcast via HLS. The pscp.tv video CDN sends no CORS header, so we
 * point hls.js at our server's keyless HLS proxy (/x-hls/<id>.m3u8) instead of the CDN
 * directly. Muted autoplay matches the Twitch/Kick players, so it starts on its own in
 * Chrome and OBS. Safari plays the proxied playlist natively.
 */
function XBroadcast({ bid, chrome }: { bid: string; chrome: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !bid) return;
    // ALWAYS start muted so autoplay is guaranteed — a normal browser blocks unmuted
    // autoplay, which would leave the video stuck "trying to play". Then, once it is really
    // playing, turn sound ON only for the overlay running inside OBS (OBS injects
    // window.obsstudio and allows unmuted playback). That overlay is the broadcast output
    // viewers hear. The dashboard/viewer keep controls to unmute by hand.
    const inOBS = typeof (window as unknown as { obsstudio?: unknown }).obsstudio !== "undefined";
    video.muted = true;
    const src = `${HTTP_URL}/x-hls/${bid}.m3u8`;
    const play = () => {
      const p = video.play();
      if (p && typeof p.then === "function") {
        p.then(() => { if (!chrome && inOBS) video.muted = false; }).catch(() => {});
      }
    };
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true, liveSyncDurationCount: 3, backBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, play);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src; // Safari native HLS
      video.addEventListener("loadedmetadata", play, { once: true });
    }
    return () => {
      if (hls) hls.destroy();
      video.removeAttribute("src");
      try { video.load(); } catch { /* ignore */ }
    };
  }, [bid, chrome]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      controls={chrome}
      className="h-full w-full bg-black object-contain"
    />
  );
}

/**
 * Watch the live stream inside the app — Twitch via its JS Embed API (reliable
 * autoplay), Kick via its iframe player. X has no free live embed. `parent` is the
 * current host (localhost in dev, the deploy domain in prod).
 *
 * Controlled + shared: `active` is the channel shown, the SAME selection across the
 * dashboard, overlay, and viewer (relayed via the server). The stream PICKER lives in
 * the dashboard toolbar (Terminal), not here, so its clicks aren't eaten by the
 * cross-origin iframe; this component just renders the selected stream.
 */
export function WatchPlayer({
  channels,
  active,
  chrome = true,
}: {
  channels: ChannelConfig[];
  active?: ChannelConfig | null;
  chrome?: boolean;
}) {
  const host = window.location.hostname;
  const embeddable = channels.filter(
    (c) => c.platform === "twitch" || c.platform === "kick" || (c.platform === "x" && !!broadcastId(c.channel)),
  );

  if (!embeddable.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState size={72}>add a Twitch, Kick, or X broadcast channel to watch the stream here</EmptyState>
      </div>
    );
  }

  // shown = the active target if it's still connected, else the first embeddable
  const shown =
    (active && embeddable.find((c) => c.platform === active.platform && c.channel === active.channel)) || embeddable[0];

  return (
    <div className="absolute inset-0 bg-black">
      {shown.platform === "twitch" ? (
        <TwitchEmbed key={`tw-${shown.channel}`} channel={shown.channel} host={host} />
      ) : shown.platform === "kick" ? (
        <iframe
          key={`kick-${shown.channel}`}
          src={`https://player.kick.com/${encodeURIComponent(shown.channel)}?muted=true&autoplay=true`}
          title={`Live stream: ${shown.channel} on kick`}
          className="h-full w-full"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          frameBorder={0}
        />
      ) : (
        <XBroadcast key={`x-${shown.channel}`} bid={broadcastId(shown.channel) || ""} chrome={chrome} />
      )}
      {chrome && (
        <span className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/70 backdrop-blur">
          <Tv size={10} /> watch
        </span>
      )}
    </div>
  );
}

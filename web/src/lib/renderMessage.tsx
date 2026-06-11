import { useState, type ReactNode } from "react";
import { getCoin, fmtPrice, type Coin } from "./coins";

// [emote:id:name] (Kick) | [temote:provider:id:name] (Twitch + 7TV/BTTV/FFZ) | $TICKER
const TOKEN = /\[emote:(\d+):([^\]]+)\]|\[temote:(\w+):([\w-]+):([^\]]+)\]|\$([A-Za-z]{2,6})\b/g;

/** Cashtag that shows a live price card on hover (CoinGecko, keyless). */
function Cashtag({ tag }: { tag: string }) {
  const [open, setOpen] = useState(false);
  const [coin, setCoin] = useState<Coin | null | "loading">("loading");
  const [started, setStarted] = useState(false);
  function enter() {
    setOpen(true);
    if (!started) {
      setStarted(true);
      getCoin(tag).then(setCoin);
    }
  }
  const up = coin && coin !== "loading" ? coin.change >= 0 : false;
  return (
    <span className="relative inline-block" onMouseEnter={enter} onMouseLeave={() => setOpen(false)}>
      <span className="cursor-default font-mono font-medium text-accent">{"$" + tag}</span>
      {open && (
        <span className="absolute bottom-full left-0 z-30 mb-1 block w-44 rounded-lg border border-line bg-surface p-2 text-left shadow-xl">
          <span className="flex items-center justify-between">
            <span className="font-mono text-[12px] font-bold text-fg">{"$" + tag}</span>
            {coin && coin !== "loading" && (
              <span className={`font-mono text-[11px] tabular-nums ${up ? "text-pos" : "text-neg"}`}>
                {up ? "▲" : "▼"}
                {Math.abs(coin.change).toFixed(2)}%
              </span>
            )}
          </span>
          <span className="mt-0.5 block font-mono text-[14px] font-semibold text-fg">
            {coin === "loading" ? "loading…" : coin ? `$${fmtPrice(coin.price)}` : "no live price"}
          </span>
          <a
            href={`https://www.coingecko.com/en/search?query=${encodeURIComponent(tag)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block font-mono text-[10px] text-accent hover:underline"
          >
            view on CoinGecko →
          </a>
        </span>
      )}
    </span>
  );
}

export function KickEmote({ id, name, size = 20 }: { id: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (err) return <span className="text-fg-dim">{name}</span>;
  return (
    <img
      src={`https://files.kick.com/emotes/${id}/fullsize`}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setErr(true)}
      className="mx-0.5 inline-block align-[-0.35em] object-contain"
      style={{ height: size, width: size }}
    />
  );
}

// Emote CDN per provider: Twitch first-party (tw) + 7TV + BetterTTV + FrankerFaceZ.
function emoteUrl(provider: string, id: string): string {
  switch (provider) {
    case "7tv":
      return `https://cdn.7tv.app/emote/${id}/2x.webp`;
    case "bttv":
      return `https://cdn.betterttv.net/emote/${id}/2x`;
    case "ffz":
      return `https://cdn.frankerfacez.com/emote/${id}/2`;
    default: // "tw" — Twitch first-party
      return `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`;
  }
}

export function Emote({ provider, id, name, size = 20 }: { provider: string; id: string; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  // many emote names are real words ("LUL", "Clap"), so the text fallback still reads fine
  if (err) return <span className="text-fg-dim">{name}</span>;
  return (
    <img
      src={emoteUrl(provider, id)}
      alt={name}
      title={name}
      loading="lazy"
      onError={() => setErr(true)}
      className="mx-0.5 inline-block align-[-0.35em] object-contain"
      style={{ height: size }}
    />
  );
}

/**
 * Plain-text form of a chat message: emote tokens collapse to their readable name,
 * cashtags keep their $. For surfaces that can't render emote images or React nodes
 * (canvas cards, TTS, exports), so raw [temote:...] tokens never leak to the viewer.
 */
export function plainMessageText(text: string): string {
  return (text || "")
    .replace(/\[emote:\d+:([^\]]+)\]/g, "$1")
    .replace(/\[temote:\w+:[\w-]+:([^\]]+)\]/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Tokenize chat text into React nodes: Kick + Twitch emotes -> <img>, cashtags -> accent. */
export function renderMessageText(text: string, emoteSize = 20): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      nodes.push(<KickEmote key={key++} id={m[1]} name={m[2]} size={emoteSize} />);
    } else if (m[3]) {
      nodes.push(<Emote key={key++} provider={m[3]} id={m[4]} name={m[5]} size={emoteSize} />);
    } else if (m[6]) {
      nodes.push(<Cashtag key={key++} tag={m[6].toUpperCase()} />);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

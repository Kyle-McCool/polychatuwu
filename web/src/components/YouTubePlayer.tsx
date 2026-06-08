import { useEffect, useRef, useState } from "react";
import {
  Play, Pause, Volume2, VolumeX, X, Radio, Search, ChevronDown,
  Coffee, Headphones, Waves, Piano, Wine, Music4, Sunset, Tv,
  Skull, Mic2, Drum, Heart, Guitar, Flame, Zap, Sparkles, Gamepad2, Leaf,
  type LucideIcon,
} from "lucide-react";
import { Input, Button, IconButton } from "./ui";
import { usePersisted } from "../hooks/usePersisted";
import { deDash } from "../lib/text";

function parseYouTube(input: string): { videoId?: string; listId?: string } | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    const listId = u.searchParams.get("list") || undefined;
    let videoId = u.searchParams.get("v") || undefined;
    if (!videoId && u.hostname.includes("youtu.be")) videoId = u.pathname.slice(1) || undefined;
    if (!videoId && u.pathname.startsWith("/embed/")) videoId = u.pathname.split("/embed/")[1];
    if (videoId || listId) return { videoId, listId };
    return null;
  } catch {
    return null;
  }
}

// ---- Genre taxonomy: icon + accent color per genre -------------------------
type GenreKey =
  | "lofi" | "chillhop" | "ambient" | "piano" | "jazz" | "classical"
  | "synthwave" | "retro" | "phonk" | "hiphop" | "trap" | "rnb"
  | "rock" | "metal" | "edm" | "pop" | "gaming" | "reggae";

const GENRES: Record<GenreKey, { name: string; color: string; Icon: LucideIcon }> = {
  lofi:      { name: "Lo-Fi",      color: "#a78bfa", Icon: Coffee },
  chillhop:  { name: "Chillhop",   color: "#2dd4bf", Icon: Headphones },
  ambient:   { name: "Ambient",    color: "#38bdf8", Icon: Waves },
  piano:     { name: "Piano",      color: "#e879f9", Icon: Piano },
  jazz:      { name: "Jazz",       color: "#f59e0b", Icon: Wine },
  classical: { name: "Classical",  color: "#eab308", Icon: Music4 },
  synthwave: { name: "Synthwave",  color: "#f472b6", Icon: Sunset },
  retro:     { name: "Retro",      color: "#fb7185", Icon: Tv },
  phonk:     { name: "Phonk",      color: "#8b5cf6", Icon: Skull },
  hiphop:    { name: "Hip-Hop",    color: "#fb923c", Icon: Mic2 },
  trap:      { name: "Trap",       color: "#ef4444", Icon: Drum },
  rnb:       { name: "R&B",        color: "#ec4899", Icon: Heart },
  rock:      { name: "Rock",       color: "#f43f5e", Icon: Guitar },
  metal:     { name: "Metal",      color: "#94a3b8", Icon: Flame },
  edm:       { name: "EDM",        color: "#22d3ee", Icon: Zap },
  pop:       { name: "Pop",        color: "#d946ef", Icon: Sparkles },
  gaming:    { name: "Gaming",     color: "#818cf8", Icon: Gamepad2 },
  reggae:    { name: "Reggae",     color: "#4ade80", Icon: Leaf },
};

// Popular 24/7 music livestreams — every ID verified live + embeddable.
type Station = { id: string; label: string; genre: GenreKey };
const STATIONS: Station[] = [
  { id: "7NOSDKb0HlU", label: "Lofi Paws",       genre: "lofi" },
  { id: "ByZGu229-yA", label: "College Music",   genre: "lofi" },
  { id: "5yx6BWlEVcY", label: "Chillhop",        genre: "chillhop" },
  { id: "S_MOd40zlYU", label: "Ambient Space",   genre: "ambient" },
  { id: "y6TZHLAzg5o", label: "Piano Fireplace", genre: "piano" },
  { id: "Dx5qFachd3A", label: "Jazz Piano",      genre: "piano" },
  { id: "3XbEUv_MCj0", label: "Jazz Lounge",     genre: "jazz" },
  { id: "fEvM-OUbaKs", label: "Coffee Jazz",     genre: "jazz" },
  { id: "DSGyEsJ17cI", label: "Rainy Jazz",      genre: "jazz" },
  { id: "bwZUs26HZI8", label: "Classical 24/7",  genre: "classical" },
  { id: "LSrrc7HKkZc", label: "New Retro FM",    genre: "synthwave" },
  { id: "4xDzrJKXOOY", label: "Nightride FM",    genre: "synthwave" },
  { id: "w9e6F0SM0hw", label: "80s & 90s",       genre: "retro" },
  { id: "WnCfvAMM9eY", label: "70s & 80s",       genre: "retro" },
  { id: "9hylBusqpX8", label: "Oldies Mix",      genre: "retro" },
  { id: "BuB9SaS2cWE", label: "Retro Hits",      genre: "retro" },
  { id: "PBF5SsJXCWw", label: "Phonk",           genre: "phonk" },
  { id: "2mTLe6uH6FI", label: "Kaito Shoma",     genre: "phonk" },
  { id: "cxAk5chqXkw", label: "Crownage",        genre: "phonk" },
  { id: "Oblb4xGO6k4", label: "Boom Bap",        genre: "hiphop" },
  { id: "6Jsnem7i848", label: "Hip-Hop Beats",   genre: "hiphop" },
  { id: "EA-6o1_vrsA", label: "Trap Beats",      genre: "trap" },
  { id: "SBnxFo7CjGU", label: "Smooth R&B",      genre: "rnb" },
  { id: "qVQ33JHKakg", label: "Chill R&B",       genre: "rnb" },
  { id: "iemujlJ3q_c", label: "Classic Rock",    genre: "rock" },
  { id: "tWTPGVIw1es", label: "Alt Rock",        genre: "rock" },
  { id: "CuroyKtk-fY", label: "Rock Radio",      genre: "rock" },
  { id: "KrExkKoN9y4", label: "Metal Station",   genre: "metal" },
  { id: "NJyCwdWT80c", label: "ChillYourMind",   genre: "edm" },
  { id: "3zmZkrlFHGg", label: "The Good Life",   genre: "edm" },
  { id: "b-bK2Vn3D38", label: "Pop Hits",        genre: "pop" },
  { id: "_tovPGmMv78", label: "Game OST",        genre: "gaming" },
  { id: "LOctprm4aPo", label: "JRPG Vibes",      genre: "gaming" },
  { id: "UKPK4D4D4zw", label: "Roots Reggae",    genre: "reggae" },
];

// genres that actually have stations, in taxonomy order
const ACTIVE_GENRES = (Object.keys(GENRES) as GenreKey[]).filter((g) => STATIONS.some((s) => s.genre === g));

type GenreOption = { value: GenreKey | "all"; name: string; count: number; color: string };
const GENRE_OPTIONS: GenreOption[] = [
  { value: "all", name: "All genres", count: STATIONS.length, color: "var(--color-accent)" },
  ...ACTIVE_GENRES.map((g) => ({
    value: g,
    name: GENRES[g].name,
    count: STATIONS.filter((s) => s.genre === g).length,
    color: GENRES[g].color,
  })),
];

let apiLoading: Promise<void> | null = null;
function loadYT(): Promise<void> {
  const w = window as any;
  if (w.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise<void>((resolve) => {
    w.onYouTubeIframeAPIReady = () => resolve();
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiLoading;
}

/** Animated equalizer — 4 bars. (Frozen in a backgrounded tab; lively in OBS/foreground.) */
function Equalizer({ color = "currentColor", bars = 4 }: { color?: string; bars?: number }) {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-full"
          style={{ background: color, animationDelay: `${i * 130}ms` }}
        />
      ))}
    </span>
  );
}

export function YouTubePlayer({
  url,
  onUrlChange,
  onNowPlaying,
  visible = true,
}: {
  url: string;
  onUrlChange: (u: string) => void;
  onNowPlaying?: (np: { title: string; author?: string; playing: boolean } | null) => void;
  visible?: boolean;
}) {
  const [input, setInput] = useState("");
  const [playing, setPlaying] = useState(false);
  const [vol, setVol] = useState(55);
  const [muted, setMuted] = useState(false);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [filter, setFilter] = usePersisted<GenreKey | "all">("tape.audioGenre", "all");
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  // latest callback + last good title/author, captured by ref so the YT event closures never go stale
  const npRef = useRef(onNowPlaying);
  npRef.current = onNowPlaying;
  const titleRef = useRef("");
  const authorRef = useRef("");

  useEffect(() => {
    if (!url) return;
    const parsed = parseYouTube(url);
    if (!parsed) return;
    let cancelled = false;

    loadYT().then(() => {
      if (cancelled || !wrapRef.current) return;
      const YT = (window as any).YT;
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* ignore */
      }
      wrapRef.current.innerHTML = "";
      const inner = document.createElement("div");
      wrapRef.current.appendChild(inner);

      const playerVars: any = { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 };
      if (parsed.listId) {
        playerVars.list = parsed.listId;
        playerVars.listType = "playlist";
      }
      playerRef.current = new YT.Player(inner, {
        height: "0",
        width: "0",
        videoId: parsed.videoId,
        playerVars,
        events: {
          onReady: (e: any) => {
            try {
              e.target.setVolume(vol);
              if (muted) e.target.mute();
              e.target.playVideo();
              const d = e.target.getVideoData?.() || {};
              const t = deDash(d.title || "");
              const a = deDash(d.author || "");
              if (t) {
                titleRef.current = t;
                authorRef.current = a;
                setTitle(t);
                setAuthor(a);
                npRef.current?.({ title: t, author: a, playing: true });
              }
            } catch {
              /* ignore */
            }
          },
          onStateChange: (e: any) => {
            const st = e.data;
            const isPlaying = st === YT.PlayerState.PLAYING;
            setPlaying(isPlaying);
            try {
              const d = e.target.getVideoData?.() || {};
              const t = deDash(d.title || "");
              const a = deDash(d.author || "");
              if (t) {
                titleRef.current = t;
                setTitle(t);
              }
              if (a) {
                authorRef.current = a;
                setAuthor(a);
              }
            } catch {
              /* ignore */
            }
            // relay to the overlay waveform on real playback transitions
            if (
              st === YT.PlayerState.PLAYING ||
              st === YT.PlayerState.PAUSED ||
              st === YT.PlayerState.ENDED
            ) {
              npRef.current?.({ title: titleRef.current, author: authorRef.current, playing: isPlaying });
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  function submit() {
    const v = input.trim();
    if (parseYouTube(v)) {
      onUrlChange(v);
      setInput("");
    }
  }
  function toggle() {
    const p = playerRef.current;
    if (!p) return;
    if (playing) p.pauseVideo?.();
    else p.playVideo?.();
  }
  function changeVol(n: number) {
    setVol(n);
    setMuted(n === 0);
    playerRef.current?.setVolume?.(n);
    if (n > 0) playerRef.current?.unMute?.();
  }
  function toggleMute() {
    const p = playerRef.current;
    const next = !muted;
    setMuted(next);
    if (next) p?.mute?.();
    else p?.unMute?.();
  }
  function clear() {
    try {
      playerRef.current?.stopVideo?.();
      playerRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    onUrlChange("");
    setTitle("");
    setAuthor("");
    setPlaying(false);
    titleRef.current = "";
    authorRef.current = "";
    npRef.current?.(null);
  }

  const activeId = parseYouTube(url)?.videoId;
  const activeStation = STATIONS.find((s) => s.id === activeId);
  const activeGenre = activeStation ? GENRES[activeStation.genre] : null;
  const accent = activeGenre?.color ?? "var(--color-accent)";
  const NowIcon = activeGenre?.Icon ?? Radio;

  const q = query.trim().toLowerCase();
  const shown = STATIONS.filter((s) => {
    if (filter !== "all" && s.genre !== filter) return false;
    if (q && !(`${s.label} ${GENRES[s.genre].name}`.toLowerCase().includes(q))) return false;
    return true;
  });
  const groups = (filter === "all" && !q ? ACTIVE_GENRES : [...new Set(shown.map((s) => s.genre))])
    .map((g) => ({ g, list: shown.filter((s) => s.genre === g) }))
    .filter((x) => x.list.length > 0);

  return (
    <>
      {/* the actual player — ALWAYS mounted (even when this tab is hidden) so music
          keeps playing in the background as the streamer switches tabs */}
      <div ref={wrapRef} className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0" aria-hidden />
      {visible && (
        <section>
          <div className="mb-2.5 flex items-end justify-between px-1">
            <h3 className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
              <Radio size={12} /> Stream audio
            </h3>
            <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-fg-muted">
              {ACTIVE_GENRES.length} genres · {STATIONS.length} stations
            </span>
          </div>

          {/* NOW PLAYING */}
          {url && (
            <div
              className="relative mb-3 overflow-hidden rounded-xl border p-3"
              style={{ borderColor: `${accent}40`, background: `linear-gradient(135deg, ${accent}26, ${accent}0a 70%)` }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-lg"
                  style={{ background: `${accent}33`, color: accent }}
                >
                  {playing ? <Equalizer color={accent} /> : <NowIcon size={20} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider"
                      style={{ background: `${accent}26`, color: accent }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} /> Live
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-fg-muted">
                      {activeGenre?.name ?? "Custom"}
                    </span>
                  </div>
                  <div className="truncate text-sm font-semibold text-fg">
                    {activeStation?.label ?? "Custom stream"}
                  </div>
                  <div className="truncate text-[11px] text-fg-dim" title={title}>
                    {title || "loading…"}
                  </div>
                  {author && <div className="truncate text-[10px] text-fg-muted" title={author}>{author}</div>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={toggle}
                  aria-label={playing ? "Pause" : "Play"}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white transition active:scale-95"
                  style={{ background: accent }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
                </button>
                <IconButton label={muted ? "Unmute" : "Mute"} size={28} onClick={toggleMute}>
                  {muted || vol === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </IconButton>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : vol}
                  onChange={(e) => changeVol(Number(e.target.value))}
                  className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15"
                  style={{ accentColor: accent }}
                  aria-label="Volume"
                />
                <IconButton label="Stop" size={28} onClick={clear}>
                  <X size={14} />
                </IconButton>
              </div>
            </div>
          )}

          {/* SEARCH + GENRE FILTER */}
          <div className="relative mb-2">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search stations…"
              className="w-full !pl-8"
            />
          </div>

          <div className="mb-3">
            <GenreSelect value={filter} options={GENRE_OPTIONS} onChange={setFilter} />
          </div>

          {/* STATION GRID (grouped by genre) — flows in the sidebar's single scroll */}
          <div className="flex flex-col gap-3">
            {groups.length === 0 && (
              <p className="px-1 py-6 text-center font-mono text-[11px] text-fg-muted">no stations match “{query}”</p>
            )}
            {groups.map(({ g, list }) => {
              const G = GENRES[g];
              return (
                <div key={g}>
                  <div className="mb-1.5 flex items-center gap-1.5 px-1">
                    <G.Icon size={11} className="shrink-0" />
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider" style={{ color: G.color }}>
                      {G.name}
                    </span>
                    <span className="font-mono text-[9px] text-fg-muted">{list.length}</span>
                    <span className="ml-1 h-px flex-1" style={{ background: `${G.color}22` }} />
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {list.map((s) => {
                      const active = activeId === s.id;
                      return (
                        <button
                          key={s.id}
                          data-station={s.id}
                          onClick={() => onUrlChange(`https://www.youtube.com/watch?v=${s.id}`)}
                          title={s.label}
                          className="group relative flex items-center gap-2 overflow-hidden rounded-lg border p-2 text-left outline-none transition hover:-translate-y-px focus-visible:ring-2"
                          style={{
                            borderColor: active ? G.color : `${G.color}26`,
                            background: active
                              ? `${G.color}1f`
                              : `linear-gradient(135deg, ${G.color}12, transparent 75%)`,
                          }}
                        >
                          <span
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition group-hover:scale-105"
                            style={{ background: `${G.color}26`, color: G.color }}
                          >
                            {active && playing ? <Equalizer color={G.color} bars={3} /> : <G.Icon size={15} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-semibold leading-tight text-fg">{s.label}</span>
                            <span className="block truncate font-mono text-[9px] uppercase tracking-wide text-fg-muted">
                              {active ? (playing ? "now playing" : "paused") : G.name}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* CUSTOM URL (secondary) */}
          <div className="mt-3 border-t border-white/8 pt-3">
            <p className="mb-1.5 px-1 font-mono text-[9px] uppercase tracking-[0.12em] text-fg-muted">
              or paste any link
            </p>
            <div className="flex gap-1.5">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="YouTube link / playlist"
                className="min-w-0 flex-1"
              />
              <Button variant="secondary" onClick={submit} aria-label="Load audio" icon={<Play size={14} />} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/** Fully theme-matched genre dropdown (native <select> popups can't be styled). */
function GenreSelect({
  value,
  options,
  onChange,
}: {
  value: GenreKey | "all";
  options: GenreOption[];
  onChange: (v: GenreKey | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-elevated/60 px-2.5 font-mono text-xs text-fg outline-none transition hover:border-accent/40 focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: current.color }} />
          <span className="truncate">{current.name}</span>
          <span className="shrink-0 text-fg-muted">· {current.count}</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-fg-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-9 z-30 max-h-64 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-xl"
        >
          {options.map((o) => {
            const sel = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={sel}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left font-mono text-xs outline-none transition ${
                  sel ? "bg-accent/15 text-accent" : "text-fg-dim hover:bg-elevated hover:text-fg"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 truncate">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />
                  <span className="truncate">{o.name}</span>
                </span>
                <span className="shrink-0 text-fg-muted">{o.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

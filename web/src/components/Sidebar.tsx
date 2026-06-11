import { useState, type ReactNode } from "react";
import { Plus, Trash2, X, ShieldCheck, Clapperboard } from "lucide-react";
import type { ChannelConfig, ChatMessage, OverlayConfig, Platform, SourceStatus } from "../lib/types";
import { parseChannelInput } from "../lib/parseChannel";
import { BUILTIN_SLUR_COUNT, SCAM_PATTERN_COUNT } from "../lib/wordlist";
import { PlatformIcon, Button, IconButton, Switch, Input, SegmentedControl } from "./ui";
import { YouTubePlayer } from "./YouTubePlayer";
import { OverlayControls } from "./OverlayControls";
import { CrowdVsMarket } from "./CrowdVsMarket";
import type { ShareMoment } from "./ShareCard";
import type { CrowdScore } from "../lib/types";
import { usePersisted } from "../hooks/usePersisted";

const SOURCES: { id: Platform; label: string }[] = [
  { id: "twitch", label: "Twitch" },
  { id: "kick", label: "Kick" },
  { id: "x", label: "X" },
];

// Big, near-daily channels so a fresh clone is one click away from a live, busy chat.
// The contest channels are pinned first: FaZe Banks' Twitch (where the Market Bubble
// show airs), Polymarket on Kick, and Market Bubble on X. The rest are huge daily
// streamers as reliable fallbacks. Suggestions only: clicking adds the channel like any
// other, and if one is offline you just pick another.
const SUGGESTED: Record<Platform, { channel: string; label: string }[]> = {
  twitch: [
    { channel: "fazebanks", label: "FaZe Banks" },
    { channel: "kaicenat", label: "Kai Cenat" },
    { channel: "xqc", label: "xQc" },
    { channel: "caseoh_", label: "CaseOh" },
    { channel: "jynxzi", label: "Jynxzi" },
    { channel: "caedrel", label: "Caedrel" },
    { channel: "zackrawrr", label: "Asmongold" },
  ],
  kick: [
    { channel: "polymarket", label: "Polymarket" },
    { channel: "adinross", label: "Adin Ross" },
    { channel: "xqc", label: "xQc" },
    { channel: "trainwreckstv", label: "Trainwreck" },
    { channel: "westcol", label: "WestCol" },
    { channel: "n3on", label: "N3on" },
    { channel: "mellstroy", label: "Mellstroy" },
  ],
  x: [
    { channel: "MarketBubble", label: "Market Bubble" },
    { channel: "blknoiz06", label: "Ansem" },
    { channel: "Banks", label: "FaZe Banks" },
    { channel: "Polymarket", label: "Polymarket" },
    { channel: "cobie", label: "Cobie" },
  ],
  tape: [],
};

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 px-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
      {children}
    </h3>
  );
}

// X channels are stored as full URLs — show a compact label in the list.
function channelLabel(c: ChannelConfig): string {
  if (c.platform !== "x") return c.channel;
  const m = c.channel.match(/(?:x\.com|twitter\.com)\/(@?[A-Za-z0-9_]+)/i);
  const who = m && !["i", "home"].includes(m[1].toLowerCase()) ? `@${m[1].replace(/^@/, "")}` : "post";
  return c.channel.includes("/status/")
    ? `${who} · post`
    : /\/i\/(broadcasts|spaces)\//i.test(c.channel)
      ? `${who} · live`
      : who;
}

const STATE_DOT: Record<string, string> = {
  live: "var(--color-pos)",
  connecting: "var(--color-warn)",
  error: "var(--color-neg)",
  offline: "var(--color-fg-muted)",
};

type Tab = "channels" | "overlay" | "bet" | "audio";

export function Sidebar({
  channels,
  statuses,
  enabled,
  setEnabled,
  onAdd,
  onRemove,
  onClear,
  youtubeUrl,
  setYoutubeUrl,
  onNowPlaying,
  cleanChat,
  setCleanChat,
  blockedWords,
  setBlockedWords,
  overlayConfig,
  onOverlayConfig,
  messages,
  channel,
  onShare,
  onRecap,
  onScore,
}: {
  channels: ChannelConfig[];
  statuses: SourceStatus[];
  enabled: Record<Platform, boolean>;
  setEnabled: (e: Record<Platform, boolean>) => void;
  onAdd: (c: ChannelConfig) => void;
  onRemove: (c: ChannelConfig) => void;
  onClear: () => void;
  youtubeUrl: string;
  setYoutubeUrl: (u: string) => void;
  onNowPlaying: (np: { title: string; author?: string; playing: boolean } | null) => void;
  cleanChat: boolean;
  setCleanChat: (b: boolean) => void;
  blockedWords: string[];
  setBlockedWords: (w: string[]) => void;
  overlayConfig: OverlayConfig;
  onOverlayConfig: (c: OverlayConfig) => void;
  messages: ChatMessage[];
  channel: string;
  onShare: (m: ShareMoment) => void;
  onRecap: () => void;
  onScore: (s: CrowdScore) => void;
}) {
  const [platform, setPlatform] = useState<Platform>("twitch");
  const [val, setVal] = useState("");
  const [wordsText, setWordsText] = useState(blockedWords.join(", "));
  const [tab, setTab] = usePersisted<Tab>("tape.leftTab", "channels");

  function commitWords() {
    setBlockedWords(
      wordsText
        .split(/[\n,]+/)
        .map((w) => w.trim())
        .filter(Boolean),
    );
  }

  function add() {
    const parsed = parseChannelInput(val, platform);
    if (!parsed) return;
    onAdd(parsed);
    setVal("");
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      onClick={() => setTab(id)}
      role="tab"
      aria-selected={tab === id}
      className={`shrink-0 rounded-md px-1.5 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-tight outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        tab === id ? "bg-accent text-accent-ink shadow-sm" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <aside className="flex h-full min-h-0 flex-col bg-transparent">
      <div className="px-3 pt-3">
        <div
          role="tablist"
          aria-label="Stream controls"
          className="flex items-center justify-between gap-1 rounded-lg border border-line bg-elevated/40 p-1"
        >
          {tabBtn("channels", "Channels")}
          {tabBtn("overlay", "Overlay")}
          {tabBtn("bet", "Bet")}
          {tabBtn("audio", "Audio")}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-4">
        <div className={tab === "channels" ? "flex flex-col gap-6" : "hidden"}>
            <section>
              <SectionTitle>Sources</SectionTitle>
              <div className="flex flex-col">
                {SOURCES.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md px-2 py-1.5 transition hover:bg-elevated/50"
                  >
                    <span className="flex items-center gap-2.5">
                      <PlatformIcon platform={s.id} size={15} />
                      <span className="text-sm text-fg">{s.label}</span>
                    </span>
                    <Switch
                      checked={enabled[s.id]}
                      onChange={(v) => setEnabled({ ...enabled, [s.id]: v })}
                      label={`${s.label} visibility`}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle>Add channel</SectionTitle>
              <div className="flex flex-col gap-2">
                <SegmentedControl
                  value={platform}
                  onChange={setPlatform}
                  options={[
                    { value: "twitch", label: <span className="flex items-center gap-1.5"><PlatformIcon platform="twitch" size={12} /> Twitch</span> },
                    { value: "kick", label: <span className="flex items-center gap-1.5"><PlatformIcon platform="kick" size={12} /> Kick</span> },
                    { value: "x", label: <span className="flex items-center gap-1.5"><PlatformIcon platform="x" size={11} /> X</span> },
                  ]}
                />
                <div className="flex gap-1.5">
                  <div className="relative min-w-0 flex-1">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                      <PlatformIcon platform={platform} size={14} />
                    </span>
                    <Input
                      value={val}
                      onChange={(e) => setVal(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && add()}
                      placeholder={platform === "x" ? "paste X post / broadcast URL" : "channel or paste URL"}
                      aria-label="Channel name or URL"
                      className="w-full pl-8"
                    />
                  </div>
                  <Button variant="primary" onClick={add} aria-label="Add channel" icon={<Plus size={16} strokeWidth={2.5} />} className="h-9 w-9 shrink-0 px-0" />
                </div>
                {platform === "x" && (
                  <p className="px-1 font-mono text-[10px] leading-relaxed text-fg-muted">
                    X has no chat API, so we scrape it. Paste the <span className="text-fg-dim">live post/tweet URL</span>{" "}
                    (its replies = the chat); that works with no login. If X walls it, run{" "}
                    <span className="text-accent">cd server &amp;&amp; npm run x-login</span> once.
                  </p>
                )}
                {SUGGESTED[platform].length > 0 && (
                  <div className="mt-1">
                    <p className="mb-1.5 px-0.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted">
                      {channels.length === 0 ? "Click one to go live" : "Suggested"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED[platform]
                        .filter(
                          (sug) =>
                            !channels.some(
                              (c) =>
                                c.platform === platform &&
                                c.channel.toLowerCase().includes(sug.channel.toLowerCase()),
                            ),
                        )
                        .map((sug) => (
                          <button
                            key={sug.channel}
                            onClick={() => {
                              const parsed = parseChannelInput(sug.channel, platform);
                              if (parsed) onAdd(parsed);
                            }}
                            title={`Add ${sug.label}`}
                            className="flex items-center gap-1.5 rounded-full border border-line bg-elevated/60 px-2.5 py-1 text-[12px] text-fg-dim outline-none transition hover:border-accent/50 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/50"
                          >
                            <PlatformIcon platform={platform} size={11} /> {sug.label}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-col gap-1">
                {channels.length === 0 && <p className="px-1 font-mono text-[11px] text-fg-muted">No channels yet</p>}
                {channels.map((c) => {
                  const st = statuses.find(
                    (s) =>
                      s.platform === c.platform &&
                      (s.channel === c.channel || c.channel.toLowerCase().includes(s.channel.toLowerCase())),
                  );
                  return (
                    <div key={c.platform + c.channel} className="group rounded-md border border-line bg-elevated/40 px-2 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: STATE_DOT[st?.state ?? "offline"] }}
                            title={st?.state ?? "offline"}
                          />
                          <PlatformIcon platform={c.platform} size={13} />
                          <span className="truncate text-sm text-fg-dim" title={c.channel}>
                            {channelLabel(c)}
                          </span>
                        </span>
                        <IconButton
                          label="Remove channel"
                          size={22}
                          onClick={() => onRemove(c)}
                          className="opacity-0 transition group-hover:opacity-100"
                        >
                          <X size={13} />
                        </IconButton>
                      </div>
                      {st?.state === "error" && st.detail && (
                        <p className="mt-1 pl-3.5 font-mono text-[10px] leading-tight text-neg">{st.detail}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="border-t border-line pt-4">
              <div className="flex items-center justify-between px-1 py-0.5">
                <span className="flex items-center gap-1.5 text-sm text-fg-dim" title="Hide slurs and spam-bot messages from the feed">
                  <ShieldCheck size={14} className="text-pos" /> Clean chat
                </span>
                <Switch checked={cleanChat} onChange={setCleanChat} label="Clean chat (hide spam &amp; slurs)" />
              </div>
              {cleanChat && (
                <div className="px-1">
                  <textarea
                    value={wordsText}
                    onChange={(e) => setWordsText(e.target.value)}
                    onBlur={commitWords}
                    placeholder="your own banned words, comma-separated…"
                    rows={2}
                    spellCheck={false}
                    className="mt-2 w-full resize-y rounded-md border border-line bg-elevated/40 px-2 py-1.5 font-mono text-[11px] text-fg outline-none transition placeholder:text-fg-muted focus:border-accent/50"
                  />
                  <p className="mt-1 font-mono text-[10px] leading-relaxed text-fg-muted">
                    hiding <span className="text-fg-dim">{BUILTIN_SLUR_COUNT}</span> built-in slurs +{" "}
                    <span className="text-fg-dim">{SCAM_PATTERN_COUNT}</span> scam patterns
                    {blockedWords.length > 0 && (
                      <>
                        {" "}+ <span className="text-accent">{blockedWords.length}</span> of yours
                      </>
                    )}
                  </p>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={onClear} icon={<Trash2 size={14} />} className="mt-2 justify-start">
                Clear feed
              </Button>
            </section>
        </div>

        <div className={tab === "overlay" ? "flex flex-col gap-5" : "hidden"}>
          <OverlayControls config={overlayConfig} onChange={onOverlayConfig} />
        </div>

        {/* BET — the Crowd vs Market console (pin a Polymarket bet, run the chat poll) */}
        <div className={tab === "bet" ? "flex flex-col gap-5" : "hidden"}>
          <CrowdVsMarket
            messages={messages}
            channel={channel}
            onShare={onShare}
            onScore={onScore}
            config={overlayConfig}
            onConfig={onOverlayConfig}
          />
          <section className="border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={onRecap} icon={<Clapperboard size={14} />} className="w-full justify-center">
              Generate stream recap
            </Button>
            <p className="mt-1.5 px-1 font-mono text-[9px] leading-relaxed text-fg-muted">
              a shareable card of tonight: chat vs market record, peak hype moment, totals.
            </p>
          </section>
        </div>

        {/* always mounted so music persists across tabs; only the controls show on Audio */}
        <YouTubePlayer url={youtubeUrl} onUrlChange={setYoutubeUrl} onNowPlaying={onNowPlaying} visible={tab === "audio"} />
      </div>
    </aside>
  );
}

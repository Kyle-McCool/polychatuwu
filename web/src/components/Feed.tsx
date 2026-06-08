import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Platform } from "../lib/types";
import { MessageRow } from "./MessageRow";
import { isJunk, isQuestion } from "../lib/moderation";
import { EmptyState } from "./ui";
import { usePersisted } from "../hooks/usePersisted";

export type FilterMode = "all" | "mentions" | "cashtags" | "links" | "questions";
export interface FeedFilter {
  mode: FilterMode;
  query: string;
}
const FILTER_LABEL: Record<FilterMode, string> = {
  all: "all",
  mentions: "@ mentions",
  cashtags: "$ cashtags",
  links: "links",
  questions: "questions",
};

export function Feed({
  messages,
  enabled,
  cleanChat = false,
  onSend,
  allowHost = false,
  filter,
  onClearFilter,
}: {
  messages: ChatMessage[];
  enabled: Record<Platform, boolean>;
  cleanChat?: boolean;
  onSend?: (user: string, text: string, host?: boolean) => void;
  allowHost?: boolean;
  filter?: FeedFilter;
  onClearFilter?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevLastId = useRef("");
  const [pinned, setPinned] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [handle, setHandle] = usePersisted("tape.handle", "");
  const [draft, setDraft] = useState("");
  const [asHost, setAsHost] = usePersisted("tape.asHost", true);

  const fmode = filter?.mode ?? "all";
  const fq = (filter?.query ?? "").toLowerCase();
  const filterActive = fmode !== "all" || !!fq;
  // native shared-chat posts (platform "tape") always show; platform feeds honor the toggle
  const filtered = messages.filter((m) => {
    if (!(m.platform === "tape" || enabled[m.platform])) return false;
    if (cleanChat && isJunk(m.text)) return false;
    if (fmode === "mentions" && !/@\w/.test(m.text)) return false;
    if (fmode === "cashtags" && !(m.cashtags && m.cashtags.length)) return false;
    if (fmode === "links" && !/https?:\/\//i.test(m.text)) return false;
    if (fmode === "questions" && !isQuestion(m.text)) return false;
    if (fq && !m.text.toLowerCase().includes(fq) && !m.user.toLowerCase().includes(fq)) return false;
    return true;
  });
  // Window the DOM to the most recent rows so a firehose can't saturate the
  // main thread (full list virtualization lands in the polish pass).
  const RENDER_CAP = 200;
  const visible = filtered.length > RENDER_CAP ? filtered.slice(filtered.length - RENDER_CAP) : filtered;
  const lastId = visible.length ? visible[visible.length - 1].id : "";
  const hasMessages = filtered.length > 0;

  // mirror `pinned` into a ref so the ResizeObserver below can read it live
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  // Stick to the bottom on each new message. Keyed on the LAST message id, NOT the
  // length: the client buffer is capped (MAX in useChatSocket), so once it fills, the
  // length stops growing and a length-keyed effect never fires again — that was the
  // stall. setNewCount(0) no-ops when already 0 (React bailout), so this stays cheap.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinned) {
      el.scrollTop = el.scrollHeight;
      setNewCount(0);
    } else if (prevLastId.current) {
      const idx = filtered.findIndex((m) => m.id === prevLastId.current);
      const added = idx === -1 ? 1 : filtered.length - 1 - idx;
      if (added > 0) setNewCount((n) => n + added);
    }
    prevLastId.current = lastId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, pinned]);

  // Emote images load AFTER the scroll above already ran and reflow a row taller (a
  // line wraps once the images get their width), which would leave us a notch above
  // the bottom. A ResizeObserver re-pins to the bottom on any content-height change.
  // Re-subscribed when the row container first mounts (empty -> has messages).
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [hasMessages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom !== pinned) setPinned(atBottom);
    if (atBottom && newCount) setNewCount(0);
  }

  function jump() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setPinned(true);
    setNewCount(0);
  }

  function send() {
    const t = draft.trim();
    if (!t || !onSend) return;
    const host = allowHost && asHost;
    onSend(handle.trim() || (host ? "Host" : "guest"), t, host);
    setDraft("");
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col">
      {filterActive && (
        <div className="flex shrink-0 items-center justify-between border-b border-white/8 bg-accent/10 px-3 py-1 font-mono text-[11px] text-accent">
          <span className="truncate">
            filter: {fmode !== "all" ? FILTER_LABEL[fmode] : ""}
            {fmode !== "all" && fq ? " · " : ""}
            {fq ? `"${fq}"` : ""} <span className="text-fg-muted">({filtered.length})</span>
          </span>
          <button onClick={onClearFilter} className="shrink-0 hover:underline">
            clear ✕
          </button>
        </div>
      )}
      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState size={96}>waiting for chat… add a channel and the tape starts rolling</EmptyState>
          </div>
        ) : (
          <div ref={contentRef}>
            {visible.map((m) => <MessageRow key={m.id} m={m} />)}
          </div>
        )}
      </div>

      {!pinned && newCount > 0 && (
        <button
          onClick={jump}
          className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full border border-accent/40 bg-elevated px-3 py-1.5 font-mono text-xs text-accent shadow-lg backdrop-blur transition hover:bg-overlay"
        >
          {newCount} new ↓
        </button>
      )}

      {/* native shared chat — the streamer (and any viewer on the dashboard) posts here */}
      {onSend && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className={`flex shrink-0 items-center gap-1.5 border-t border-white/8 px-2 py-1.5 backdrop-blur ${
            allowHost && asHost ? "bg-accent/[0.06]" : "bg-surface/50"
          }`}
        >
          {allowHost && (
            <button
              type="button"
              onClick={() => setAsHost((v) => !v)}
              title="Post as HOST. Your reply pops on the stream overlay for every viewer, on any platform."
              className={`shrink-0 rounded-md px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider transition ${
                asHost ? "bg-accent text-accent-ink" : "border border-white/15 text-fg-muted hover:text-fg"
              }`}
            >
              Host
            </button>
          )}
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="name"
            maxLength={24}
            aria-label="Your display name"
            className="w-20 shrink-0 rounded-md border border-white/10 bg-elevated/60 px-2 py-1 font-mono text-[11px] text-fg outline-none placeholder:text-fg-muted focus:border-accent/50"
          />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={allowHost && asHost ? "reply to all viewers, shows on stream…" : "message the shared chat…"}
            maxLength={280}
            aria-label="Message the shared chat"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-elevated/60 px-2.5 py-1 text-[13px] text-fg outline-none placeholder:text-fg-muted focus:border-accent/50"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="shrink-0 rounded-md bg-accent px-3 py-1 text-[12px] font-semibold text-accent-ink transition hover:brightness-110 active:brightness-95 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

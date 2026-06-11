import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, List, AtSign, DollarSign, Link2, HelpCircle, Trash2 } from "lucide-react";
import type { FilterMode } from "./Feed";

type Cmd = { id: string; label: string; icon: ReactNode; run: () => void };

/** ⌘K command palette — search the feed + quick filters (competitor-parity power tool). */
export function CommandPalette({
  onFilter,
  onSearch,
  onClearFeed,
}: {
  onFilter: (mode: FilterMode) => void;
  onSearch: (query: string) => void;
  onClearFeed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // keep the highlighted row scrolled into view as you arrow through
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!open) return null;
  const close = () => setOpen(false);

  const cmds: Cmd[] = [
    { id: "all", label: "Filter: all messages", icon: <List size={14} />, run: () => { onFilter("all"); onSearch(""); close(); } },
    { id: "mentions", label: "Filter: @ mentions", icon: <AtSign size={14} />, run: () => { onFilter("mentions"); close(); } },
    { id: "cashtags", label: "Filter: $ cashtags", icon: <DollarSign size={14} />, run: () => { onFilter("cashtags"); close(); } },
    { id: "links", label: "Filter: links only", icon: <Link2 size={14} />, run: () => { onFilter("links"); close(); } },
    { id: "questions", label: "Filter: questions", icon: <HelpCircle size={14} />, run: () => { onFilter("questions"); close(); } },
    { id: "clear", label: "Clear feed", icon: <Trash2 size={14} />, run: () => { onClearFeed(); close(); } },
  ];
  const ql = q.trim().toLowerCase();
  const shown = ql ? cmds.filter((c) => c.label.toLowerCase().includes(ql)) : cmds;
  const search = () => {
    if (q.trim()) {
      onSearch(q.trim());
      close();
    }
  };

  // one keyboard-navigable list: the live "search the feed" row (when typing), then commands
  const items: { id: string; icon: ReactNode; label: ReactNode; run: () => void; accent?: boolean }[] = [
    ...(q.trim()
      ? [{
          id: "__search",
          icon: <Search size={14} className="text-accent" />,
          label: (<>Search feed for&nbsp;<span className="font-semibold text-accent">"{q.trim()}"</span></>),
          run: search,
          accent: true,
        }]
      : []),
    ...shown.map((c) => ({ id: c.id, icon: <span className="text-fg-muted">{c.icon}</span>, label: c.label as ReactNode, run: c.run })),
  ];
  const cur = Math.min(sel, Math.max(0, items.length - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh] backdrop-blur-sm" onClick={close}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Search size={15} className="text-fg-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); items[cur]?.run(); }
            }}
            placeholder="Search the feed or run a command…"
            className="flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-muted"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
          {items.length === 0 && (
            <p className="px-2.5 py-3 text-center font-mono text-[11px] text-fg-muted">No commands match.</p>
          )}
          {items.map((it, i) => (
            <button
              key={it.id}
              data-idx={i}
              onMouseMove={() => setSel(i)}
              onClick={it.run}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none transition ${
                cur === i ? "bg-elevated text-fg" : it.accent ? "text-fg" : "text-fg-dim"
              }`}
            >
              {it.icon} {it.label}
            </button>
          ))}
        </div>
        <div className="border-t border-line px-3 py-1.5 font-mono text-[10px] text-fg-muted">
          Ctrl K · ↑↓ to move · enter to run · esc to close
        </div>
      </div>
    </div>
  );
}

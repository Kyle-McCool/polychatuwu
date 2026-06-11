import { type ComponentType } from "react";
import { MessageSquare, PanelLeft, PanelRight, type LucideProps } from "lucide-react";

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  // A button with no handler isn't interactive — render it as a static indicator so it
  // doesn't look clickable (the "Feed" marker for the always-present center column).
  if (!onClick) {
    return (
      <div
        title={label}
        className={`flex w-full flex-col items-center gap-1 rounded-lg py-2 ${active ? "bg-elevated text-fg" : "text-fg-dim"}`}
      >
        <Icon size={18} strokeWidth={1.75} />
        <span className="text-[9px] font-semibold leading-none tracking-tight">{label}</span>
      </div>
    );
  }
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={!!active}
      title={label}
      className={`flex w-full flex-col items-center gap-1 rounded-lg py-2 outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        active ? "bg-elevated text-fg" : "text-fg-dim hover:bg-elevated/60 hover:text-fg"
      }`}
    >
      <Icon size={18} strokeWidth={1.75} />
      <span className="text-[9px] font-semibold leading-none tracking-tight">{label}</span>
    </button>
  );
}

// Slim left nav-rail (VS Code Activity Bar pattern), now with visible labels so a
// new user can tell what each button does at a glance.
export function IconRail({
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  return (
    <nav className="flex flex-col items-center gap-1 border-r border-line bg-base/30 px-1.5 py-3">
      <div className="mb-2 flex h-8 w-8 items-center justify-center" title="Market Bubble">
        <img src="/logo-icon.png" alt="Market Bubble" className="h-7 w-7 object-contain" />
      </div>
      <RailButton icon={MessageSquare} label="Feed" active />
      <RailButton icon={PanelLeft} label="Studio" active={leftOpen} onClick={onToggleLeft} />
      <RailButton icon={PanelRight} label="Markets" active={rightOpen} onClick={onToggleRight} />
    </nav>
  );
}

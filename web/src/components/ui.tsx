import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { siTwitch, siKick, siX } from "simple-icons";
import type { Platform } from "../lib/types";

/* ---------- Platform brand logos (real marks, not letters) ---------- */
const SI: Partial<Record<Platform, { path: string }>> = { twitch: siTwitch, kick: siKick, x: siX };
const SI_COLOR: Partial<Record<Platform, string>> = {
  twitch: "var(--color-twitch)",
  kick: "var(--color-kick)",
  x: "var(--color-x)",
};

export function PlatformIcon({
  platform,
  size = 14,
  colored = true,
  className = "",
}: {
  platform: Platform;
  size?: number;
  colored?: boolean;
  className?: string;
}) {
  // native shared-chat posts use the brand mark (no third-party logo)
  if (platform === "tape") {
    return (
      <img
        src="/logo-icon.png"
        alt="shared"
        width={size}
        height={size}
        className={className}
        style={{ objectFit: "contain", display: "inline-block" }}
      />
    );
  }
  const si = SI[platform];
  if (!si) return null;
  return (
    <svg
      role="img"
      aria-label={platform}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={colored ? SI_COLOR[platform] : "currentColor"}
    >
      <path d={si.path} />
    </svg>
  );
}

/* ---------- Button ---------- */
type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md";

const BTN_VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25)] hover:brightness-110 active:brightness-95",
  secondary: "border border-line bg-elevated/80 text-fg hover:bg-overlay active:brightness-95",
  ghost: "text-fg-dim hover:bg-elevated hover:text-fg active:brightness-95",
};
const BTN_SIZE: Record<Size, string> = {
  sm: "h-7 gap-1.5 px-2.5 text-xs",
  md: "h-8 gap-2 px-3 text-sm",
};

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <button
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:opacity-50 ${BTN_SIZE[size]} ${BTN_VARIANT[variant]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

/* ---------- Icon button ---------- */
export function IconButton({
  label,
  children,
  active = false,
  size = 32,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: number }) {
  return (
    <button
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={`inline-flex items-center justify-center rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 hover:bg-elevated active:brightness-95 ${
        active ? "bg-elevated text-fg" : "text-fg-dim hover:text-fg"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------- Switch ---------- */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      {/* knob carries the OPPOSITE tone of its track so the state is always visible:
          ON  = accent track + accent-ink knob (black-on-cream dark / cream-on-black light)
          OFF = gray track + fg knob (cream-on-gray dark / ink-on-gray light) */}
      <span
        className={`inline-block h-4 w-4 transform rounded-full shadow transition ${
          checked ? "translate-x-4 bg-accent-ink" : "translate-x-0.5 bg-fg"
        }`}
      />
    </button>
  );
}

/* ---------- Segmented control ---------- */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-md border border-line bg-elevated/60 p-0.5 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-6 items-center justify-center gap-1 rounded px-2 text-xs font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent/50 ${
            value === o.value ? "bg-accent/15 text-accent" : "text-fg-dim hover:text-fg"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  color = "neutral",
  className = "",
}: {
  children: ReactNode;
  color?: "neutral" | "accent" | "pos" | "neg" | "warn";
  className?: string;
}) {
  const C = {
    neutral: "border-line bg-elevated text-fg-dim",
    accent: "border-accent/30 bg-accent/15 text-accent",
    pos: "border-pos/30 bg-pos/15 text-pos",
    neg: "border-neg/30 bg-neg/15 text-neg",
    warn: "border-warn/30 bg-warn/15 text-warn",
  }[color];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${C} ${className}`}
    >
      {children}
    </span>
  );
}

/* ---------- Mascot ---------- */
export function Mascot({ size = 64, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/mascot.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{ width: size, height: size }}
      className={`pointer-events-none select-none object-contain ${className}`}
    />
  );
}

/* ---------- Empty state (mascot + message) ---------- */
export function EmptyState({
  children,
  size = 56,
  className = "",
}: {
  children: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 px-3 py-6 text-center ${className}`}>
      <Mascot size={size} className="opacity-90 drop-shadow-[0_4px_16px_rgba(46,92,255,0.25)]" />
      <p className="max-w-[15rem] font-mono text-[11px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}

/* ---------- Input ---------- */
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`h-8 rounded-md border border-line bg-elevated/60 px-2.5 text-sm text-fg outline-none transition placeholder:text-fg-muted focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30 ${className}`}
      {...props}
    />
  );
}

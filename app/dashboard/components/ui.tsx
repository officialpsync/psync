"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, X } from "lucide-react";

/* ---------- Formatting ---------- */

export function formatINR(paise: number, opts?: { compact?: boolean }) {
  const rupees = paise / 100;
  if (opts?.compact) {
    if (rupees >= 100000) return `₹${trim(rupees / 100000)}L`;
    if (rupees >= 1000) return `₹${trim(rupees / 1000)}k`;
  }
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function trim(n: number) {
  return (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toString();
}

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** CSS variables for responsive grid rows (.ps-list-head / .ps-row) */
export function cols(desktop: string, phone?: string): React.CSSProperties {
  return { "--cols": desktop, ...(phone ? { "--cols-sm": phone } : {}) } as React.CSSProperties;
}

/* ---------- Avatar ---------- */

const TINTS: [string, string][] = [
  ["#e7f0ff", "#0062c4"],
  ["#e6f6ec", "#1f8a3b"],
  ["#f3eafb", "#8944ab"],
  ["#fff1de", "#b45309"],
  ["#ffe9ec", "#c4001a"],
  ["#e3f5f8", "#0e7c8f"],
];

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const [bg, fg] = TINTS[Math.abs(hash) % TINTS.length];
  return (
    <div
      className="ps-avatar"
      aria-hidden
      style={{ width: size, height: size, background: bg, color: fg, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </div>
  );
}

/* ---------- Tile (neutral icon container; colour only for status) ---------- */

export function Tile({
  icon: Icon,
  tone,
  size = "md",
}: {
  icon: React.ElementType;
  tone?: "amber" | "green" | "red" | "blue";
  size?: "sm" | "md" | "lg";
}) {
  const px = size === "sm" ? 15 : size === "md" ? 18 : 20;
  const cls = ["ps-tile", size !== "md" ? `ps-tile--${size}` : "", tone ? `ps-tile--${tone}` : ""].filter(Boolean).join(" ");
  return (
    <span className={cls} aria-hidden>
      <Icon size={px} />
    </span>
  );
}

/* ---------- Switch ---------- */

export function Switch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="ps-switch"
      onClick={() => onChange(!checked)}
    />
  );
}

/* ---------- Back link ---------- */

export function BackLink({ href, label, onClick }: { href?: string; label: string; onClick?: () => void }) {
  const content = (
    <>
      <ChevronLeft size={20} />
      {label}
    </>
  );
  if (href) return <Link href={href} className="ps-back">{content}</Link>;
  return <button type="button" className="ps-back" onClick={onClick}>{content}</button>;
}

/* ---------- Dates ---------- */

/** "2026-10-12" → "12 Oct" (or "12 Oct 2025" for other years). Date-only strings are read as local dates. */
export function formatDate(value: string | null | undefined, opts?: { year?: boolean; weekday?: boolean }) {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  const showYear = opts?.year ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    ...(showYear ? { year: "numeric" } : {}),
    ...(opts?.weekday ? { weekday: "short" } : {}),
  });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

/* ---------- Skeleton ---------- */

export function Skeleton({ w, h, r }: { w: number | string; h: number | string; r?: number }) {
  return <span className="ps-skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

/* ---------- Segmented control ---------- */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  block,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  block?: boolean;
  label?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      className={`ps-segmented${block ? " ps-segmented--block" : ""}`}
      role="group"
      aria-label={label}
      style={{ "--count": options.length, "--index": index } as React.CSSProperties}
    >
      <span className="ps-segmented-thumb" aria-hidden style={{ opacity: options.some((o) => o.value === value) ? 1 : 0 }} />
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Toast ---------- */

export function useToast() {
  const [state, setState] = useState<{ msg: string; visible: boolean; tone: "success" | "error" }>({
    msg: "", visible: false, tone: "success",
  });
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((msg: string, tone: "success" | "error" = "success") => {
    window.clearTimeout(timer.current);
    setState({ msg, visible: true, tone });
    timer.current = window.setTimeout(() => setState((s) => ({ ...s, visible: false })), 2400);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const toast = (
    <div className="ps-toast" data-show={state.visible} role="status" aria-live="polite">
      <span className="ps-toast-icon" style={state.tone === "error" ? { background: "var(--red-fill)" } : undefined}>
        {state.tone === "error" ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </span>
      {state.msg}
    </div>
  );

  return { toast, show };
}

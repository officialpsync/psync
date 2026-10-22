"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
};

const CLOSE_MS = 420;

/**
 * Bottom sheet on phones (≤640px), centred dialog above that.
 * - CSS transitions retarget from the current value, so open/close can be interrupted.
 * - On phones the header tracks the finger 1:1 and dismisses on a flick or a 30% drag.
 * - Styles live here (<SheetStyles />) so every modal looks the same on every page,
 *   whether or not that page renders <DesignStyles />.
 */
export function Sheet({ open, onClose, title, description, children, footer, width = 520 }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Mount, then flip to "open" on the next frame so the enter transition runs.
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setShown(false);
    const t = window.setTimeout(() => setMounted(false), CLOSE_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) return;
    const el = panelRef.current;
    if (el) {
      el.style.transform = "";
      el.style.transition = "";
      el.getBoundingClientRect(); // flush the closed state
    }
    setScrolled(false);
    const id = requestAnimationFrame(() => {
      setShown(true);
      el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [mounted, open]);

  // Scroll lock + Escape
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mounted]);

  function isPhone() {
    return window.matchMedia("(max-width: 640px)").matches;
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!isPhone() || (e.target as HTMLElement).closest("button")) return;
    const el = panelRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, lastY: e.clientY, lastT: e.timeStamp, v: 0 };
    el.style.transition = "none";
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = panelRef.current;
    if (!d || !el) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.v = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    let dy = e.clientY - d.startY;
    if (dy < 0) dy = -Math.sqrt(-dy) * 2; // rubber-band upward: resist, don't hard-stop
    el.style.transform = `translateY(${dy}px)`;
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const el = panelRef.current;
    drag.current = null;
    if (!d || !el) return;
    const dy = e.clientY - d.startY;
    el.style.transition = "";
    if (dy > el.offsetHeight * 0.3 || d.v > 0.5) {
      el.style.transform = "translateY(100%)"; // continue from the finger, not from 0
      onCloseRef.current();
    } else {
      el.style.transform = ""; // settle back
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="ps-sheet-root" data-open={shown}>
      <SheetStyles />
      <div className="ps-sheet-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="ps-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-scrolled={scrolled}
        style={{ "--sheet-w": `${width}px` } as React.CSSProperties}
      >
        <div
          className="ps-sheet-header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div className="ps-sheet-handle" />
          <div className="ps-sheet-titlebar">
            <div style={{ minWidth: 0 }}>
              <h2 className="ps-sheet-title">{title}</h2>
              {description && <p className="ps-sheet-desc">{description}</p>}
            </div>
            <button type="button" className="ps-sheet-close" aria-label="Close" onClick={onClose}>
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <div className="ps-sheet-body" onScroll={(e) => {
          const s = e.currentTarget.scrollTop > 4;
          if (s !== scrolled) setScrolled(s);
        }}>
          {children}
        </div>
        {footer && <div className="ps-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* Selectors are prefixed with .ps-sheet-root so they win over the older rules in
   globals.css without !important. Colors come from the shared brand tokens that
   DesignSystem.tsx sets on `.db, .ps-sheet-root`. */
const SHEET_CSS = `
.ps-sheet-root {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center; padding: 24px;
  pointer-events: none;
}
.ps-sheet-root[data-open="true"] { pointer-events: auto; }

.ps-sheet-root .ps-sheet-backdrop {
  position: absolute; inset: 0;
  background: rgba(15, 23, 42, 0.42);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  opacity: 0; transition: opacity 260ms ease;
}
.ps-sheet-root[data-open="true"] .ps-sheet-backdrop { opacity: 1; }

/* Desktop: centred dialog that fades and scales up slightly (never from 0) */
.ps-sheet-root .ps-sheet {
  position: relative; inset: auto; margin: 0;
  display: flex; flex-direction: column;
  width: 100%; max-width: var(--sheet-w, 520px); max-height: min(90dvh, 920px);
  background: #fff; border-radius: 24px; outline: none; overflow: hidden;
  box-shadow: 0 0 0 1px rgba(15,23,42,0.06), 0 24px 64px -12px rgba(15,23,42,0.28);
  opacity: 0; transform: translateY(8px) scale(0.97);
  transition: opacity 200ms var(--db-ease, cubic-bezier(0.23,1,0.32,1)), transform 260ms var(--db-ease, cubic-bezier(0.23,1,0.32,1));
}
.ps-sheet-root[data-open="true"] .ps-sheet { opacity: 1; transform: none; }

.ps-sheet-root .ps-sheet-header {
  flex-shrink: 0; position: relative; z-index: 2; background: #fff;
  padding: 22px 24px 14px; transition: box-shadow 200ms ease;
}
.ps-sheet-root .ps-sheet[data-scrolled="true"] .ps-sheet-header { box-shadow: 0 1px 0 rgba(15,23,42,0.08); }
.ps-sheet-root .ps-sheet-handle { display: none; }
.ps-sheet-root .ps-sheet-titlebar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ps-sheet-root .ps-sheet-title { margin: 0; font-size: 19px; line-height: 1.25; font-weight: 680; letter-spacing: -0.02em; color: var(--text-primary); }
.ps-sheet-root .ps-sheet-desc { margin: 4px 0 0; font-size: 13.5px; line-height: 1.45; color: var(--text-secondary); max-width: 46ch; }
.ps-sheet-root .ps-sheet-close {
  flex-shrink: 0; width: 34px; height: 34px; margin: -4px -6px 0 0; border: 0; border-radius: 50%;
  display: grid; place-items: center; cursor: pointer; color: var(--text-secondary); background: var(--fill);
  touch-action: manipulation; transition: transform 120ms var(--db-ease, ease-out), background-color 150ms ease, color 150ms ease;
}
.ps-sheet-root .ps-sheet-close:active { transform: scale(0.92); }

.ps-sheet-root .ps-sheet-body {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  padding: 4px 24px 24px; -webkit-overflow-scrolling: touch;
}

.ps-sheet-root .ps-sheet-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: 10px;
  padding: 14px 24px; border-top: 1px solid rgba(15,23,42,0.07);
  background: rgba(255,255,255,0.88); -webkit-backdrop-filter: blur(16px) saturate(180%); backdrop-filter: blur(16px) saturate(180%);
}
.ps-sheet-root .ps-sheet-footer .ps-btn { height: 42px; padding: 0 18px; border-radius: 12px; font-weight: 620; }
/* Push the first secondary action (Archive / Cancel) left when there are two buttons */
.ps-sheet-root .ps-sheet-footer > .ps-btn--secondary:first-child:not(:only-child) { margin-right: auto; }
.ps-sheet-root .ps-sheet-footer .ps-btn--primary { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 1px 2px rgba(10,102,214,0.25), 0 4px 12px -4px rgba(10,102,214,0.45); }

@media (hover: hover) and (pointer: fine) {
  .ps-sheet-root .ps-sheet-close:hover { background: rgba(118,118,128,0.16); color: var(--text-primary); }
  .ps-sheet-root .ps-sheet-footer .ps-btn--primary:hover { background: var(--accent-strong, var(--accent)); }
}

/* Phones: bottom sheet. Bigger touch targets, safe-area padding, no iOS input zoom. */
@media (max-width: 640px) {
  .ps-sheet-root { align-items: flex-end; padding: 0; }
  .ps-sheet-root .ps-sheet {
    max-width: none; max-height: 92dvh; border-radius: 24px 24px 0 0;
    opacity: 1; transform: translateY(100%);
    transition: transform 420ms var(--db-ease, cubic-bezier(0.23,1,0.32,1));
    box-shadow: 0 -8px 40px -8px rgba(15,23,42,0.25);
  }
  .ps-sheet-root[data-open="true"] .ps-sheet { transform: none; }
  .ps-sheet-root .ps-sheet-header { padding: 8px 20px 12px; touch-action: none; cursor: grab; }
  .ps-sheet-root .ps-sheet-handle { display: block; width: 38px; height: 5px; margin: 0 auto 12px; border-radius: 3px; background: rgba(60,60,67,0.22); }
  .ps-sheet-root .ps-sheet-title { font-size: 18px; }
  .ps-sheet-root .ps-sheet-body { padding: 2px 20px 20px; }
  .ps-sheet-root .ps-sheet-footer { padding: 12px 20px calc(12px + env(safe-area-inset-bottom, 0px)); }
  .ps-sheet-root .ps-sheet-footer .ps-btn { flex: 1; height: 48px; justify-content: center; }
  .ps-sheet-root .ps-sheet-footer > .ps-btn--secondary:first-child:not(:only-child) { margin-right: 0; }
  /* 16px stops iOS Safari from zooming the page when an input is focused */
  .ps-sheet-root input, .ps-sheet-root select, .ps-sheet-root textarea { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  /* Fade only: no slide or scale. Opacity must drive visibility on phones too. */
  .ps-sheet-root .ps-sheet { transform: none !important; opacity: 0; transition: opacity 200ms ease; }
  .ps-sheet-root[data-open="true"] .ps-sheet { opacity: 1; }
  .ps-sheet-root .ps-sheet-close:active { transform: none; }
}
@media (prefers-reduced-transparency: reduce) {
  .ps-sheet-root .ps-sheet-backdrop { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgba(15,23,42,0.55); }
  .ps-sheet-root .ps-sheet-footer { -webkit-backdrop-filter: none; backdrop-filter: none; background: #fff; }
}
`;

function SheetStyles() {
  return <style dangerouslySetInnerHTML={{ __html: SHEET_CSS }} />;
}

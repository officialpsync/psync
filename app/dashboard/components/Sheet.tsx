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
 */
export function Sheet({ open, onClose, title, description, children, footer, width = 520 }: SheetProps) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
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
      <div className="ps-sheet-backdrop" onClick={onClose} />
      <div
        ref={panelRef}
        className="ps-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
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
            <button type="button" className="ps-icon-btn ps-icon-btn--filled" aria-label="Close" onClick={onClose}>
              <X size={16} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <div className="ps-sheet-body">{children}</div>
        {footer && <div className="ps-sheet-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

"use client";
// app/dashboard/leads/components/FieldInput.tsx
// One input for any lead field. Works on a string "draft"; toDraft/fromDraft convert to and from stored values.

import { optionsFor, type Ctx, type FieldDef } from "../lib";

function pad(n: number) { return String(n).padStart(2, "0"); }
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toDraft(f: FieldDef, raw: unknown): string {
  if (f.type === "checkbox") return raw === true ? "true" : "false";
  if (raw === null || raw === undefined) return "";
  if (f.type === "datetime") return toLocalInput(new Date(String(raw)));
  if (f.type === "date") return String(raw).slice(0, 10);
  return String(raw);
}

export function fromDraft(f: FieldDef, draft: string): unknown {
  if (f.type === "checkbox") return draft === "true";
  const t = draft.trim();
  if (!t) return null;
  if (f.type === "number") { const n = Number(t); return Number.isFinite(n) ? n : null; }
  if (f.type === "datetime") return new Date(t).toISOString();
  return t;
}

export function FieldInput({ field, draft, onChange, ctx, autoFocus, onEnter, onEscape, className = "zl-in" }: {
  field: FieldDef; draft: string; onChange: (v: string) => void; ctx: Ctx;
  autoFocus?: boolean; onEnter?: () => void; onEscape?: () => void; className?: string;
}) {
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && field.type !== "textarea") { e.preventDefault(); onEnter?.(); }
    if (e.key === "Escape") { e.preventDefault(); onEscape?.(); }
  };

  switch (field.type) {
    case "textarea":
      return <textarea className={className} rows={3} autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} />;
    case "number":
      return <input className={className} type="number" autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} />;
    case "date":
      return <input className={className} type="date" autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} />;
    case "datetime":
      return <input className={className} type="datetime-local" autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} style={{ colorScheme: "light" }} />;
    case "phone":
      return <input className={className} type="tel" autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} />;
    case "email":
      return <input className={className} type="email" autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} />;
    case "checkbox":
      return (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", minHeight: 30 }}>
          <input type="checkbox" checked={draft === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} style={{ accentColor: "var(--accent)", width: 15, height: 15 }} />
          {draft === "true" ? "Yes" : "No"}
        </label>
      );
    case "status": case "source": case "user": case "plan": case "select": {
      const opts = optionsFor(field, ctx);
      return (
        <select className={className} autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)}>
          {field.type !== "status" && <option value="">None</option>}
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          {draft && !opts.some((o) => o.value === draft) && <option value={draft}>{draft}</option>}
        </select>
      );
    }
    default:
      return <input className={className} autoFocus={autoFocus} onKeyDown={keys} value={draft} onChange={(e) => onChange(e.target.value)} />;
  }
}

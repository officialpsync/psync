"use client";
// app/dashboard/leads/components/FieldManager.tsx
// Owners and managers add the gym's own lead fields here (Zoho "Customize module" equivalent).
// Fields are never hard-deleted: hiding keeps old values on leads in case the field comes back.
// The type can't change after creation, because existing values would no longer fit.

import { useMemo, useState } from "react";
import { X, Plus, Loader2, ChevronUp, ChevronDown, Pencil, EyeOff, Eye } from "lucide-react";
import {
  supabase, slugify, CUSTOM_TYPE_LABELS, SECTION_CUSTOM_DEFAULT,
  type CustomFieldRow, type CustomFieldType,
} from "../lib";

const TYPES = Object.keys(CUSTOM_TYPE_LABELS) as CustomFieldType[];

export function FieldManager({ orgId, rows, onClose, onChanged }: {
  orgId: string; rows: CustomFieldRow[]; onClose: () => void; onChanged: (rows: CustomFieldRow[]) => void;
}) {
  const [list, setList] = useState<CustomFieldRow[]>(rows);
  const [editing, setEditing] = useState<CustomFieldRow | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [section, setSection] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const active = useMemo(() => list.filter((r) => r.is_active).sort((a, b) => a.sort_order - b.sort_order), [list]);
  const hidden = useMemo(() => list.filter((r) => !r.is_active), [list]);
  const sections = useMemo(() => {
    const s: string[] = [];
    active.forEach((r) => { const n = r.section?.trim() || SECTION_CUSTOM_DEFAULT; if (!s.includes(n)) s.push(n); });
    return s;
  }, [active]);

  function commit(next: CustomFieldRow[]) { setList(next); onChanged(next); }

  function openNew() {
    setEditing("new"); setLabel(""); setType("text"); setOptionsText(""); setSection(sections[0] ?? ""); setError("");
  }
  function openEdit(r: CustomFieldRow) {
    setEditing(r); setLabel(r.label); setType(r.type); setOptionsText((r.options ?? []).join("\n")); setSection(r.section ?? ""); setError("");
  }

  async function save() {
    const name = label.trim();
    if (!name) { setError("Give the field a name"); return; }
    const options = optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
    if (type === "select" && options.length === 0) { setError("Add at least one dropdown option, one per line"); return; }
    setSaving(true); setError("");

    if (editing === "new") {
      let slug = slugify(name);
      if (list.some((r) => r.slug === slug)) slug = `${slug}_${list.length + 1}`;
      const maxOrder = list.reduce((m, r) => Math.max(m, r.sort_order), 0);
      const { data, error: err } = await supabase.from("lead_custom_fields")
        .insert({ org_id: orgId, slug, label: name, type, options, section: section.trim() || null, sort_order: maxOrder + 10, is_active: true })
        .select("*").single();
      setSaving(false);
      if (err || !data) { setError(err?.message ?? "Couldn't add the field"); return; }
      commit([...list, data as CustomFieldRow]);
    } else if (editing) {
      const patch = { label: name, options, section: section.trim() || null };
      const { error: err } = await supabase.from("lead_custom_fields").update(patch).eq("id", editing.id).eq("org_id", orgId);
      setSaving(false);
      if (err) { setError(err.message); return; }
      commit(list.map((r) => (r.id === editing.id ? { ...r, ...patch } : r)));
    }
    setEditing(null);
  }

  async function setActive(r: CustomFieldRow, is_active: boolean) {
    const { error: err } = await supabase.from("lead_custom_fields").update({ is_active }).eq("id", r.id).eq("org_id", orgId);
    if (err) { alert(err.message); return; }
    commit(list.map((x) => (x.id === r.id ? { ...x, is_active } : x)));
  }

  async function move(r: CustomFieldRow, dir: -1 | 1) {
    const idx = active.findIndex((x) => x.id === r.id);
    const other = active[idx + dir];
    if (!other) return;
    await Promise.all([
      supabase.from("lead_custom_fields").update({ sort_order: other.sort_order }).eq("id", r.id),
      supabase.from("lead_custom_fields").update({ sort_order: r.sort_order }).eq("id", other.id),
    ]);
    commit(list.map((x) => (x.id === r.id ? { ...x, sort_order: other.sort_order } : x.id === other.id ? { ...x, sort_order: r.sort_order } : x)));
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "560px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">{editing === "new" ? "New lead field" : editing ? "Edit field" : "Lead fields"}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {editing ? "Shows on every lead page, and in filters and columns." : "Your gym's own fields, on top of the built-in ones."}
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div className="ps-error">{error}</div>}

          {editing ? (
            <>
              <div className="ps-field">
                <label className="ps-label">Field name</label>
                <input className="ps-input" autoFocus value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Fitness goal, Preferred time, Trial date" />
              </div>
              <div className="ps-field">
                <span className="ps-label">Type</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {TYPES.map((t) => (
                    <button key={t} type="button" disabled={editing !== "new"} onClick={() => setType(t)}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: editing === "new" ? "pointer" : "default",
                        border: type === t ? "1.5px solid var(--accent)" : "1.5px solid var(--separator)",
                        background: type === t ? "var(--accent-dim)" : "transparent",
                        color: type === t ? "var(--accent)" : "var(--text-secondary)",
                        fontWeight: type === t ? 600 : 400, opacity: editing !== "new" && type !== t ? 0.45 : 1,
                      }}>
                      {CUSTOM_TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
                {editing !== "new" && <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>Type is fixed once a field exists. Create a new field to change it.</div>}
              </div>
              {type === "select" && (
                <div className="ps-field">
                  <label className="ps-label">Dropdown options (one per line)</label>
                  <textarea className="ps-input" rows={5} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={"Weight loss\nMuscle gain\nGeneral fitness"} />
                </div>
              )}
              <div className="ps-field">
                <label className="ps-label">Section</label>
                <input className="ps-input" list="lcf-sections" value={section} onChange={(e) => setSection(e.target.value)} placeholder={SECTION_CUSTOM_DEFAULT} />
                <datalist id="lcf-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 6 }}>Fields with the same section are grouped together on the lead page, like Zoho.</div>
              </div>
            </>
          ) : (
            <>
              {active.length === 0 && (
                <div style={{ padding: "24px 12px", textAlign: "center", color: "var(--text-tertiary)", fontSize: 13 }}>
                  No custom fields yet. Add the things your team asks every lead, like fitness goal or preferred batch time.
                </div>
              )}
              {sections.map((sec) => (
                <div key={sec}>
                  <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>{sec}</div>
                  <div style={{ border: "1px solid var(--separator)", borderRadius: 10 }}>
                    {active.filter((r) => (r.section?.trim() || SECTION_CUSTOM_DEFAULT) === sec).map((r, i, arr) => {
                      const gi = active.findIndex((x) => x.id === r.id);
                      return (
                        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: i < arr.length - 1 ? "1px solid var(--separator)" : "none" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</div>
                            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                              {CUSTOM_TYPE_LABELS[r.type]}{r.type === "select" ? ` · ${(r.options ?? []).length} options` : ""}
                            </div>
                          </div>
                          <button type="button" className="zl-ibtn" disabled={gi === 0} onClick={() => move(r, -1)} aria-label="Move up"><ChevronUp size={14} /></button>
                          <button type="button" className="zl-ibtn" disabled={gi === active.length - 1} onClick={() => move(r, 1)} aria-label="Move down"><ChevronDown size={14} /></button>
                          <button type="button" className="zl-ibtn" onClick={() => openEdit(r)} aria-label="Edit"><Pencil size={13} /></button>
                          <button type="button" className="zl-ibtn" onClick={() => setActive(r, false)} aria-label="Hide" title="Hide field"><EyeOff size={13} /></button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {hidden.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 6 }}>Hidden</div>
                  {hidden.map((r) => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", color: "var(--text-tertiary)" }}>
                      <span style={{ flex: 1 }}>{r.label}</span>
                      <button type="button" className="zl-btn zl-btn--sm" onClick={() => setActive(r, true)}><Eye size={13} /> Show</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="ps-sheet-footer">
          {editing ? (
            <>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setEditing(null)}>Back</button>
              <button type="button" className="ps-btn ps-btn--primary" onClick={save} disabled={saving}>
                {saving && <Loader2 size={15} className="ps-spin" />}{editing === "new" ? "Add field" : "Save field"}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Done</button>
              <button type="button" className="ps-btn ps-btn--primary" onClick={openNew}><Plus size={15} /> New field</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

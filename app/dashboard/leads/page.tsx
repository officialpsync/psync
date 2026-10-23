"use client";
// app/dashboard/leads/page.tsx
// Zoho-style leads list.
// Left: filter panel (Saved Filters with counts, System Defined Filters, Filter By Fields with conditions).
// Right: dense full-width table. Columns are picked and ordered per user (ps_layout_prefs 'leads_list_columns').
// Saved filters are private to each user (lead_saved_filters).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, X, Download, Upload, Filter as FilterIcon, Columns3, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Trash2, Settings2, Save,
} from "lucide-react";
import { Skeleton, useToast } from "../components/ui";
import {
  supabase, buildFields, displayValue, sortValue, optionsFor, opsFor, defaultCondition, matchLead,
  normalizeFilter, filterCount, loadLeadContext, loadPref, savePref, relTime, formatDateTime, isOverdue,
  STATUS_ORDER, STATUS_META, SYSTEM_FILTERS, OP_LABELS, EMPTY_FILTER, NONE, NAV_KEY,
  type Lead, type LeadStatus, type FieldDef, type FilterState, type Condition, type Op, type SystemFilter,
  type LeadContext, type CustomFieldRow, type Ctx,
} from "./lib";
import { LeadsStyles, StatusPill } from "./components/LeadsStyles";
import { LeadSheet, ImportLeadsSheet } from "./components/LeadSheets";
import { FieldManager } from "./components/FieldManager";

const LAST_TOUCH: FieldDef = { key: "__last_touch", label: "Last Activity Time", type: "datetime", section: "", editable: false };
const DEFAULT_COLUMNS = ["status", "assigned_to", "phone", "source", "follow_up_at", "created_at"];
const LEGACY_KEYS: Record<string, string> = { owner: "assigned_to", next_action: "follow_up_at", last_touch: "__last_touch", plan: "interested_plan", created: "created_at" };
const PAGE_SIZES = [10, 30, 50, 100];

type Saved = { id: string; name: string; filter: FilterState };

// ── Condition editor (one per checked field in the panel) ────────────────────

function ConditionEditor({ field, cond, ctx, onChange }: {
  field: FieldDef; cond: Condition; ctx: Ctx; onChange: (c: Condition) => void;
}) {
  const ops = opsFor(field.type);
  const multi = cond.op === "in" || cond.op === "not_in";
  const opts = multi ? [...optionsFor(field, ctx), ...(field.type !== "status" ? [{ value: NONE, label: "None" }] : [])] : [];
  const arr = Array.isArray(cond.value) ? cond.value : [];
  const str = typeof cond.value === "string" ? cond.value : "";

  function setOp(op: Op) {
    const toMulti = op === "in" || op === "not_in";
    onChange({ field: cond.field, op, value: toMulti ? (multi ? arr : []) : (multi ? "" : str), value2: cond.value2 });
  }

  return (
    <div className="zl-cond">
      <select className="zl-in" value={cond.op} onChange={(e) => setOp(e.target.value as Op)}>
        {ops.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
      </select>
      {multi && (
        <div className="zl-opts">
          {opts.length === 0 && <span className="zl-muted" style={{ fontSize: 12 }}>No options</span>}
          {opts.map((o) => (
            <label key={o.value} className="zl-check">
              <input type="checkbox" checked={arr.includes(o.value)}
                onChange={() => onChange({ ...cond, value: arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value] })} />
              {o.label}
            </label>
          ))}
        </div>
      )}
      {(cond.op === "contains" || cond.op === "not_contains" || cond.op === "eq") && (
        <input className="zl-in" type={field.type === "number" ? "number" : "text"} placeholder="Type here" value={str}
          onChange={(e) => onChange({ ...cond, value: e.target.value })} />
      )}
      {(cond.op === "gt" || cond.op === "lt") && (
        <input className="zl-in" type="number" value={str} onChange={(e) => onChange({ ...cond, value: e.target.value })} />
      )}
      {cond.op === "last_n_days" && (
        <div className="zl-row2">
          <input className="zl-in" type="number" min={1} style={{ width: 80 }} value={str} onChange={(e) => onChange({ ...cond, value: e.target.value })} />
          <span className="zl-muted">days</span>
        </div>
      )}
      {(cond.op === "before" || cond.op === "after") && (
        <input className="zl-in" type="date" value={str} onChange={(e) => onChange({ ...cond, value: e.target.value })} />
      )}
      {cond.op === "between" && (
        <div className="zl-row2">
          <input className="zl-in" type="date" value={str} onChange={(e) => onChange({ ...cond, value: e.target.value })} />
          <input className="zl-in" type="date" value={cond.value2 ?? ""} onChange={(e) => onChange({ ...cond, value2: e.target.value })} />
        </div>
      )}
    </div>
  );
}

// ── Column picker popover ────────────────────────────────────────────────────

function ColumnPicker({ fields, visible, onChange, onClose }: {
  fields: FieldDef[]; visible: string[]; onChange: (next: string[]) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const pickable = fields.filter((f) => f.key !== "full_name");
  const ordered = [
    ...visible.map((k) => pickable.find((f) => f.key === k)).filter(Boolean) as FieldDef[],
    ...pickable.filter((f) => !visible.includes(f.key)),
  ].filter((f) => !q || f.label.toLowerCase().includes(q.toLowerCase()));

  function move(key: string, dir: -1 | 1) {
    const i = visible.indexOf(key); const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    const next = [...visible]; [next[i], next[j]] = [next[j], next[i]]; onChange(next);
  }

  return (
    <div className="zl-pop" style={{ top: 40, right: 8 }} onClick={(e) => e.stopPropagation()}>
      <div className="zl-pop-title">Columns</div>
      <div className="zl-search zl-search--block"><Search size={13} /><input placeholder="Search fields" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="zl-pop-list">
        {ordered.map((f) => {
          const on = visible.includes(f.key);
          const i = visible.indexOf(f.key);
          return (
            <div key={f.key} className="zl-pop-row" data-on={on}>
              <label>
                <input type="checkbox" checked={on} onChange={() => onChange(on ? visible.filter((k) => k !== f.key) : [...visible, f.key])} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.label}</span>
              </label>
              {on && !q && (
                <>
                  <button type="button" className="zl-ibtn" style={{ width: 22, height: 22 }} disabled={i === 0} onClick={() => move(f.key, -1)} aria-label="Move left"><ChevronUp size={12} /></button>
                  <button type="button" className="zl-ibtn" style={{ width: 22, height: 22 }} disabled={i === visible.length - 1} onClick={() => move(f.key, 1)} aria-label="Move right"><ChevronDown size={12} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="zl-pop-foot">
        <button type="button" className="zl-btn zl-btn--sm" onClick={() => onChange(DEFAULT_COLUMNS)}>Reset</button>
        <button type="button" className="zl-btn zl-btn--sm zl-btn--primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const router = useRouter();
  const { toast, show } = useToast();

  const [c, setC] = useState<LeadContext | null>(null);
  const [customRows, setCustomRows] = useState<CustomFieldRow[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [lastTouch, setLastTouch] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [panelOpen, setPanelOpen] = useState(true);
  const [secOpen, setSecOpen] = useState({ saved: true, system: true, fields: true });
  const [fieldQ, setFieldQ] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [saveName, setSaveName] = useState("");

  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [colsOpen, setColsOpen] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "created_at", dir: "desc" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(30);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const fields = useMemo(() => buildFields(customRows), [customRows]);
  const listFields = useMemo(() => [...fields, LAST_TOUCH], [fields]);
  const ctx: Ctx = useMemo(() => ({ staff: c?.staff ?? [], plans: c?.plans ?? [] }), [c]);
  const matchCtx = useMemo(() => ({ myUserId: c?.userId ?? "", lastTouch, fields }), [c, lastTouch, fields]);

  const loadLeads = useCallback(async (orgId: string) => {
    const [{ data }, { data: acts }] = await Promise.all([
      supabase.from("leads").select("*, membership_plans(name)").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("lead_activities").select("lead_id, created_at").eq("org_id", orgId).neq("type", "status_change").order("created_at", { ascending: false }),
    ]);
    setLeads((data as Lead[]) ?? []);
    const map: Record<string, string> = {};
    ((acts as { lead_id: string; created_at: string }[]) ?? []).forEach((a) => { if (!map[a.lead_id]) map[a.lead_id] = a.created_at; });
    setLastTouch(map);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1000) setPanelOpen(false);
    (async () => {
      const lc = await loadLeadContext();
      if (!lc) { setLoading(false); return; }
      setC(lc); setCustomRows(lc.customRows);
      const [{ data: savedData }, colPref] = await Promise.all([
        supabase.from("lead_saved_filters").select("id, name, filters").eq("user_id", lc.userId).order("created_at"),
        loadPref<{ visible?: string[] }>(lc.userId, "leads_list_columns"),
      ]);
      setSaved(((savedData as { id: string; name: string; filters: unknown }[]) ?? []).map((r) => ({ id: r.id, name: r.name, filter: normalizeFilter(r.filters) })));
      if (colPref?.visible?.length) setColumns(Array.from(new Set(colPref.visible.map((k) => LEGACY_KEYS[k] ?? k))));
      await loadLeads(lc.orgId);
      setLoading(false);
    })();
  }, [loadLeads]);

  // ── Filtering, sorting, paging ──

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = leads.filter((l) =>
      (!term || l.full_name.toLowerCase().includes(term) || (l.phone ?? "").includes(term) || (l.email ?? "").toLowerCase().includes(term)) &&
      matchLead(l, filter, matchCtx));
    const f = listFields.find((x) => x.key === sort.key) ?? fields[0];
    return [...rows].sort((a, b) => {
      const av = sortValue(a, f, ctx, lastTouch), bv = sortValue(b, f, ctx, lastTouch);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [leads, search, filter, matchCtx, sort, listFields, fields, ctx, lastTouch]);

  const savedCounts = useMemo(() => {
    const m: Record<string, number> = {};
    saved.forEach((s) => { m[s.id] = leads.filter((l) => matchLead(l, s.filter, matchCtx)).length; });
    return m;
  }, [saved, leads, matchCtx]);

  useEffect(() => { setPage(0); }, [search, filter, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const allPageSelected = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));
  const shownCols = columns.map((k) => listFields.find((f) => f.key === k)).filter(Boolean) as FieldDef[];

  // ── Filter actions ──

  function changeFilter(next: FilterState) { setFilter(next); setActiveSavedId(null); }
  function toggleSystem(s: SystemFilter) {
    changeFilter({ ...filter, system: filter.system.includes(s) ? filter.system.filter((x) => x !== s) : [...filter.system, s] });
  }
  function toggleField(f: FieldDef) {
    const has = filter.conditions.some((x) => x.field === f.key);
    changeFilter({ ...filter, conditions: has ? filter.conditions.filter((x) => x.field !== f.key) : [...filter.conditions, defaultCondition(f)] });
  }
  function updateCondition(cond: Condition) {
    changeFilter({ ...filter, conditions: filter.conditions.map((x) => (x.field === cond.field ? cond : x)) });
  }
  function clearFilter() { setFilter(EMPTY_FILTER); setActiveSavedId(null); setNaming(false); }
  function applySaved(s: Saved) { setFilter(s.filter); setActiveSavedId(s.id); setNaming(false); }

  async function saveFilter() {
    const name = saveName.trim();
    if (!name || !c) return;
    const { data, error } = await supabase.from("lead_saved_filters")
      .insert({ org_id: c.orgId, user_id: c.userId, name, filters: filter }).select("id, name, filters").single();
    if (error || !data) { show("Couldn't save filter", "error"); return; }
    const s = { id: data.id as string, name: data.name as string, filter: normalizeFilter(data.filters) };
    setSaved((p) => [...p, s]); setActiveSavedId(s.id); setNaming(false); setSaveName("");
    show("Filter saved");
  }
  async function deleteSaved(id: string) {
    if (!confirm("Delete this saved filter?")) return;
    await supabase.from("lead_saved_filters").delete().eq("id", id);
    setSaved((p) => p.filter((s) => s.id !== id));
    if (activeSavedId === id) setActiveSavedId(null);
  }

  // ── Table actions ──

  async function persistColumns(next: string[]) {
    setColumns(next);
    if (c) await savePref(c.orgId, c.userId, "leads_list_columns", { visible: next });
  }
  function handleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  }
  function toggleOne(id: string) { setSelected((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function togglePage() {
    setSelected((p) => { const n = new Set(p); pageRows.forEach((l) => (allPageSelected ? n.delete(l.id) : n.add(l.id))); return n; });
  }
  function openLead(id: string) {
    try { sessionStorage.setItem(NAV_KEY, JSON.stringify(filtered.map((l) => l.id))); } catch { /* storage full or blocked */ }
    router.push(`/dashboard/leads/${id}`);
  }

  async function bulkStatus(status: LeadStatus) {
    if (!c || !selected.size) return;
    const ids = Array.from(selected);
    const now = new Date().toISOString();
    const { error } = await supabase.from("leads").update({ status, updated_at: now }).in("id", ids);
    if (error) { show("Couldn't update", "error"); return; }
    const changed = leads.filter((l) => selected.has(l.id) && l.status !== status);
    if (changed.length) {
      await supabase.from("lead_activities").insert(changed.map((l) => ({
        org_id: c.orgId, lead_id: l.id, type: "status_change",
        content: `${STATUS_META[l.status].label} → ${STATUS_META[status].label}`, created_by: c.userId,
      })));
    }
    setLeads((p) => p.map((l) => (selected.has(l.id) ? { ...l, status, updated_at: now } : l)));
    show(`${ids.length} lead${ids.length === 1 ? "" : "s"} updated`);
  }
  async function bulkOwner(userId: string) {
    if (!selected.size) return;
    const ids = Array.from(selected);
    const now = new Date().toISOString();
    const { error } = await supabase.from("leads").update({ assigned_to: userId || null, updated_at: now }).in("id", ids);
    if (error) { show("Couldn't update", "error"); return; }
    setLeads((p) => p.map((l) => (selected.has(l.id) ? { ...l, assigned_to: userId || null, updated_at: now } : l)));
    show(`${ids.length} lead${ids.length === 1 ? "" : "s"} reassigned`);
  }
  async function bulkDelete() {
    if (!selected.size || !confirm(`Delete ${selected.size} lead${selected.size === 1 ? "" : "s"}? Their tasks and history go too.`)) return;
    const { error } = await supabase.from("leads").delete().in("id", Array.from(selected));
    if (error) { show("Couldn't delete: " + error.message, "error"); return; }
    setLeads((p) => p.filter((l) => !selected.has(l.id)));
    setSelected(new Set());
    show("Leads deleted");
  }

  function exportCSV(rows: Lead[]) {
    const cols = [fields[0], ...shownCols];
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [cols.map((f) => esc(f.label)).join(",")];
    rows.forEach((l) => lines.push(cols.map((f) => esc(f.key === "__last_touch" ? (lastTouch[l.id] ?? "") : displayValue(l, f, ctx))).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function cell(lead: Lead, f: FieldDef) {
    if (f.key === "__last_touch") {
      const t = lastTouch[lead.id];
      return t ? <span title={formatDateTime(t)}>{relTime(t)}</span> : <span className="zl-muted">Never</span>;
    }
    if (f.type === "status") return <StatusPill status={lead.status} />;
    const text = displayValue(lead, f, ctx);
    if (f.key === "follow_up_at" && text && isOverdue(lead)) return <span style={{ color: "var(--red)", fontWeight: 600 }}>{text}</span>;
    return text;
  }

  const activeName = activeSavedId ? saved.find((s) => s.id === activeSavedId)?.name : null;
  const fq = fieldQ.trim().toLowerCase();
  const sysShown = SYSTEM_FILTERS.filter((s) => !fq || s.label.toLowerCase().includes(fq));
  const fieldsShown = fields.filter((f) => !fq || f.label.toLowerCase().includes(fq));
  const active = filterCount(filter);

  return (
    <div className="zl-page" onClick={() => setColsOpen(false)}>
      <LeadsStyles />

      <div className="zl-top">
        <div className="zl-title">
          <h1>Leads</h1>
          <span>{activeName ?? (active ? "Filtered view" : "All leads")}</span>
        </div>
        <div className="zl-actions">
          {c?.canManageFields && <button type="button" className="zl-btn" onClick={() => setFieldsOpen(true)}><Settings2 size={14} /> Fields</button>}
          <button type="button" className="zl-btn" onClick={() => setImportOpen(true)}><Upload size={14} /> Import</button>
          <button type="button" className="zl-btn" onClick={() => exportCSV(filtered)}><Download size={14} /> Export</button>
          <button type="button" className="zl-btn zl-btn--primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Create Lead</button>
        </div>
      </div>

      <div className="zl-toolbar">
        {selected.size > 0 ? (
          <div className="zl-bulk">
            <strong>{selected.size} selected</strong>
            <select value="" onChange={(e) => e.target.value && bulkStatus(e.target.value as LeadStatus)} aria-label="Change status">
              <option value="">Change status</option>
              {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            <select value="" onChange={(e) => bulkOwner(e.target.value === NONE ? "" : e.target.value)} aria-label="Assign owner">
              <option value="">Assign owner</option>
              <option value={NONE}>Unassigned</option>
              {ctx.staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
            </select>
            <button type="button" className="zl-btn zl-btn--sm" onClick={() => exportCSV(leads.filter((l) => selected.has(l.id)))}><Download size={13} /> Export</button>
            <button type="button" className="zl-btn zl-btn--sm zl-btn--danger" onClick={bulkDelete}><Trash2 size={13} /> Delete</button>
            <button type="button" className="zl-tbtn" onClick={() => setSelected(new Set())}>Clear selection</button>
          </div>
        ) : (
          <>
            <button type="button" className="zl-tbtn" data-on={panelOpen} onClick={() => setPanelOpen((o) => !o)}><FilterIcon size={14} /> Filter</button>
            <span className="zl-toolbar-sep" />
            <div className="zl-search">
              <Search size={14} />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or email" aria-label="Search leads" />
              {search && <button type="button" className="zl-search-x" onClick={() => setSearch("")} aria-label="Clear search"><X size={11} /></button>}
            </div>
            {active > 0 && (
              <span className="zl-chip">{active} filter{active === 1 ? "" : "s"} applied<button type="button" onClick={clearFilter} aria-label="Clear filters"><X size={12} /></button></span>
            )}
            <span style={{ marginLeft: "auto", color: "var(--text-tertiary)", fontSize: 12.5 }}>
              {loading ? "" : `${filtered.length} of ${leads.length} records`}
            </span>
          </>
        )}
      </div>

      <div className="zl-body" data-panel={panelOpen}>
        {/* ── Filter panel ── */}
        <aside className="zl-panel">
          <div className="zl-panel-scroll">
            <div className="zl-psec">
              <button type="button" className="zl-psec-h" onClick={() => setSecOpen((s) => ({ ...s, saved: !s.saved }))}>
                {secOpen.saved ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Saved Filters <span className="zl-badge">{saved.length}</span>
              </button>
              {secOpen.saved && (saved.length === 0
                ? <div className="zl-hint">Pick filters below, then save them here for one-click use.</div>
                : saved.map((s) => (
                  <div key={s.id} className="zl-sf" data-on={activeSavedId === s.id} onClick={() => applySaved(s)}>
                    <span className="zl-sf-name">{s.name}</span>
                    <span className="zl-badge">{savedCounts[s.id] ?? 0}</span>
                    <button type="button" className="zl-sf-x" onClick={(e) => { e.stopPropagation(); deleteSaved(s.id); }} aria-label={`Delete ${s.name}`}><X size={12} /></button>
                  </div>
                )))}
            </div>

            <div className="zl-psec">
              <div className="zl-psec-label">Filter Leads by</div>
              <div className="zl-search zl-search--block">
                <Search size={13} />
                <input value={fieldQ} onChange={(e) => setFieldQ(e.target.value)} placeholder="Search" aria-label="Search filters" />
                {fieldQ && <button type="button" className="zl-search-x" onClick={() => setFieldQ("")} aria-label="Clear"><X size={11} /></button>}
              </div>
            </div>

            <div className="zl-psec">
              <button type="button" className="zl-psec-h" onClick={() => setSecOpen((s) => ({ ...s, system: !s.system }))}>
                {secOpen.system ? <ChevronDown size={14} /> : <ChevronRight size={14} />} System Defined Filters
              </button>
              {secOpen.system && (sysShown.length === 0 ? <div className="zl-nomatch">No matching filters</div> : sysShown.map((s) => (
                <label key={s.key} className="zl-check">
                  <input type="checkbox" checked={filter.system.includes(s.key)} onChange={() => toggleSystem(s.key)} />
                  {s.label}
                </label>
              )))}
            </div>

            <div className="zl-psec">
              <button type="button" className="zl-psec-h" onClick={() => setSecOpen((s) => ({ ...s, fields: !s.fields }))}>
                {secOpen.fields ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Filter By Fields
              </button>
              {secOpen.fields && (fieldsShown.length === 0 ? <div className="zl-nomatch">No matching fields</div> : fieldsShown.map((f) => {
                const cond = filter.conditions.find((x) => x.field === f.key);
                return (
                  <div key={f.key}>
                    <label className="zl-check">
                      <input type="checkbox" checked={!!cond} onChange={() => toggleField(f)} />
                      {f.label}
                    </label>
                    {cond && <ConditionEditor field={f} cond={cond} ctx={ctx} onChange={updateCondition} />}
                  </div>
                );
              }))}
            </div>
          </div>

          {active > 0 && (
            <div className="zl-pfoot">
              {naming ? (
                <>
                  <input className="zl-in" autoFocus placeholder="Name this filter" value={saveName} maxLength={40}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") saveFilter(); if (e.key === "Escape") setNaming(false); }} />
                  <button type="button" className="zl-btn zl-btn--sm" onClick={() => setNaming(false)}>Cancel</button>
                  <button type="button" className="zl-btn zl-btn--sm zl-btn--primary" onClick={saveFilter} disabled={!saveName.trim()}>Save</button>
                </>
              ) : (
                <>
                  <button type="button" className="zl-btn zl-btn--sm" onClick={clearFilter}>Clear</button>
                  {!activeSavedId && <button type="button" className="zl-btn zl-btn--sm zl-btn--primary" onClick={() => setNaming(true)}><Save size={13} /> Save filter</button>}
                </>
              )}
            </div>
          )}
        </aside>

        {/* ── Table ── */}
        <section className="zl-main">
          {colsOpen && <ColumnPicker fields={listFields} visible={columns} onChange={persistColumns} onClose={() => setColsOpen(false)} />}
          <div className="zl-tablewrap">
            {loading ? (
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} w="100%" h={18} />)}
              </div>
            ) : (
              <table className="zl-table">
                <thead>
                  <tr>
                    <th className="zl-cbcell"><input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select all on this page" /></th>
                    {[fields[0], ...shownCols].map((f) => (
                      <th key={f.key}>
                        <button type="button" className="zl-th-btn" onClick={() => handleSort(f.key)}>
                          {f.label}
                          {sort.key === f.key && (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        </button>
                      </th>
                    ))}
                    <th className="zl-setcell">
                      <button type="button" className="zl-ibtn" onClick={(e) => { e.stopPropagation(); setColsOpen((o) => !o); }} aria-label="Edit columns" title="Edit columns"><Columns3 size={15} /></button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((lead) => (
                    <tr key={lead.id} data-sel={selected.has(lead.id)} onClick={() => openLead(lead.id)}>
                      <td className="zl-cbcell" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)} aria-label={`Select ${lead.full_name}`} />
                      </td>
                      <td><span className="zl-name">{lead.full_name}</span></td>
                      {shownCols.map((f) => <td key={f.key}>{cell(lead, f)}</td>)}
                      <td className="zl-setcell" />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loading && filtered.length === 0 && (
              <div className="zl-empty">
                <strong>{leads.length === 0 ? "No leads yet" : "No leads match"}</strong>
                {leads.length === 0 ? "Create a lead or import a CSV to get started." : "Change or clear the filters on the left."}
              </div>
            )}
          </div>

          <div className="zl-foot">
            <span>Total Records <strong>{filtered.length}</strong></span>
            <div className="zl-pager">
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Records per page">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
              </select>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {filtered.length === 0 ? "0" : `${page * pageSize + 1} to ${Math.min((page + 1) * pageSize, filtered.length)}`}
              </span>
              <button type="button" className="zl-ibtn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft size={15} /></button>
              <button type="button" className="zl-ibtn" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight size={15} /></button>
            </div>
          </div>
        </section>
      </div>

      {createOpen && c && (
        <LeadSheet orgId={c.orgId} plans={ctx.plans} staff={ctx.staff} fields={fields} defaultOwner={c.userId}
          onClose={() => setCreateOpen(false)}
          onSaved={(l) => { setLeads((p) => [l, ...p]); setCreateOpen(false); show("Lead created"); }} />
      )}
      {importOpen && c && (
        <ImportLeadsSheet orgId={c.orgId} onClose={() => setImportOpen(false)}
          onImported={(n) => { setImportOpen(false); loadLeads(c.orgId); show(`${n} lead${n === 1 ? "" : "s"} imported`); }} />
      )}
      {fieldsOpen && c && (
        <FieldManager orgId={c.orgId} rows={customRows} onClose={() => setFieldsOpen(false)} onChanged={setCustomRows} />
      )}
      {toast}
    </div>
  );
}

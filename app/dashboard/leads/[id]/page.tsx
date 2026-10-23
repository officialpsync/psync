"use client";
// app/dashboard/leads/[id]/page.tsx
// Zoho-style lead page.
// Left: Related List (jumps to sections). Main: Overview | Timeline.
// Overview = key-fields card (each user picks what's important, ps_layout_prefs 'lead_detail_key_fields'),
// then every field grouped by section, all inline-editable, then Notes, Open Tasks, Closed Tasks, Activities.
// Timeline = upcoming tasks + full history, filterable by type.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, Phone, MessageSquare, PhoneCall, Mail, Users as UsersIcon,
  StickyNote, ArrowRight, Clock, CheckCircle2, X, Plus, Pencil, Check, Settings2, Loader2, MoreHorizontal,
  Trash2, UserCheck, Sparkles, Filter as FilterIcon, ChevronUp,
} from "lucide-react";
import { Skeleton, useToast } from "../../components/ui";
import {
  supabase, buildFields, sectionsOf, rawValue, displayValue, loadLeadContext, loadPref, savePref,
  isOpen, formatDateTime, STATUS_META, SOURCE_LABELS, SOURCE_EMOJI, TASK_TYPE_LABELS, NAV_KEY,
  type Lead, type Activity, type ActivityType, type Task, type TaskType, type FieldDef, type Ctx,
  type LeadContext, type CustomFieldRow, type LeadStatus,
} from "../lib";
import { LeadsStyles, StatusPill } from "../components/LeadsStyles";
import { FieldInput, toDraft, fromDraft } from "../components/FieldInput";
import { FieldManager } from "../components/FieldManager";
import { ConvertSheet } from "../components/LeadSheets";

const ACTIVITY_META: Record<ActivityType, { label: string; verb: string; icon: React.ElementType }> = {
  note:          { label: "Note",          verb: "Note added",      icon: StickyNote },
  call:          { label: "Call",          verb: "Call logged",     icon: PhoneCall },
  whatsapp:      { label: "WhatsApp",      verb: "WhatsApp logged", icon: MessageSquare },
  email:         { label: "Email",         verb: "Email logged",    icon: Mail },
  meeting:       { label: "Meeting",       verb: "Meeting logged",  icon: UsersIcon },
  status_change: { label: "Status change", verb: "Status changed",  icon: ArrowRight },
};
const LOG_TYPES: ActivityType[] = ["call", "whatsapp", "email", "meeting"];
const DEFAULT_KEY_FIELDS = ["assigned_to", "phone", "email", "status", "source", "follow_up_at"];

// ── Inline editable value (Zoho: hover shows a pencil, click to edit) ────────

function InlineValue({ lead, field, ctx, onSave }: {
  lead: Lead; field: FieldDef; ctx: Ctx; onSave: (f: FieldDef, v: unknown) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function commitValue(v: unknown) {
    setSaving(true); setErr("");
    try { await onSave(field, v); setEditing(false); }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  function start() {
    if (!field.editable || editing || saving) return;
    if (field.type === "checkbox") { void commitValue(rawValue(lead, field) !== true); return; }
    setDraft(toDraft(field, rawValue(lead, field))); setErr(""); setEditing(true);
  }
  function commit() {
    const v = fromDraft(field, draft);
    if ((field.type === "name" || field.key === "phone") && !v) { setErr(`${field.label} can't be empty`); return; }
    void commitValue(v);
  }

  if (editing) {
    return (
      <div className="zd-edit">
        <div style={{ flex: 1, minWidth: 0 }}>
          <FieldInput field={field} draft={draft} onChange={setDraft} ctx={ctx} autoFocus onEnter={commit} onEscape={() => setEditing(false)} />
          {err && <div className="zd-err">{err}</div>}
        </div>
        <button type="button" className="zd-ibtn zd-ibtn--ok" onClick={commit} disabled={saving} aria-label="Save">
          {saving ? <Loader2 size={14} className="ps-spin" /> : <Check size={15} />}
        </button>
        <button type="button" className="zd-ibtn" onClick={() => setEditing(false)} aria-label="Cancel"><X size={15} /></button>
      </div>
    );
  }

  const text = displayValue(lead, field, ctx);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  let content: React.ReactNode = text || <span className="zd-empty">-</span>;
  if (field.type === "status") content = <StatusPill status={lead.status} />;
  else if (field.type === "phone" && text) {
    const digits = text.replace(/\D/g, "");
    content = (
      <>
        <a className="zd-link" href={`tel:${text}`} onClick={stop}>{text}</a>
        <a className="zd-call" href={`https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`} target="_blank" rel="noreferrer" onClick={stop} title="WhatsApp"><MessageSquare size={11} /></a>
      </>
    );
  } else if (field.type === "email" && text) content = <a className="zd-link" href={`mailto:${text}`} onClick={stop}>{text}</a>;
  else if (field.key === "follow_up_at" && text && isOpen(lead) && new Date(lead.follow_up_at!) < new Date()) {
    content = <span style={{ color: "var(--red)", fontWeight: 600 }}>{text} · overdue</span>;
  }

  return (
    <div className="zd-val" data-editable={field.editable} onClick={start} title={field.editable ? "Click to edit" : undefined}>
      {content}
      {field.editable && <Pencil size={12} className="zd-pen" />}
      {err && <span className="zd-err">{err}</span>}
    </div>
  );
}

function FieldRow({ lead, field, ctx, onSave }: { lead: Lead; field: FieldDef; ctx: Ctx; onSave: (f: FieldDef, v: unknown) => Promise<void> }) {
  return (
    <div className={`zd-row${field.type === "textarea" ? " zd-row--wide" : ""}`}>
      <div className="zd-label">{field.label}</div>
      <InlineValue lead={lead} field={field} ctx={ctx} onSave={onSave} />
    </div>
  );
}

// ── Key-fields picker ────────────────────────────────────────────────────────

function KeyFieldsPicker({ fields, visible, onChange, onClose }: {
  fields: FieldDef[]; visible: string[]; onChange: (v: string[]) => void; onClose: () => void;
}) {
  const pickable = fields.filter((f) => f.key !== "full_name");
  const ordered = [...visible.map((k) => pickable.find((f) => f.key === k)).filter(Boolean) as FieldDef[], ...pickable.filter((f) => !visible.includes(f.key))];
  function move(key: string, dir: -1 | 1) {
    const i = visible.indexOf(key); const j = i + dir;
    if (i < 0 || j < 0 || j >= visible.length) return;
    const n = [...visible]; [n[i], n[j]] = [n[j], n[i]]; onChange(n);
  }
  return (
    <div className="zl-pop" style={{ top: 40, right: 8 }} onClick={(e) => e.stopPropagation()}>
      <div className="zl-pop-title">Show at the top</div>
      <div className="zl-pop-list">
        {ordered.map((f) => {
          const on = visible.includes(f.key); const i = visible.indexOf(f.key);
          return (
            <div key={f.key} className="zl-pop-row" data-on={on}>
              <label><input type="checkbox" checked={on} onChange={() => onChange(on ? visible.filter((k) => k !== f.key) : [...visible, f.key])} />{f.label}</label>
              {on && (
                <>
                  <button type="button" className="zl-ibtn" style={{ width: 22, height: 22 }} disabled={i === 0} onClick={() => move(f.key, -1)} aria-label="Move up"><ChevronUp size={12} /></button>
                  <button type="button" className="zl-ibtn" style={{ width: 22, height: 22 }} disabled={i === visible.length - 1} onClick={() => move(f.key, 1)} aria-label="Move down"><ChevronDown size={12} /></button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="zl-pop-foot">
        <button type="button" className="zl-btn zl-btn--sm" onClick={() => onChange(DEFAULT_KEY_FIELDS)}>Reset</button>
        <button type="button" className="zl-btn zl-btn--sm zl-btn--primary" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

// ── Composer (notes and logged activities) ───────────────────────────────────

function Composer({ types, placeholder, onLog }: { types: ActivityType[]; placeholder: string; onLog: (t: ActivityType, text: string) => Promise<void> }) {
  const [type, setType] = useState<ActivityType>(types[0]);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!text.trim()) return;
    setSaving(true);
    try { await onLog(type, text.trim()); setText(""); } finally { setSaving(false); }
  }
  return (
    <div style={{ marginBottom: 6 }}>
      {types.length > 1 && (
        <div className="zd-chips">
          {types.map((t) => {
            const M = ACTIVITY_META[t]; const Icon = M.icon;
            return <button key={t} type="button" className="zd-chip" data-on={type === t} onClick={() => setType(t)}><Icon size={12} />{M.label}</button>;
          })}
        </div>
      )}
      <textarea className="zl-in" rows={2} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }} />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button type="button" className="zl-btn zl-btn--sm zl-btn--primary" onClick={submit} disabled={!text.trim() || saving}>
          {saving ? <Loader2 size={13} className="ps-spin" /> : <Plus size={13} />} Save
        </button>
      </div>
    </div>
  );
}

// ── New task sheet (logic unchanged) ─────────────────────────────────────────

function NewTaskSheet({ leadId, orgId, staff, defaultAssignee, onClose, onCreated }: {
  leadId: string; orgId: string; staff: { user_id: string; name: string }[]; defaultAssignee: string | null;
  onClose: () => void; onCreated: (t: Task) => void;
}) {
  const [type, setType] = useState<TaskType>("call");
  const [dueDate, setDueDate] = useState(() => { const d = new Date(Date.now() + 3600000); d.setMinutes(0, 0, 0); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; });
  const [assignedTo, setAssignedTo] = useState(defaultAssignee ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true); setError("");
    const { data, error: err } = await supabase.from("lead_tasks").insert({
      org_id: orgId, lead_id: leadId, type, due_at: new Date(dueDate).toISOString(),
      assigned_to: assignedTo || null, notes: notes.trim() || null, status: "pending",
    }).select("*").single();
    if (err) { setError(err.message); setSaving(false); return; }
    onCreated(data as Task);
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "440px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar"><div className="ps-sheet-title">New task</div><button className="ps-icon-btn" onClick={onClose}><X size={18} /></button></div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div className="ps-error">{error}</div>}
          <div className="ps-field">
            <span className="ps-label">Type</span>
            <div className="zd-chips">
              {(Object.keys(TASK_TYPE_LABELS) as TaskType[]).map((t) => <button key={t} type="button" className="zd-chip" data-on={type === t} onClick={() => setType(t)}>{TASK_TYPE_LABELS[t]}</button>)}
            </div>
          </div>
          <div className="ps-field"><label className="ps-label">Due</label><input className="ps-input" type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={{ colorScheme: "light" }} /></div>
          <div className="ps-field">
            <label className="ps-label">Assign to</label>
            <select className="ps-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
            </select>
          </div>
          <div className="ps-field"><label className="ps-label">Notes (optional)</label><textarea className="ps-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What needs to happen?" /></div>
        </div>
        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>{saving && <Loader2 size={15} className="ps-spin" />}{saving ? "Saving…" : "Create task"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type TLFilter = "all" | ActivityType | "task";

export default function LeadDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { toast, show } = useToast();

  const [c, setC] = useState<LeadContext | null>(null);
  const [customRows, setCustomRows] = useState<CustomFieldRow[]>([]);
  const [lead, setLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [keyFields, setKeyFields] = useState<string[]>(DEFAULT_KEY_FIELDS);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"overview" | "timeline">("overview");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [tlFilter, setTlFilter] = useState<TLFilter>("all");
  const [navIds, setNavIds] = useState<string[]>([]);

  const fields = useMemo(() => buildFields(customRows), [customRows]);
  const ctx: Ctx = useMemo(() => ({ staff: c?.staff ?? [], plans: c?.plans ?? [] }), [c]);

  const load = useCallback(async () => {
    setLoading(true);
    const lc = await loadLeadContext();
    if (!lc) { setLoading(false); return; }
    setC(lc); setCustomRows(lc.customRows);
    const [{ data: leadData }, { data: act }, { data: tk }, pref] = await Promise.all([
      supabase.from("leads").select("*, membership_plans(name)").eq("id", id).single(),
      supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("lead_tasks").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
      loadPref<{ visible?: string[] }>(lc.userId, "lead_detail_key_fields"),
    ]);
    setLead((leadData as Lead) ?? null);
    setActivities((act as Activity[]) ?? []);
    setTasks((tk as Task[]) ?? []);
    if (pref?.visible?.length) setKeyFields(pref.visible);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { setNavIds(JSON.parse(sessionStorage.getItem(NAV_KEY) || "[]")); } catch { setNavIds([]); } }, []);

  // ── Mutations ──

  async function logActivity(type: ActivityType, content: string) {
    if (!lead || !c) return;
    const { data, error } = await supabase.from("lead_activities")
      .insert({ org_id: lead.org_id, lead_id: lead.id, type, content, created_by: c.userId }).select("*").single();
    if (error) { show("Couldn't save", "error"); return; }
    setActivities((p) => [data as Activity, ...p]);
  }

  async function saveField(f: FieldDef, v: unknown) {
    if (!lead) return;
    const patch: Record<string, unknown> = f.custom
      ? { custom: { ...(lead.custom ?? {}), [f.key.slice(3)]: v } }
      : { [f.key]: v };
    const prevStatus = lead.status;
    const { data, error } = await supabase.from("leads").update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", lead.id).select("*, membership_plans(name)").single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't save");
    setLead(data as Lead);
    if (f.key === "status" && v !== prevStatus) {
      await logActivity("status_change", `${STATUS_META[prevStatus].label} → ${STATUS_META[v as LeadStatus].label}`);
    }
  }

  async function persistKeyFields(next: string[]) {
    setKeyFields(next);
    if (c) await savePref(c.orgId, c.userId, "lead_detail_key_fields", { visible: next });
  }

  async function completeTask(tid: string) {
    const now = new Date().toISOString();
    const { error } = await supabase.from("lead_tasks").update({ status: "done", completed_at: now }).eq("id", tid);
    if (!error) setTasks((p) => p.map((t) => (t.id === tid ? { ...t, status: "done", completed_at: now } : t)));
  }
  async function cancelTask(tid: string) {
    const { error } = await supabase.from("lead_tasks").update({ status: "cancelled" }).eq("id", tid);
    if (!error) setTasks((p) => p.map((t) => (t.id === tid ? { ...t, status: "cancelled" } : t)));
  }
  async function deleteTask(tid: string) {
    const { error } = await supabase.from("lead_tasks").delete().eq("id", tid);
    if (!error) setTasks((p) => p.filter((t) => t.id !== tid));
  }
  async function deleteLead() {
    if (!lead || !confirm(`Delete ${lead.full_name}? Their tasks and history are removed too.`)) return;
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) { show("Couldn't delete: " + error.message, "error"); return; }
    router.push("/dashboard/leads");
  }

  function jump(sectionId: string) {
    setTab("overview");
    setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  // ── Loading / missing ──

  if (loading) {
    return (
      <div className="zd-page">
        <LeadsStyles />
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton w={260} h={40} />
          <Skeleton w="100%" h={180} r={8} />
          <Skeleton w="100%" h={360} r={8} />
        </div>
      </div>
    );
  }
  if (!lead) {
    return (
      <div className="zd-page">
        <LeadsStyles />
        <button type="button" className="zl-btn" onClick={() => router.push("/dashboard/leads")}><ArrowLeft size={14} /> Leads</button>
        <div className="zl-empty"><strong>Lead not found</strong>It may have been deleted.</div>
      </div>
    );
  }

  // ── Derived ──

  const pending = tasks.filter((t) => t.status === "pending").sort((a, b) => a.due_at.localeCompare(b.due_at));
  const closed = tasks.filter((t) => t.status !== "pending");
  const overdueTasks = pending.filter((t) => new Date(t.due_at) < new Date()).length;
  const notes = activities.filter((a) => a.type === "note");
  const logged = activities.filter((a) => LOG_TYPES.includes(a.type));
  const staffName = (uid: string | null) => (!uid ? "System" : uid === c?.userId ? "You" : ctx.staff.find((s) => s.user_id === uid)?.name ?? "Staff");

  const digits = (lead.phone ?? "").replace(/\D/g, "");
  const waHref = digits ? `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}` : undefined;

  const navIdx = navIds.indexOf(lead.id);
  const prevId = navIdx > 0 ? navIds[navIdx - 1] : null;
  const nextId = navIdx >= 0 && navIdx < navIds.length - 1 ? navIds[navIdx + 1] : null;

  const keyShown = keyFields.map((k) => fields.find((f) => f.key === k)).filter(Boolean) as FieldDef[];
  const sections = sectionsOf(fields);

  // Timeline: activities + completed tasks + creation, newest first, grouped by day
  type TL = { id: string; at: string; kind: TLFilter; icon: React.ElementType; text: React.ReactNode; by?: string };
  const tl: TL[] = [
    ...activities.map<TL>((a) => ({
      id: a.id, at: a.created_at, kind: a.type, icon: ACTIVITY_META[a.type].icon, by: staffName(a.created_by),
      text: a.type === "status_change"
        ? <>Lead Status was updated: <strong>{a.content}</strong></>
        : <><strong>{ACTIVITY_META[a.type].verb}</strong>{" "}<span style={{ whiteSpace: "pre-line" }}>{a.content}</span></>,
    })),
    ...tasks.filter((t) => t.status === "done" && t.completed_at).map<TL>((t) => ({
      id: `t-${t.id}`, at: t.completed_at!, kind: "task", icon: CheckCircle2, by: staffName(t.assigned_to),
      text: <><strong>Task completed:</strong> {TASK_TYPE_LABELS[t.type]}{t.notes ? `, ${t.notes}` : ""}</>,
    })),
    {
      id: "created", at: lead.created_at, kind: "all", icon: Sparkles,
      text: <><strong>Lead created</strong>{lead.source ? ` from ${SOURCE_LABELS[lead.source]}` : ""}</>,
    },
  ].filter((x) => tlFilter === "all" || x.kind === tlFilter)
    .sort((a, b) => b.at.localeCompare(a.at));
  const tlGroups: { day: string; items: TL[] }[] = [];
  tl.forEach((x) => {
    const day = new Date(x.at).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
    const last = tlGroups[tlGroups.length - 1];
    if (last && last.day === day) last.items.push(x); else tlGroups.push({ day, items: [x] });
  });

  const rel = [
    { id: "rel-notes", label: "Notes", count: notes.length },
    { id: "rel-open", label: "Open Tasks", count: pending.length },
    { id: "rel-closed", label: "Closed Tasks", count: closed.length },
    { id: "rel-acts", label: "Activities", count: logged.length },
    ...(lead.converted_member_id ? [{ id: "rel-member", label: "Converted Member", count: null as number | null }] : []),
  ];

  const taskRow = (t: Task, done: boolean) => {
    const overdue = !done && new Date(t.due_at) < new Date();
    return (
      <div key={t.id} className="zd-li">
        {done
          ? (t.status === "done" ? <CheckCircle2 size={18} style={{ color: "var(--green)", flexShrink: 0 }} /> : <X size={18} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />)
          : <button type="button" className="zd-circle" onClick={() => completeTask(t.id)} aria-label="Mark done" title="Mark done" />}
        <div className="zd-li-main">
          <div className="zd-li-title" style={done ? { color: "var(--text-tertiary)", textDecoration: t.status === "done" ? "line-through" : undefined } : undefined}>
            {TASK_TYPE_LABELS[t.type]}
            {overdue && <span className="zd-tag-red">Overdue</span>}
            {done && t.status === "cancelled" && <span className="zl-muted" style={{ fontWeight: 500, fontSize: 12 }}>Cancelled</span>}
          </div>
          <div className="zd-li-sub"><span><Clock size={11} style={{ verticalAlign: -1 }} /> {formatDateTime(t.due_at)}</span><span>{staffName(t.assigned_to)}</span></div>
          {t.notes && <div className="zd-li-text">{t.notes}</div>}
        </div>
        <button type="button" className="zl-ibtn" onClick={() => (done ? deleteTask(t.id) : cancelTask(t.id))} title={done ? "Remove" : "Cancel task"}>
          {done ? <Trash2 size={13} /> : <X size={14} />}
        </button>
      </div>
    );
  };

  return (
    <div className="zd-page" onClick={() => { setPickerOpen(false); setMenuOpen(false); }}>
      <LeadsStyles />

      <div className="zd-shell">
      {/* ═══ Header ═══ */}
      <header className="zd-head">
        <button type="button" className="zl-ibtn" onClick={() => router.push("/dashboard/leads")} aria-label="Back to leads"><ArrowLeft size={18} /></button>
        <div className="zd-avatar">{lead.full_name.trim().charAt(0).toUpperCase()}</div>
        <div style={{ minWidth: 0 }}>
          <div className="zd-name">{lead.full_name}</div>
          <div className="zd-meta">
            <StatusPill status={lead.status} />
            {overdueTasks > 0 && <span className="zd-overdue">{overdueTasks} overdue</span>}
            {lead.source && <span>{SOURCE_EMOJI[lead.source]} {SOURCE_LABELS[lead.source]}</span>}
            <span>Owner: {lead.assigned_to ? staffName(lead.assigned_to) : "Unassigned"}</span>
          </div>
        </div>
        <div className="zd-actions" onClick={(e) => e.stopPropagation()}>
          {lead.phone && <a className="zl-btn zl-btn--primary" href={`tel:${lead.phone}`}><Phone size={14} /> Call</a>}
          {waHref && <a className="zl-btn" href={waHref} target="_blank" rel="noreferrer"><MessageSquare size={14} /> WhatsApp</a>}
          {lead.email && <a className="zl-btn" href={`mailto:${lead.email}`}><Mail size={14} /> Email</a>}
          {isOpen(lead) && <button type="button" className="zl-btn" onClick={() => setConvertOpen(true)}><UserCheck size={14} /> Convert</button>}
          <button type="button" className="zl-btn" onClick={() => setTaskOpen(true)}><Plus size={14} /> Task</button>
          <button type="button" className="zl-ibtn" onClick={() => setMenuOpen((o) => !o)} aria-label="More"><MoreHorizontal size={18} /></button>
          {menuOpen && (
            <div className="zd-menu">
              {c?.canManageFields && <button type="button" onClick={() => { setMenuOpen(false); setFieldsOpen(true); }}><Settings2 size={14} /> Manage fields</button>}
              <button type="button" style={{ color: "var(--red)" }} onClick={() => { setMenuOpen(false); deleteLead(); }}><Trash2 size={14} /> Delete lead</button>
            </div>
          )}
          <button type="button" className="zl-ibtn" disabled={!prevId} onClick={() => prevId && router.push(`/dashboard/leads/${prevId}`)} aria-label="Previous lead"><ChevronLeft size={18} /></button>
          <button type="button" className="zl-ibtn" disabled={!nextId} onClick={() => nextId && router.push(`/dashboard/leads/${nextId}`)} aria-label="Next lead"><ChevronRight size={18} /></button>
        </div>
      </header>

      <div className="zd-layout">
        {/* ═══ Related list ═══ */}
        <nav className="zd-rel" aria-label="Related list">
          <div className="zd-rel-inner">
            <h3>Related List</h3>
            {rel.map((r) => (
              <button key={r.id} type="button" className="zd-rel-item" onClick={() => jump(r.id)}>
                <span>{r.label}</span>
                {r.count !== null && r.count > 0 && <span className="zl-badge">{r.count}</span>}
              </button>
            ))}
            {c?.canManageFields && (
              <>
                <h3 style={{ marginTop: 16 }}>Setup</h3>
                <button type="button" className="zd-rel-item zd-rel-link" onClick={() => setFieldsOpen(true)}>Manage lead fields</button>
              </>
            )}
          </div>
        </nav>

        <main className="zd-main">
          <div className="zd-tabs" role="tablist">
            <button type="button" role="tab" className="zd-tab" data-on={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
            <button type="button" role="tab" className="zd-tab" data-on={tab === "timeline"} onClick={() => setTab("timeline")}>Timeline</button>
          </div>

          {tab === "overview" ? (
            <>
              {/* Key fields: what this user decided matters most */}
              <section className="zd-card">
                <div className="zd-gear" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="zl-ibtn" onClick={() => setPickerOpen((o) => !o)} title="Choose what shows here" aria-label="Customize key fields"><Settings2 size={15} /></button>
                </div>
                {pickerOpen && <KeyFieldsPicker fields={fields} visible={keyFields} onChange={persistKeyFields} onClose={() => setPickerOpen(false)} />}
                <div className="zd-card-b" style={{ paddingTop: 16, paddingBottom: 16 }}>
                  {keyShown.length === 0
                    ? <div className="zd-none">Nothing pinned. Use the gear to pick the fields that matter most.</div>
                    : <div className="zd-grid zd-grid--one">{keyShown.map((f) => <FieldRow key={f.key} lead={lead} field={f} ctx={ctx} onSave={saveField} />)}</div>}
                </div>
              </section>

              {/* All fields by section */}
              <section className="zd-card">
                <div className="zd-card-h">
                  <button type="button" className="zd-toggle" onClick={() => setDetailsOpen((o) => !o)}>
                    {detailsOpen ? "Hide Details" : "Show Details"} {detailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {c?.canManageFields && <button type="button" className="zl-btn zl-btn--sm" onClick={() => setFieldsOpen(true)}><Plus size={13} /> Add field</button>}
                </div>
                {detailsOpen && (
                  <div className="zd-card-b">
                    {sections.map((sec) => (
                      <div key={sec} style={{ marginBottom: 10 }}>
                        <div className="zd-sec-title">{sec}</div>
                        <div className="zd-grid">
                          {fields.filter((f) => f.section === sec).map((f) => <FieldRow key={f.key} lead={lead} field={f} ctx={ctx} onSave={saveField} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Notes */}
              <section className="zd-card" id="rel-notes">
                <div className="zd-card-h"><span>Notes<small>{notes.length}</small></span></div>
                <div className="zd-card-b">
                  <Composer types={["note"]} placeholder="Add a note" onLog={logActivity} />
                  {notes.length === 0 ? <div className="zd-none">No notes yet</div> : notes.map((a) => (
                    <div key={a.id} className="zd-li">
                      <StickyNote size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }} />
                      <div className="zd-li-main">
                        <div className="zd-li-text" style={{ marginTop: 0, color: "var(--text-primary)" }}>{a.content}</div>
                        <div className="zd-li-sub">{staffName(a.created_by)} · {formatDateTime(a.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Open tasks */}
              <section className="zd-card" id="rel-open">
                <div className="zd-card-h">
                  <span>Open Tasks<small>{pending.length}</small></span>
                  <button type="button" className="zl-btn zl-btn--sm" onClick={(e) => { e.stopPropagation(); setTaskOpen(true); }}><Plus size={13} /> New task</button>
                </div>
                <div className="zd-card-b">
                  {pending.length === 0 ? <div className="zd-none">No open tasks. Schedule the next call or visit so this lead doesn't go cold.</div> : pending.map((t) => taskRow(t, false))}
                </div>
              </section>

              {/* Closed tasks */}
              <section className="zd-card" id="rel-closed">
                <div className="zd-card-h"><span>Closed Tasks<small>{closed.length}</small></span></div>
                <div className="zd-card-b">
                  {closed.length === 0 ? <div className="zd-none">Nothing completed yet</div> : closed.map((t) => taskRow(t, true))}
                </div>
              </section>

              {/* Activities */}
              <section className="zd-card" id="rel-acts">
                <div className="zd-card-h"><span>Activities<small>{logged.length}</small></span></div>
                <div className="zd-card-b">
                  <Composer types={LOG_TYPES} placeholder="What happened on this call, chat or meeting?" onLog={logActivity} />
                  {logged.length === 0 ? <div className="zd-none">No calls, chats or meetings logged yet</div> : logged.map((a) => {
                    const M = ACTIVITY_META[a.type]; const Icon = M.icon;
                    return (
                      <div key={a.id} className="zd-li">
                        <Icon size={15} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 2 }} />
                        <div className="zd-li-main">
                          <div className="zd-li-title">{M.label}</div>
                          <div className="zd-li-text">{a.content}</div>
                          <div className="zd-li-sub">{staffName(a.created_by)} · {formatDateTime(a.created_at)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {lead.converted_member_id && (
                <section className="zd-card" id="rel-member">
                  <div className="zd-card-h"><span>Converted Member</span></div>
                  <div className="zd-card-b">
                    <button type="button" className="zl-btn" onClick={() => router.push(`/dashboard/members/${lead.converted_member_id}`)}>
                      <UserCheck size={14} /> Open member profile
                    </button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <>
              <section className="zd-card">
                <div className="zd-card-h"><span>Upcoming Actions<small>{pending.length}</small></span></div>
                <div className="zd-card-b">
                  {pending.length === 0 ? <div className="zd-none">No upcoming actions</div> : pending.map((t) => taskRow(t, false))}
                </div>
              </section>

              <section className="zd-card">
                <div className="zd-card-h">
                  <span>Timeline History</span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 500, fontSize: 12.5, color: "var(--text-secondary)" }}>
                    <FilterIcon size={13} />
                    <select className="zl-in" style={{ width: 150, height: 28 }} value={tlFilter} onChange={(e) => setTlFilter(e.target.value as TLFilter)}>
                      <option value="all">All activity</option>
                      <option value="note">Notes</option>
                      <option value="call">Calls</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Emails</option>
                      <option value="meeting">Meetings</option>
                      <option value="status_change">Status changes</option>
                      <option value="task">Completed tasks</option>
                    </select>
                  </label>
                </div>
                <div className="zd-card-b">
                  {tlGroups.length === 0 ? <div className="zd-none">Nothing here yet</div> : (
                    <div className="zd-tl">
                      {tlGroups.map((g) => (
                        <div key={g.day}>
                          <div className="zd-tl-day">{g.day}</div>
                          {g.items.map((x) => {
                            const Icon = x.icon;
                            return (
                              <div key={x.id} className="zd-tl-item">
                                <div className="zd-tl-time">{new Date(x.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
                                <div className="zd-tl-icon"><Icon size={14} /></div>
                                <div>
                                  <div className="zd-tl-text">{x.text}</div>
                                  {x.by && <div className="zd-tl-by">by {x.by} · {formatDateTime(x.at)}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
      </div>{/* /zd-shell */}

      {taskOpen && c && (
        <NewTaskSheet leadId={lead.id} orgId={lead.org_id} staff={ctx.staff} defaultAssignee={lead.assigned_to}
          onClose={() => setTaskOpen(false)}
          onCreated={(t) => { setTasks((p) => [...p, t]); setTaskOpen(false); show("Task created"); }} />
      )}
      {convertOpen && c && (
        <ConvertSheet lead={lead} orgId={lead.org_id} plans={ctx.plans} onClose={() => setConvertOpen(false)}
          onConverted={() => { setConvertOpen(false); show(`${lead.full_name} is now a member`); load(); }} />
      )}
      {fieldsOpen && c && (
        <FieldManager orgId={c.orgId} rows={customRows} onClose={() => setFieldsOpen(false)} onChanged={setCustomRows} />
      )}
      {toast}
    </div>
  );
}

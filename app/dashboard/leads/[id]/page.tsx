"use client";
// app/dashboard/leads/[id]/page.tsx
// Full lead profile: activity timeline, follow-up tasks, assignment, and quick actions

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  ChevronLeft, Loader2, Plus, Check, X, Phone, Mail, Edit2,
  MessageSquare, PhoneCall, Mail as MailIcon, Users as UsersIcon,
  StickyNote, Clock, CheckCircle2, ArrowRight, Trash2,
} from "lucide-react";
import { Avatar, formatDate, Skeleton, useToast } from "../../components/ui";

const supabase = createClient();

// ── Types ────────────────────────────────────────────────────────────────

type LeadStatus = "new" | "contacted" | "interested" | "trial" | "converted" | "lost";
type LeadSource = "walk_in" | "instagram" | "facebook" | "referral" | "google" | "whatsapp" | "website" | "other";

type Lead = {
  id: string; org_id: string; branch_id: string | null; assigned_to: string | null;
  full_name: string; phone: string | null; email: string | null;
  source: LeadSource | null; interested_plan: string | null;
  status: LeadStatus; follow_up_at: string | null; notes: string | null;
  converted_member_id: string | null; created_at: string; updated_at: string;
  membership_plans?: { name: string } | null;
};

type ActivityType = "note" | "call" | "whatsapp" | "email" | "meeting" | "status_change";
type Activity = {
  id: string; lead_id: string; type: ActivityType; content: string;
  created_by: string | null; created_at: string;
};

type TaskType = "call" | "visit" | "whatsapp" | "email" | "other";
type TaskStatus = "pending" | "done" | "cancelled";
type Task = {
  id: string; lead_id: string; assigned_to: string | null; type: TaskType;
  due_at: string; notes: string | null; status: TaskStatus; completed_at: string | null;
};

type StaffMember = { id: string; user_id: string; name: string };
type Plan = { id: string; name: string };

const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string; dot: string }> = {
  new:        { label: "New",        color: "var(--accent)",       bg: "var(--accent-dim)", dot: "#0071e3" },
  contacted:  { label: "Contacted",  color: "var(--amber)",        bg: "var(--amber-dim)",  dot: "#ff9f0a" },
  interested: { label: "Interested", color: "var(--purple)",       bg: "var(--purple-dim)", dot: "#af52de" },
  trial:      { label: "Trial",      color: "var(--teal)",         bg: "var(--teal-dim)",   dot: "#30b0c7" },
  converted:  { label: "Converted",  color: "var(--green)",        bg: "var(--green-dim)",  dot: "#34c759" },
  lost:       { label: "Lost",       color: "var(--text-tertiary)",bg: "var(--fill)",       dot: "#8a8a8e" },
};

const SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: "Walk-in", instagram: "Instagram", facebook: "Facebook",
  referral: "Referral", google: "Google", whatsapp: "WhatsApp",
  website: "Website", other: "Other",
};

const SOURCE_EMOJI: Record<LeadSource, string> = {
  walk_in: "🚶", instagram: "📸", facebook: "👥", referral: "🤝",
  google: "🔍", whatsapp: "💬", website: "🌐", other: "📋",
};

const ACTIVITY_META: Record<ActivityType, { label: string; icon: React.ElementType; color: string }> = {
  note:          { label: "Note",          icon: StickyNote,   color: "var(--text-secondary)" },
  call:          { label: "Call",          icon: PhoneCall,    color: "var(--accent)" },
  whatsapp:      { label: "WhatsApp",      icon: MessageSquare,color: "var(--green)" },
  email:         { label: "Email",         icon: MailIcon,     color: "var(--purple)" },
  meeting:       { label: "Meeting",       icon: UsersIcon,    color: "var(--amber)" },
  status_change: { label: "Status change", icon: ArrowRight,   color: "var(--text-tertiary)" },
};

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  call: "Call", visit: "Visit", whatsapp: "WhatsApp", email: "Email", other: "Other",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso.slice(0, 10));
}

// ── Log activity composer ───────────────────────────────────────────────

function ActivityComposer({ leadId, orgId, onLogged }: {
  leadId: string; orgId: string; onLogged: (a: Activity) => void;
}) {
  const [type, setType] = useState<ActivityType>("note");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleLog() {
    if (!content.trim()) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("lead_activities")
      .insert({ org_id: orgId, lead_id: leadId, type, content: content.trim(), created_by: user?.id ?? null })
      .select("*")
      .single();
    setSaving(false);
    if (!error && data) { onLogged(data as Activity); setContent(""); setType("note"); }
  }

  const TYPES: ActivityType[] = ["note", "call", "whatsapp", "email", "meeting"];

  return (
    <div className="ps-card ps-card-body" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {TYPES.map((t) => {
          const meta = ACTIVITY_META[t];
          const Icon = meta.icon;
          const active = type === t;
          return (
            <button key={t} type="button" onClick={() => setType(t)}
              style={{
                display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 20,
                fontSize: 12.5, cursor: "pointer",
                border: active ? `1.5px solid ${meta.color}` : "1.5px solid var(--separator)",
                background: active ? "var(--fill)" : "transparent",
                color: active ? meta.color : "var(--text-secondary)",
                fontWeight: active ? 600 : 400,
              }}>
              <Icon size={12} /> {meta.label}
            </button>
          );
        })}
      </div>
      <textarea
        className="ps-input"
        rows={2}
        placeholder={type === "note" ? "Add a note…" : `What happened on this ${ACTIVITY_META[type].label.toLowerCase()}?`}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={handleLog} disabled={!content.trim() || saving}>
          {saving ? <Loader2 size={13} className="ps-spin" /> : <Plus size={13} />}
          Log
        </button>
      </div>
    </div>
  );
}

// ── New task sheet ───────────────────────────────────────────────────────

function NewTaskSheet({ leadId, orgId, staff, defaultAssignee, onClose, onCreated }: {
  leadId: string; orgId: string; staff: StaffMember[]; defaultAssignee: string | null;
  onClose: () => void; onCreated: (t: Task) => void;
}) {
  const [type, setType] = useState<TaskType>("call");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 16));
  const [assignedTo, setAssignedTo] = useState(defaultAssignee ?? "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true); setError("");
    const { data, error: err } = await supabase
      .from("lead_tasks")
      .insert({
        org_id: orgId, lead_id: leadId, type,
        due_at: new Date(dueDate).toISOString(),
        assigned_to: assignedTo || null,
        notes: notes.trim() || null,
        status: "pending",
      })
      .select("*")
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    onCreated(data as Task);
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "440px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div className="ps-sheet-title">New task</div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {error && <div className="ps-error">{error}</div>}

          <div className="ps-field">
            <span className="ps-label">Type</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["call", "visit", "whatsapp", "email", "other"] as TaskType[]).map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                    border: type === t ? "1.5px solid var(--accent)" : "1.5px solid var(--separator)",
                    background: type === t ? "var(--accent-dim)" : "transparent",
                    color: type === t ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: type === t ? 600 : 400,
                  }}>
                  {TASK_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="ps-field">
            <label className="ps-label">Due</label>
            <input className="ps-input" type="datetime-local" value={dueDate}
              onChange={(e) => setDueDate(e.target.value)} style={{ height: 42, colorScheme: "light" }} />
          </div>

          <div className="ps-field">
            <label className="ps-label">Assign to</label>
            <select className="ps-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
            </select>
          </div>

          <div className="ps-field">
            <label className="ps-label">Notes (optional)</label>
            <textarea className="ps-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What needs to happen?" />
          </div>
        </div>
        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Saving…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit lead sheet ──────────────────────────────────────────────────────

const SOURCES = Object.entries(SOURCE_LABELS) as [LeadSource, string][];

function EditLeadSheet({ lead, plans, onClose, onSaved }: {
  lead: Lead; plans: Plan[]; onClose: () => void; onSaved: (l: Lead) => void;
}) {
  const [name, setName] = useState(lead.full_name);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [source, setSource] = useState<LeadSource>(lead.source ?? "walk_in");
  const [planId, setPlanId] = useState(lead.interested_plan ?? "");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!phone.trim()) { setError("Phone is required"); return; }
    setSaving(true); setError("");

    const { data, error: err } = await supabase
      .from("leads")
      .update({
        full_name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        source: source || null,
        interested_plan: planId || null,
        notes: notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id)
      .select("*, membership_plans(name)")
      .single();

    if (err) { setError(err.message); setSaving(false); return; }
    onSaved(data as Lead);
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "480px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div className="ps-sheet-title">Edit lead</div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="ps-error">{error}</div>}

          <div className="ps-form-grid">
            <div className="ps-field ps-span-2">
              <label className="ps-label">Full name *</label>
              <input className="ps-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="ps-field">
              <label className="ps-label">Phone *</label>
              <input className="ps-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="ps-field">
              <label className="ps-label">Email</label>
              <input className="ps-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div className="ps-field">
            <span className="ps-label">Source</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SOURCES.map(([key, label]) => (
                <button key={key} type="button" onClick={() => setSource(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                    border: source === key ? "1.5px solid var(--accent)" : "1.5px solid var(--separator)",
                    background: source === key ? "var(--accent-dim)" : "transparent",
                    color: source === key ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: source === key ? 600 : 400,
                  }}
                  aria-pressed={source === key}>
                  {SOURCE_EMOJI[key]} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="ps-field">
            <label className="ps-label">Interested plan</label>
            <select className="ps-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Not sure yet</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="ps-field">
            <label className="ps-label">Notes</label>
            <textarea className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              placeholder="What did they say? What are they looking for?" />
          </div>
        </div>

        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function LeadDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { toast, show } = useToast();

  const [lead, setLead] = useState<Lead | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);
  const [tab, setTab] = useState<"timeline" | "tasks">("timeline");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const { data: leadData } = await supabase
      .from("leads")
      .select("*, membership_plans(name)")
      .eq("id", id)
      .single();
    if (!leadData) { setLoading(false); return; }
    setLead(leadData as Lead);

    const [{ data: actData }, { data: taskData }, { data: staffData }, { data: planData }, { data: { user } }] = await Promise.all([
      supabase.from("lead_activities").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
      supabase.from("lead_tasks").select("*").eq("lead_id", id).order("due_at", { ascending: true }),
      supabase.from("staff").select("id, user_id, name").eq("org_id", leadData.org_id).eq("is_active", true).order("name"),
      supabase.from("membership_plans").select("id, name").eq("org_id", leadData.org_id).eq("is_active", true),
      supabase.auth.getUser(),
    ]);

    setActivities((actData as Activity[]) || []);
    setTasks((taskData as Task[]) || []);
    setPlans((planData as Plan[]) || []);

    const staffList = (staffData as StaffMember[]) || [];
    // Make sure the signed-in user is assignable even if they were never added
    // as a row in the staff table (e.g. the gym owner account).
    if (user && !staffList.some((s) => s.user_id === user.id)) {
      const label = user.email ? `You (${user.email.split("@")[0]})` : "You";
      staffList.unshift({ id: "self", user_id: user.id, name: label });
    }
    setStaff(staffList);
    if (user) setMyUserId(user.id);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function handleAssign(userId: string) {
    if (!lead) return;
    setSavingAssign(true);
    const { error } = await supabase.from("leads").update({ assigned_to: userId || null, updated_at: new Date().toISOString() }).eq("id", lead.id);
    if (!error) {
      setLead({ ...lead, assigned_to: userId || null });
      show("Assignment updated");
    }
    setSavingAssign(false);
  }

  async function handleStatusChange(newStatus: LeadStatus) {
    if (!lead) return;
    const oldLabel = STATUS_META[lead.status].label;
    const newLabel = STATUS_META[newStatus].label;
    const { error } = await supabase.from("leads").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) { show("Couldn't update status", "error"); return; }
    setLead({ ...lead, status: newStatus });

    const { data: { user } } = await supabase.auth.getUser();
    const { data: act } = await supabase
      .from("lead_activities")
      .insert({ org_id: lead.org_id, lead_id: lead.id, type: "status_change", content: `${oldLabel} → ${newLabel}`, created_by: user?.id ?? null })
      .select("*")
      .single();
    if (act) setActivities((prev) => [act as Activity, ...prev]);
  }

  async function completeTask(taskId: string) {
    const { error } = await supabase
      .from("lead_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", taskId);
    if (!error) setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "done", completed_at: new Date().toISOString() } : t));
  }

  async function cancelTask(taskId: string) {
    const { error } = await supabase.from("lead_tasks").update({ status: "cancelled" }).eq("id", taskId);
    if (!error) setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "cancelled" } : t));
  }

  async function deleteTask(taskId: string) {
    const { error } = await supabase.from("lead_tasks").delete().eq("id", taskId);
    if (!error) setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  async function deleteLead() {
    if (!lead) return;
    if (!confirm(`Delete ${lead.full_name}? Their tasks and activity history will be removed too.`)) return;
    setDeleting(true);
    const { error } = await supabase.from("leads").delete().eq("id", lead.id);
    if (error) { show("Couldn't delete: " + error.message, "error"); setDeleting(false); return; }
    router.push("/dashboard/leads");
  }

  if (loading) {
    return (
      <div className="ps-page">
        <Skeleton w={60} h={16} />
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton w="100%" h={110} r={16} />
          <Skeleton w="100%" h={56} r={16} />
          <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
            <Skeleton w="100%" h={420} r={16} />
            <Skeleton w="100%" h={420} r={16} />
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="ps-page ps-page--narrow">
        <button type="button" className="ps-back" onClick={() => router.push("/dashboard/leads")}>
          <ChevronLeft size={20} />Leads
        </button>
        <div className="ps-card ps-empty">
          <div className="ps-empty-title">Lead not found</div>
        </div>
      </div>
    );
  }

  const meta = STATUS_META[lead.status];
  const pendingTasks = tasks.filter((t) => t.status === "pending").sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  const doneTasks = tasks.filter((t) => t.status !== "pending");
  const assignedStaff = staff.find((s) => s.user_id === lead.assigned_to);

  // ── Derived summary numbers ──
  const leadAgeDays = Math.max(0, Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86400000));
  const lastTouch = activities.find((a) => a.type !== "status_change");
  const nextTask = pendingTasks[0];
  const overdueCount = pendingTasks.filter((t) => new Date(t.due_at) < new Date()).length;

  // ── Quick-action links ──
  const digits = (lead.phone ?? "").replace(/\D/g, "");
  const waNumber = digits.length === 10 ? `91${digits}` : digits;
  const telHref = lead.phone ? `tel:${lead.phone}` : undefined;
  const waHref = waNumber ? `https://wa.me/${waNumber}` : undefined;
  const mailHref = lead.email ? `mailto:${lead.email}` : undefined;

  // ── Pipeline stepper ──
  const PIPELINE: LeadStatus[] = ["new", "contacted", "interested", "trial", "converted"];
  const isLost = lead.status === "lost";
  const currentStep = PIPELINE.indexOf(lead.status);

  // ── Timeline grouped by day ──
  function dayLabel(iso: string): string {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t.getTime() - d.getTime()) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }
  const grouped: { label: string; items: Activity[] }[] = [];
  for (const a of activities) {
    const label = dayLabel(a.created_at);
    const last = grouped[grouped.length - 1];
    if (last && last.label === label) last.items.push(a);
    else grouped.push({ label, items: [a] });
  }

  function actorName(userId: string | null): string {
    if (!userId) return "System";
    if (userId === myUserId) return "You";
    return staff.find((s) => s.user_id === userId)?.name ?? "Staff";
  }

  const sectionTitle: React.CSSProperties = { fontSize: 11.5, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 };

  return (
    <div className="ps-page" style={{ paddingBottom: 48 }}>
      <button type="button" className="ps-back" onClick={() => router.push("/dashboard/leads")}>
        <ChevronLeft size={20} />Leads
      </button>

      {/* ═══ Record header ═══ */}
      <div className="ps-card ps-card-body" style={{ marginBottom: 12 }}>
        <div className="ld-head">
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Avatar name={lead.full_name} size={52} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 21, fontWeight: 700, margin: 0, letterSpacing: "-0.01em" }}>{lead.full_name}</h1>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: meta.bg, color: meta.color, padding: "3px 10px", borderRadius: 20, fontSize: 12.5, fontWeight: 600 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.dot }} />
                  {meta.label}
                </span>
                {overdueCount > 0 && (
                  <span style={{ background: "var(--red-dim)", color: "var(--red)", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                    {overdueCount} overdue
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                {lead.source && <span>{SOURCE_EMOJI[lead.source]} {SOURCE_LABELS[lead.source]}</span>}
                <span>Owner: {assignedStaff?.name ?? "Unassigned"}</span>
                <span>Added {formatDate(lead.created_at.slice(0, 10))}</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a className="ps-btn ps-btn--secondary ps-btn--sm" href={telHref} aria-disabled={!telHref}
              style={!telHref ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
              <PhoneCall size={14} /> Call
            </a>
            <a className="ps-btn ps-btn--secondary ps-btn--sm" href={waHref} target="_blank" rel="noreferrer" aria-disabled={!waHref}
              style={!waHref ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
              <MessageSquare size={14} /> WhatsApp
            </a>
            <a className="ps-btn ps-btn--secondary ps-btn--sm" href={mailHref} aria-disabled={!mailHref}
              style={!mailHref ? { opacity: 0.4, pointerEvents: "none" } : undefined}>
              <MailIcon size={14} /> Email
            </a>
            <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => setEditOpen(true)}>
              <Edit2 size={13} /> Edit
            </button>
            {lead.converted_member_id ? (
              <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => router.push(`/dashboard/members/${lead.converted_member_id}`)}>
                View member <ArrowRight size={13} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ═══ Pipeline stepper ═══ */}
      <div className="ps-card" style={{ padding: 6, marginBottom: 16, display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flex: 1, minWidth: 0, gap: 4 }}>
          {PIPELINE.map((s, i) => {
            const m = STATUS_META[s];
            const done = !isLost && currentStep >= 0 && i < currentStep;
            const active = !isLost && i === currentStep;
            return (
              <button key={s} type="button" onClick={() => s !== lead.status && handleStatusChange(s)}
                title={`Move to ${m.label}`}
                style={{
                  flex: 1, minWidth: 0, padding: "9px 6px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  background: active ? m.bg : done ? "var(--fill)" : "transparent",
                  color: active ? m.color : done ? "var(--text-primary)" : "var(--text-tertiary)",
                  boxShadow: active ? `inset 0 0 0 1.5px ${m.dot}` : "none",
                }}>
                {done && <Check size={13} />}
                {m.label}
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => !isLost && handleStatusChange("lost")}
          style={{
            padding: "9px 14px", borderRadius: 10, border: "none", cursor: isLost ? "default" : "pointer", fontSize: 13,
            fontWeight: isLost ? 700 : 500,
            background: isLost ? "var(--red-dim)" : "transparent",
            color: isLost ? "var(--red)" : "var(--text-tertiary)",
          }}>
          {isLost ? "Lost" : "Mark lost"}
        </button>
      </div>

      {/* ═══ Two-column body ═══ */}
      <div className="ld-grid">
        {/* ── Left: summary + details ── */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="ps-card ps-card-body">
            <h2 style={{ ...sectionTitle, marginBottom: 12 }}>At a glance</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { label: "Lead age", value: leadAgeDays === 0 ? "Today" : `${leadAgeDays} day${leadAgeDays === 1 ? "" : "s"}` },
                { label: "Last touch", value: lastTouch ? timeAgo(lastTouch.created_at) : "Never" },
                { label: "Open tasks", value: String(pendingTasks.length), alert: overdueCount > 0 },
                { label: "Activities", value: String(activities.filter((a) => a.type !== "status_change").length) },
              ].map((s) => (
                <div key={s.label} style={{ background: "var(--fill)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: s.alert ? "var(--red)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
            {nextTask && (
              <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--separator)", display: "flex", alignItems: "center", gap: 10 }}>
                <Clock size={15} style={{ color: new Date(nextTask.due_at) < new Date() ? "var(--red)" : "var(--accent)", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Next up</div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                    {TASK_TYPE_LABELS[nextTask.type]} · {new Date(nextTask.due_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="ps-card ps-card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h2 style={sectionTitle}>Details</h2>
              <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 26 }} onClick={() => setEditOpen(true)}>
                <Edit2 size={12} /> Edit
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div className="ps-label" style={{ marginBottom: 5 }}>Status</div>
                <select className="ps-input" value={lead.status} onChange={(e) => handleStatusChange(e.target.value as LeadStatus)} style={{ height: 36, fontSize: 13.5 }}>
                  {(Object.keys(STATUS_META) as LeadStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_META[s].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="ps-label" style={{ marginBottom: 5 }}>Lead owner</div>
                <select className="ps-input" value={lead.assigned_to ?? ""} onChange={(e) => handleAssign(e.target.value)} disabled={savingAssign} style={{ height: 36, fontSize: 13.5 }}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid var(--separator)" }}>
              {[
                { label: "Phone", value: lead.phone, icon: Phone },
                { label: "Email", value: lead.email, icon: Mail },
                { label: "Source", value: lead.source ? `${SOURCE_EMOJI[lead.source]} ${SOURCE_LABELS[lead.source]}` : null, icon: null },
                { label: "Interested plan", value: lead.membership_plans?.name ?? null, icon: null },
                { label: "Created", value: formatDate(lead.created_at.slice(0, 10)), icon: null },
                { label: "Last updated", value: formatDate(lead.updated_at.slice(0, 10)), icon: null },
              ].map((f) => (
                <div key={f.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)", flexShrink: 0 }}>{f.label}</span>
                  <span style={{ fontSize: 13.5, textAlign: "right", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, color: f.value ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                    {f.icon && f.value && <f.icon size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />}
                    {f.value || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="ps-card ps-card-body">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h2 style={sectionTitle}>Notes</h2>
              <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 26 }} onClick={() => setEditOpen(true)}>
                <Edit2 size={12} /> {lead.notes ? "Edit" : "Add"}
              </button>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-line", color: lead.notes ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
              {lead.notes || "No notes yet."}
            </div>
          </div>

          <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" onClick={deleteLead} disabled={deleting}
            style={{ color: "var(--red)", alignSelf: "flex-start" }}>
            {deleting ? <Loader2 size={13} className="ps-spin" /> : <Trash2 size={13} />}
            Delete lead
          </button>
        </aside>

        {/* ── Right: working area ── */}
        <main style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--fill)", padding: 4, borderRadius: 12 }}>
              {([
                { key: "timeline" as const, label: "Timeline", count: activities.length },
                { key: "tasks" as const, label: "Tasks", count: pendingTasks.length },
              ]).map((t) => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  style={{
                    padding: "7px 16px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13.5,
                    fontWeight: tab === t.key ? 650 : 500,
                    background: tab === t.key ? "var(--surface)" : "transparent",
                    color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
                    boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                  {t.label}
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-tertiary)" }}>{t.count}</span>
                </button>
              ))}
            </div>
            <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setTaskSheetOpen(true)}>
              <Plus size={14} /> New task
            </button>
          </div>

          {tab === "timeline" ? (
            <>
              <ActivityComposer leadId={lead.id} orgId={lead.org_id} onLogged={(a) => setActivities((prev) => [a, ...prev])} />

              {activities.length === 0 ? (
                <div className="ps-card ps-empty" style={{ padding: 32 }}>
                  <div className="ps-empty-title">No activity yet</div>
                  <div className="ps-empty-text">Log a call, WhatsApp or note above to start the history.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  {grouped.map((g) => (
                    <div key={g.label}>
                      <div style={{ ...sectionTitle, marginBottom: 8 }}>{g.label}</div>
                      <div className="ps-card" style={{ padding: "4px 16px" }}>
                        {g.items.map((a, i) => {
                          const am = ACTIVITY_META[a.type];
                          const Icon = am.icon;
                          const isStatus = a.type === "status_change";
                          return (
                            <div key={a.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: i < g.items.length - 1 ? "1px solid var(--separator)" : undefined }}>
                              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--fill)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: am.color }}>
                                <Icon size={14} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                                  <span style={{ fontSize: 12.5, fontWeight: 600, color: am.color }}>{am.label}</span>
                                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", flexShrink: 0 }}>
                                    {new Date(a.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                                <div style={{ fontSize: isStatus ? 13 : 14, color: isStatus ? "var(--text-secondary)" : "var(--text-primary)", lineHeight: 1.5, marginTop: 2, whiteSpace: "pre-line" }}>
                                  {a.content}
                                </div>
                                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
                                  {actorName(a.created_by)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {pendingTasks.length === 0 ? (
                <div className="ps-card ps-empty" style={{ padding: 32 }}>
                  <div className="ps-empty-title">No open tasks</div>
                  <div className="ps-empty-text">Schedule the next call or visit so this lead doesn&apos;t go cold.</div>
                  <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => setTaskSheetOpen(true)}>
                    <Plus size={14} /> New task
                  </button>
                </div>
              ) : (
                <div className="ps-card" style={{ padding: "4px 16px" }}>
                  {pendingTasks.map((t, i) => {
                    const overdue = new Date(t.due_at) < new Date();
                    const assignee = staff.find((s) => s.user_id === t.assigned_to);
                    return (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < pendingTasks.length - 1 ? "1px solid var(--separator)" : undefined }}>
                        <button type="button" onClick={() => completeTask(t.id)}
                          style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${overdue ? "var(--red)" : "var(--text-tertiary)"}`, background: "none", cursor: "pointer", flexShrink: 0 }}
                          aria-label="Mark done" title="Mark done" />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                            {TASK_TYPE_LABELS[t.type]}
                            {overdue && <span style={{ background: "var(--red-dim)", color: "var(--red)", padding: "1px 8px", borderRadius: 10, fontSize: 11.5, fontWeight: 600 }}>Overdue</span>}
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Clock size={11} />
                              {new Date(t.due_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span>{assignee?.name ?? "Unassigned"}</span>
                          </div>
                          {t.notes && <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>{t.notes}</div>}
                        </div>
                        <button type="button" className="ps-icon-btn" style={{ width: 28, height: 28 }} onClick={() => cancelTask(t.id)} title="Cancel task">
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {doneTasks.length > 0 && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ ...sectionTitle, marginBottom: 8 }}>Completed and cancelled</div>
                  <div className="ps-card" style={{ padding: "4px 16px" }}>
                    {doneTasks.map((t, i) => (
                      <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < doneTasks.length - 1 ? "1px solid var(--separator)" : undefined }}>
                        {t.status === "done"
                          ? <CheckCircle2 size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
                          : <X size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, color: "var(--text-tertiary)", textDecoration: t.status === "done" ? "line-through" : undefined, flex: 1 }}>
                          {TASK_TYPE_LABELS[t.type]} · {formatDate(t.due_at.slice(0, 10))}
                        </span>
                        <button type="button" className="ps-icon-btn" style={{ width: 26, height: 26 }} onClick={() => deleteTask(t.id)} title="Remove">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {taskSheetOpen && (
        <NewTaskSheet
          leadId={lead.id}
          orgId={lead.org_id}
          staff={staff}
          defaultAssignee={lead.assigned_to}
          onClose={() => setTaskSheetOpen(false)}
          onCreated={(t) => { setTasks((prev) => [...prev, t]); setTaskSheetOpen(false); setTab("tasks"); show("Task created"); }}
        />
      )}

      {editOpen && (
        <EditLeadSheet
          lead={lead}
          plans={plans}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { setLead(updated); setEditOpen(false); show("Lead updated"); }}
        />
      )}

      {toast}

      <style>{`
        .ld-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .ld-grid { display: grid; grid-template-columns: 340px minmax(0, 1fr); gap: 16px; align-items: start; }
        .ld-grid > aside { position: sticky; top: 16px; }
        @media (max-width: 980px) {
          .ld-grid { grid-template-columns: 1fr; }
          .ld-grid > aside { position: static; }
        }
      `}</style>
    </div>
  );
}

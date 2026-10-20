"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import {
  Plus, Search, X, Loader2, ChevronRight, Phone, Mail,
  Calendar, AlertCircle, CheckCircle2, LayoutList, Columns3,
  ArrowRight, User, Edit2, Upload, Download,
  ChevronUp, ChevronDown, ListFilter, Check as CheckIcon,
  Trash2, ChevronLeft, Clock,
} from "lucide-react";
import { Avatar, cols, formatDate, Segmented, Skeleton, useToast } from "../components/ui";

const supabase = createClient();

// ---- Types ----
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

type Plan = { id: string; name: string };
type StaffMember = { id: string; user_id: string; name: string };

const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "interested", "trial", "converted", "lost"];

const STATUS_META: Record<LeadStatus, { label: string; color: string; bg: string; dot: string }> = {
  new:       { label: "New",       color: "var(--accent)",  bg: "var(--accent-dim)",           dot: "#0071e3" },
  contacted: { label: "Contacted", color: "var(--amber)",   bg: "var(--amber-dim)",            dot: "#ff9f0a" },
  interested:{ label: "Interested",color: "var(--purple)",  bg: "var(--purple-dim)",           dot: "#af52de" },
  trial:     { label: "Trial",     color: "var(--teal)",    bg: "var(--teal-dim)",             dot: "#30b0c7" },
  converted: { label: "Converted", color: "var(--green)",   bg: "var(--green-dim)",            dot: "#34c759" },
  lost:      { label: "Lost",      color: "var(--text-tertiary)", bg: "var(--fill)",           dot: "#8a8a8e" },
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

function StatusBadge({ status }: { status: LeadStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: m.bg, color: m.color, padding: "3px 10px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function isOverdue(lead: Lead): boolean {
  if (!lead.follow_up_at) return false;
  if (lead.status === "converted" || lead.status === "lost") return false;
  return new Date(lead.follow_up_at) < new Date();
}

function isDueToday(lead: Lead): boolean {
  if (!lead.follow_up_at) return false;
  if (lead.status === "converted" || lead.status === "lost") return false;
  const d = new Date(lead.follow_up_at);
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

// ---- Lead Sheet (create / edit) ----
function LeadSheet({ lead, orgId, plans, staff, onClose, onSaved }: {
  lead: Lead | null; orgId: string; plans: Plan[]; staff: StaffMember[];
  onClose: () => void; onSaved: (l: Lead) => void;
}) {
  const [name, setName] = useState(lead?.full_name ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [source, setSource] = useState<LeadSource>(lead?.source ?? "walk_in");
  const [status, setStatus] = useState<LeadStatus>(lead?.status ?? "new");
  const [planId, setPlanId] = useState(lead?.interested_plan ?? "");
  const [followUp, setFollowUp] = useState(
    lead?.follow_up_at ? new Date(lead.follow_up_at).toISOString().slice(0, 16) : ""
  );
  const [notes, setNotes] = useState(lead?.notes ?? "");
  const [assignedTo, setAssignedTo] = useState(lead?.assigned_to ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) { setError("Name is required"); return; }
    if (!phone.trim()) { setError("Phone is required"); return; }
    setSaving(true); setError("");

    const payload = {
      org_id: orgId,
      full_name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      source: source || null,
      status,
      interested_plan: planId || null,
      follow_up_at: followUp ? new Date(followUp).toISOString() : null,
      notes: notes.trim() || null,
      assigned_to: assignedTo || null,
      updated_at: new Date().toISOString(),
    };

    if (lead) {
      const { data, error: err } = await supabase.from("leads").update(payload).eq("id", lead.id).select("*, membership_plans(name)").single();
      if (err) { setError(err.message); setSaving(false); return; }
      onSaved(data as Lead);
    } else {
      const { data, error: err } = await supabase.from("leads").insert({ ...payload, created_at: new Date().toISOString() }).select("*, membership_plans(name)").single();
      if (err) { setError(err.message); setSaving(false); return; }
      onSaved(data as Lead);
    }
  }

  const SOURCES = Object.entries(SOURCE_LABELS) as [LeadSource, string][];
  const STATUSES = STATUS_ORDER.slice(0, 5); // exclude converted here

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "500px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">{lead ? "Edit lead" : "New lead"}</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {lead ? "Update lead details and follow-up" : "Add a new prospect to your pipeline"}
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="ps-error">{error}</div>}

          <div className="ps-form-grid">
            <div className="ps-field ps-span-2">
              <label className="ps-label">Full name *</label>
              <input className="ps-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Rahul Sharma" autoFocus />
            </div>
            <div className="ps-field">
              <label className="ps-label">Phone *</label>
              <input className="ps-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className="ps-field">
              <label className="ps-label">Email</label>
              <input className="ps-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@example.com" />
            </div>
          </div>

          <div className="ps-field">
            <span className="ps-label">Source</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SOURCES.map(([key, label]) => (
                <button key={key} type="button"
                  onClick={() => setSource(key)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                    border: source === key ? "1.5px solid var(--accent)" : "1.5px solid var(--separator)",
                    background: source === key ? "var(--accent-dim)" : "transparent",
                    color: source === key ? "var(--accent)" : "var(--text-secondary)",
                    fontWeight: source === key ? 600 : 400,
                  }}
                  aria-pressed={source === key}
                >
                  {SOURCE_EMOJI[key]} {label}
                </button>
              ))}
            </div>
          </div>

          <div className="ps-field">
            <span className="ps-label">Status</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATUSES.map((s) => {
                const m = STATUS_META[s];
                return (
                  <button key={s} type="button"
                    onClick={() => setStatus(s)}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                      border: status === s ? `1.5px solid ${m.dot}` : "1.5px solid var(--separator)",
                      background: status === s ? m.bg : "transparent",
                      color: status === s ? m.color : "var(--text-secondary)",
                      fontWeight: status === s ? 600 : 400,
                    }}
                    aria-pressed={status === s}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ps-form-grid">
            <div className="ps-field">
              <label className="ps-label">Interested plan</label>
              <select className="ps-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                <option value="">Not sure yet</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="ps-field">
              <label className="ps-label">Follow-up date</label>
              <input className="ps-input" type="datetime-local" value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                style={{ height: 42, colorScheme: "light" }} />
            </div>
            <div className="ps-field ps-span-2">
              <label className="ps-label">Assign to</label>
              <select className="ps-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="ps-field">
            <label className="ps-label">Notes</label>
            <textarea className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={3} placeholder="What did they say? What are they looking for?" />
          </div>
        </div>

        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Saving…" : lead ? "Save changes" : "Add lead"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Convert Sheet ----
function ConvertSheet({ lead, orgId, plans, onClose, onConverted }: {
  lead: Lead; orgId: string; plans: Plan[];
  onClose: () => void; onConverted: (memberId: string) => void;
}) {
  const [planId, setPlanId] = useState(lead.interested_plan ?? "");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<"cash" | "upi" | "card" | "online">("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedPlan = plans.find((p) => p.id === planId);

  async function handleConvert() {
    if (!planId) { setError("Select a membership plan"); return; }
    setSaving(true); setError("");

    try {
      // 1. Get branch_id
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", (await supabase.auth.getUser()).data.user!.id).single();

      // 2. Get plan details
      const { data: plan } = await supabase.from("membership_plans").select("price_paise, duration_days").eq("id", planId).single();
      if (!plan) throw new Error("Plan not found");

      // 3. Get branch
      const { data: branch } = await supabase.from("branches").select("id").eq("org_id", orgId).limit(1).single();

      // 4. Create member
      const { data: member, error: memErr } = await supabase.from("members").insert({
        org_id: orgId,
        branch_id: branch?.id ?? null,
        full_name: lead.full_name,
        phone: lead.phone,
        email: lead.email,
        status: "active",
      }).select("id").single();
      if (memErr) throw memErr;

      // 5. Create membership
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(start);
      end.setDate(end.getDate() + (plan.duration_days ?? 30));
      const iso = (d: Date) => d.toISOString().slice(0, 10);

      const { data: membership } = await supabase.from("memberships").insert({
        org_id: orgId, branch_id: branch?.id ?? null,
        member_id: member.id, plan_id: planId,
        start_date: iso(start), end_date: iso(end), status: "active",
      }).select("id").single();

      // 6. Record payment
      await supabase.from("payments").insert({
        org_id: orgId, branch_id: branch?.id ?? null,
        member_id: member.id, membership_id: membership?.id ?? null,
        amount_paise: plan.price_paise, total_paise: plan.price_paise,
        method, status: "paid", notes: `Converted from lead: ${lead.full_name}`,
      });

      // 7. Update lead
      await supabase.from("leads").update({
        status: "converted", converted_member_id: member.id, updated_at: new Date().toISOString(),
      }).eq("id", lead.id);

      onConverted(member.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSaving(false);
    }
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "460px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Convert to member</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {lead.full_name} will become a full member
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="ps-error">{error}</div>}

          <div style={{ background: "var(--fill)", borderRadius: 12, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={lead.full_name} size={40} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{lead.full_name}</div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>{lead.phone ?? lead.email ?? "No contact"}</div>
            </div>
          </div>

          <div className="ps-field">
            <label className="ps-label">Membership plan *</label>
            <select className="ps-input" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choose a plan</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="ps-form-grid">
            <div className="ps-field">
              <label className="ps-label">Start date</label>
              <input className="ps-input" type="date" value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ height: 42, colorScheme: "light" }} />
            </div>
            <div className="ps-field">
              <span className="ps-label">Paid by</span>
              <Segmented<"cash" | "upi" | "card" | "online">
                block label="Payment method" value={method} onChange={setMethod}
                options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }, { value: "online", label: "Online" }]}
              />
            </div>
          </div>

          {selectedPlan && (
            <div style={{ background: "var(--green-dim)", border: "1px solid rgba(52,199,89,0.2)", borderRadius: 12, padding: "12px 16px" }}>
              <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 500 }}>
                ✓ This will create a member profile, activate the {selectedPlan.name} plan, and record the payment automatically.
              </div>
            </div>
          )}
        </div>

        <div className="ps-sheet-footer">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleConvert} disabled={saving || !planId}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Converting…" : "Convert to member"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Sortable column header ----
type SortField = "full_name" | "source" | "plan" | "follow_up_at" | "status" | "created_at" | "owner" | "next_action" | "last_activity";

function SortableHeader({ field, label, sortField, sortDir, onSort }: {
  field: SortField; label: string; sortField: SortField; sortDir: "asc" | "desc";
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <button type="button" onClick={() => onSort(field)}
      style={{
        display: "flex", alignItems: "center", gap: 3, background: "none", border: "none",
        cursor: "pointer", padding: 0, font: "inherit", color: active ? "var(--text-primary)" : "inherit",
        fontWeight: active ? 700 : undefined,
      }}>
      {label}
      {active && (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  );
}

// ---- Advanced filter panel (Zoho-style) ----
type AdvancedFilters = {
  assignedTo: string[];       // staff user_ids; empty = all
  createdFrom: string; createdTo: string;
  followUpFrom: string; followUpTo: string;
};

const EMPTY_FILTERS: AdvancedFilters = { assignedTo: [], createdFrom: "", createdTo: "", followUpFrom: "", followUpTo: "" };

function FilterSheet({ staff, value, onClose, onApply }: {
  staff: StaffMember[]; value: AdvancedFilters;
  onClose: () => void; onApply: (f: AdvancedFilters) => void;
}) {
  const [draft, setDraft] = useState<AdvancedFilters>(value);

  function toggleAssignee(userId: string) {
    setDraft((d) => ({
      ...d,
      assignedTo: d.assignedTo.includes(userId) ? d.assignedTo.filter((id) => id !== userId) : [...d.assignedTo, userId],
    }));
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "420px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div className="ps-sheet-title">Filters</div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          <div className="ps-field">
            <span className="ps-label">Assigned to</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {staff.length === 0 && <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>No staff added yet</span>}
              {staff.map((s) => {
                const active = draft.assignedTo.includes(s.user_id);
                return (
                  <button key={s.user_id} type="button" onClick={() => toggleAssignee(s.user_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                      border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--separator)",
                      background: active ? "var(--accent-dim)" : "transparent",
                      color: active ? "var(--accent)" : "var(--text-secondary)",
                      fontWeight: active ? 600 : 400,
                    }}>
                    {active && <CheckIcon size={12} />}
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ps-field">
            <span className="ps-label">Created date</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="ps-input" type="date" value={draft.createdFrom}
                onChange={(e) => setDraft((d) => ({ ...d, createdFrom: e.target.value }))} style={{ height: 40 }} />
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>to</span>
              <input className="ps-input" type="date" value={draft.createdTo}
                onChange={(e) => setDraft((d) => ({ ...d, createdTo: e.target.value }))} style={{ height: 40 }} />
            </div>
          </div>

          <div className="ps-field">
            <span className="ps-label">Follow-up date</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="ps-input" type="date" value={draft.followUpFrom}
                onChange={(e) => setDraft((d) => ({ ...d, followUpFrom: e.target.value }))} style={{ height: 40 }} />
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>to</span>
              <input className="ps-input" type="date" value={draft.followUpTo}
                onChange={(e) => setDraft((d) => ({ ...d, followUpTo: e.target.value }))} style={{ height: 40 }} />
            </div>
          </div>
        </div>
        <div className="ps-sheet-footer" style={{ justifyContent: "space-between" }}>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setDraft(EMPTY_FILTERS)}>Clear all</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => onApply(draft)}>Apply filters</button>
        </div>
      </div>
    </div>
  );
}

// ---- Kanban column ----
function KanbanColumn({ status, leads, staff, onOpen, onEdit, onConvert }: {
  status: LeadStatus; leads: Lead[]; staff: StaffMember[];
  onOpen: (l: Lead) => void; onEdit: (l: Lead) => void; onConvert: (l: Lead) => void;
}) {
  const meta = STATUS_META[status];
  return (
    <div style={{ minWidth: 240, maxWidth: 280, flex: "0 0 260px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 4px" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: meta.dot, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{meta.label}</span>
        <span style={{ marginLeft: "auto", background: "var(--fill-2)", color: "var(--text-tertiary)", padding: "1px 8px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{leads.length}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: 60 }}>
        {leads.map((lead) => {
          const overdue = isOverdue(lead);
          const today = isDueToday(lead);
          const assignee = staff.find((s) => s.user_id === lead.assigned_to);
          return (
            <div key={lead.id}
              style={{ background: "var(--surface)", border: `1px solid ${overdue ? "var(--red)" : "var(--separator)"}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", transition: "box-shadow 120ms" }}
              onClick={() => onOpen(lead)}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3, flex: 1 }}>{lead.full_name}</div>
                {assignee && (
                  <span title={assignee.name} style={{ width: 18, height: 18, borderRadius: "50%", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {assignee.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <button type="button" className="ps-icon-btn" style={{ width: 22, height: 22, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); onEdit(lead); }} title="Edit lead">
                  <Edit2 size={11} />
                </button>
                {overdue && <AlertCircle size={14} style={{ color: "var(--red)", flexShrink: 0, marginTop: 2 }} />}
                {today && !overdue && <AlertCircle size={14} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />}
              </div>

              {lead.phone && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 4 }}>
                  <Phone size={11} />{lead.phone}
                </div>
              )}

              {lead.source && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 6 }}>
                  {SOURCE_EMOJI[lead.source]} {SOURCE_LABELS[lead.source]}
                </div>
              )}

              {lead.membership_plans?.name && (
                <div style={{ background: "var(--fill)", borderRadius: 8, padding: "3px 8px", fontSize: 12, color: "var(--text-secondary)", display: "inline-block", marginBottom: 6 }}>
                  {lead.membership_plans.name}
                </div>
              )}

              {lead.follow_up_at && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: overdue ? "var(--red)" : today ? "var(--amber)" : "var(--text-tertiary)", marginTop: 4, fontWeight: overdue ? 600 : 400 }}>
                  <Calendar size={11} />
                  {overdue ? "Overdue: " : today ? "Today: " : "Follow-up: "}
                  {new Date(lead.follow_up_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              )}

              {status !== "converted" && status !== "lost" && (
                <button
                  type="button"
                  className="ps-btn ps-btn--tinted ps-btn--sm"
                  style={{ marginTop: 10, width: "100%", justifyContent: "center" }}
                  onClick={(e) => { e.stopPropagation(); onConvert(lead); }}
                >
                  <ArrowRight size={13} /> Convert
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- CSV Import Sheet ----
const VALID_SOURCES = ["walk_in","instagram","facebook","referral","google","whatsapp","website","other"];
const VALID_STATUSES = ["new","contacted","interested","trial","lost"];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"));
  return lines.slice(1).filter((l) => l.trim()).map((line) => {
    // Handle quoted fields
    const values: string[] = [];
    let cur = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes; }
      else if (line[i] === "," && !inQuotes) { values.push(cur.trim()); cur = ""; }
      else { cur += line[i]; }
    }
    values.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").replace(/^"|"$/g, "").trim(); });
    return row;
  });
}

type ImportRow = { full_name: string; phone: string; email: string; source: string; status: string; notes: string; follow_up_at: string; valid: boolean; error: string };

function ImportSheet({ orgId, onClose, onImported }: {
  orgId: string; onClose: () => void; onImported: (count: number) => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [imported, setImported] = useState(0);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  function processFile(file: File) {
    if (!file.name.endsWith(".csv")) { setError("Please upload a .csv file"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) { setError("CSV is empty or has no data rows"); return; }

      const preview: ImportRow[] = parsed.map((row) => {
        const name = row.full_name || row.name || row["full name"] || "";
        const phone = row.phone || row.mobile || row.phone_number || "";
        const email = row.email || row.email_address || "";
        const source = (row.source || "other").toLowerCase().replace(/[^a-z_]/g, "_");
        const status = (row.status || "new").toLowerCase();
        const notes = row.notes || row.note || "";
        const follow_up = row.follow_up || row.follow_up_at || row.followup || "";

        let err = "";
        if (!name) err = "Name is required";
        else if (!phone && !email) err = "Phone or email required";

        return {
          full_name: name, phone, email,
          source: VALID_SOURCES.includes(source) ? source : "other",
          status: VALID_STATUSES.includes(status) ? status : "new",
          notes, follow_up_at: follow_up,
          valid: !err, error: err,
        };
      });

      setRows(preview);
      setError("");
      setStep("preview");
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setStep("importing");
    const valid = rows.filter((r) => r.valid);
    let count = 0;

    // Insert in batches of 20
    for (let i = 0; i < valid.length; i += 20) {
      const batch = valid.slice(i, i + 20).map((r) => ({
        org_id: orgId,
        full_name: r.full_name,
        phone: r.phone || null,
        email: r.email || null,
        source: r.source as LeadSource,
        status: r.status as LeadStatus,
        notes: r.notes || null,
        follow_up_at: r.follow_up_at ? new Date(r.follow_up_at).toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      const { error: err } = await supabase.from("leads").insert(batch);
      if (!err) count += batch.length;
    }

    setImported(count);
    setStep("done");
    onImported(count);
  }

  function downloadTemplate() {
    const csv = [
      "full_name,phone,email,source,status,notes,follow_up",
      "Rahul Sharma,9876543210,rahul@email.com,instagram,new,Interested in monthly plan,2026-11-01",
      "Priya Verma,9123456789,,walk_in,contacted,Visited for trial,,",
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "leads-import-template.csv";
    a.click();
  }

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "560px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div>
              <div className="ps-sheet-title">Import leads from CSV</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 2 }}>
                {step === "upload" && "Upload a CSV file to bulk-add leads"}
                {step === "preview" && `${rows.length} rows found — ${validCount} valid, ${invalidCount} with issues`}
                {step === "importing" && "Importing…"}
                {step === "done" && `${imported} leads imported successfully`}
              </div>
            </div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        <div className="ps-sheet-body" style={{ padding: "16px 20px" }}>
          {step === "upload" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
                onClick={() => document.getElementById("csv-file-input")?.click()}
                style={{
                  border: `2px dashed ${dragOver ? "var(--accent)" : "var(--separator)"}`,
                  borderRadius: 16, padding: "40px 20px", textAlign: "center",
                  cursor: "pointer", background: dragOver ? "var(--accent-dim)" : "var(--fill)",
                  transition: "all 120ms",
                }}
              >
                <Upload size={28} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                  Drop your CSV here or click to browse
                </div>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                  Supports .csv files. Max 1,000 rows per import.
                </div>
                <input id="csv-file-input" type="file" accept=".csv" style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              </div>

              {error && <div className="ps-error">{error}</div>}

              {/* Template download */}
              <div style={{ background: "var(--fill)", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>Not sure about the format?</div>
                  <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 2 }}>Download our template CSV with the right columns.</div>
                </div>
                <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={downloadTemplate}>
                  <Download size={13} /> Template
                </button>
              </div>

              {/* Column guide */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>Required columns</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["full_name", "phone or email"].map((c) => (
                    <span key={c} style={{ background: "var(--accent-dim)", color: "var(--accent)", padding: "3px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600 }}>{c}</span>
                  ))}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8, marginTop: 12 }}>Optional columns</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {["email", "source", "status", "notes", "follow_up"].map((c) => (
                    <span key={c} style={{ background: "var(--fill-2)", color: "var(--text-tertiary)", padding: "3px 10px", borderRadius: 8, fontSize: 12.5 }}>{c}</span>
                  ))}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 10, lineHeight: 1.6 }}>
                  <strong>source values:</strong> walk_in, instagram, facebook, referral, google, whatsapp, website, other<br />
                  <strong>status values:</strong> new, contacted, interested, trial, lost
                </div>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ background: "var(--green-dim)", borderRadius: 12, padding: "12px 16px" }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: "var(--green)" }}>{validCount}</div>
                  <div style={{ fontSize: 13, color: "var(--green)" }}>Ready to import</div>
                </div>
                {invalidCount > 0 && (
                  <div style={{ background: "var(--amber-dim)", borderRadius: 12, padding: "12px 16px" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "var(--amber)" }}>{invalidCount}</div>
                    <div style={{ fontSize: 13, color: "var(--amber)" }}>Will be skipped</div>
                  </div>
                )}
              </div>

              {/* Preview table */}
              <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--separator)", borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "var(--fill)", position: "sticky", top: 0 }}>
                      {["Name", "Phone", "Source", "Status", ""].map((h) => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11.5, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--separator)", background: row.valid ? "transparent" : "rgba(255,59,48,0.04)" }}>
                        <td style={{ padding: "8px 12px", color: row.valid ? "var(--text-primary)" : "var(--red)", fontWeight: 500 }}>{row.full_name || <em style={{ color: "var(--text-tertiary)" }}>missing</em>}</td>
                        <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{row.phone || row.email || <em style={{ color: "var(--text-tertiary)" }}>—</em>}</td>
                        <td style={{ padding: "8px 12px", color: "var(--text-secondary)" }}>{SOURCE_LABELS[row.source as LeadSource] ?? row.source}</td>
                        <td style={{ padding: "8px 12px" }}>
                          <span style={{ background: STATUS_META[row.status as LeadStatus]?.bg ?? "var(--fill)", color: STATUS_META[row.status as LeadStatus]?.color ?? "var(--text-tertiary)", padding: "2px 8px", borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                            {STATUS_META[row.status as LeadStatus]?.label ?? row.status}
                          </span>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {!row.valid && <span style={{ fontSize: 12, color: "var(--red)" }}>{row.error}</span>}
                          {row.valid && <span style={{ color: "var(--green)", fontSize: 14 }}>✓</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm"
                style={{ alignSelf: "flex-start" }}
                onClick={() => { setRows([]); setStep("upload"); }}>
                ← Upload different file
              </button>
            </div>
          )}

          {step === "importing" && (
            <div style={{ padding: "48px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
              <Loader2 size={32} className="ps-spin" style={{ color: "var(--accent)" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Importing {validCount} leads…</div>
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>This will only take a moment</div>
            </div>
          )}

          {step === "done" && (
            <div style={{ padding: "40px 0", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 56, height: 56, background: "var(--green-dim)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <CheckCircle2 size={28} style={{ color: "var(--green)" }} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{imported} leads imported</div>
              {invalidCount > 0 && (
                <div style={{ fontSize: 13, color: "var(--amber)" }}>{invalidCount} row{invalidCount !== 1 ? "s" : ""} skipped due to missing required fields</div>
              )}
              <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>All leads have been added to your pipeline as "New"</div>
            </div>
          )}
        </div>

        <div className="ps-sheet-footer">
          {step === "upload" && <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>}
          {step === "preview" && (
            <>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
              <button type="button" className="ps-btn ps-btn--primary" onClick={handleImport} disabled={validCount === 0}>
                Import {validCount} lead{validCount !== 1 ? "s" : ""}
              </button>
            </>
          )}
          {step === "done" && (
            <button type="button" className="ps-btn ps-btn--primary" onClick={onClose} style={{ marginLeft: "auto" }}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main page ----
type SavedView = "all" | "mine" | "unassigned" | "due_today" | "overdue" | "new_week";
const PAGE_SIZE = 25;
const PIPELINE_STAGES: LeadStatus[] = ["new", "contacted", "interested", "trial", "converted", "lost"];

function relTime(iso: string | null): string {
  if (!iso) return "—";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function LeadsPage() {
  const router = useRouter();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSource | "all">("all");
  const [savedView, setSavedView] = useState<SavedView>("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [advFilters, setAdvFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);
  const [nextTaskMap, setNextTaskMap] = useState<Record<string, string>>({});
  const [lastActMap, setLastActMap] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(0);
  const { toast, show } = useToast();

  const loadLeads = useCallback(async (oid: string) => {
    const [{ data }, { data: taskRows }, { data: actRows }] = await Promise.all([
      supabase.from("leads").select("*, membership_plans(name)").eq("org_id", oid).order("created_at", { ascending: false }),
      supabase.from("lead_tasks").select("lead_id, due_at").eq("org_id", oid).eq("status", "pending"),
      supabase.from("lead_activities").select("lead_id, created_at").eq("org_id", oid).neq("type", "status_change")
        .order("created_at", { ascending: false }).limit(5000),
    ]);
    setLeads((data as Lead[]) || []);

    const tMap: Record<string, string> = {};
    for (const t of (taskRows as { lead_id: string; due_at: string }[]) || []) {
      if (!tMap[t.lead_id] || t.due_at < tMap[t.lead_id]) tMap[t.lead_id] = t.due_at;
    }
    setNextTaskMap(tMap);

    const aMap: Record<string, string> = {};
    for (const a of (actRows as { lead_id: string; created_at: string }[]) || []) {
      if (!aMap[a.lead_id]) aMap[a.lead_id] = a.created_at; // rows already newest-first
    }
    setLastActMap(aMap);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData) return;
      setOrgId(roleData.org_id);
      const { data: planData } = await supabase.from("membership_plans").select("id, name").eq("org_id", roleData.org_id).eq("is_active", true);
      setPlans((planData as Plan[]) || []);
      const { data: staffData } = await supabase.from("staff").select("id, user_id, name").eq("org_id", roleData.org_id).eq("is_active", true).order("name");
      const staffList = (staffData as StaffMember[]) || [];
      if (!staffList.some((s) => s.user_id === user.id)) {
        const label = user.email ? `You (${user.email.split("@")[0]})` : "You";
        staffList.unshift({ id: "self", user_id: user.id, name: label });
      }
      setStaff(staffList);
      await loadLeads(roleData.org_id);
    }
    init();
  }, [loadLeads]);

  // Reset to page 1 and clear selection whenever the result set changes shape
  useEffect(() => { setPage(0); setSelected(new Set()); },
    [search, statusFilter, sourceFilter, savedView, advFilters, sortField, sortDir]);

  // ── Derived helpers ──
  const isOpen = (l: Lead) => l.status !== "converted" && l.status !== "lost";

  // Next action = earliest of a pending task or the lead's own follow-up date
  function nextAction(l: Lead): string | null {
    if (!isOpen(l)) return null;
    const a = nextTaskMap[l.id] ?? null;
    const b = l.follow_up_at;
    if (a && b) return a < b ? a : b;
    return a ?? b;
  }
  const todayStr = new Date().toDateString();
  const isDueTodayX = (l: Lead) => { const n = nextAction(l); return !!n && new Date(n).toDateString() === todayStr && new Date(n) >= new Date(); };
  const isOverdueX = (l: Lead) => { const n = nextAction(l); return !!n && new Date(n) < new Date(); };
  const weekAgo = Date.now() - 7 * 86400000;
  const isNewThisWeek = (l: Lead) => new Date(l.created_at).getTime() >= weekAgo;

  const staffById = (userId: string | null) => staff.find((s) => s.user_id === userId);

  // ── KPIs (always computed on the full set, not the filtered one) ──
  const totalLeads = leads.length;
  const openLeads = leads.filter(isOpen).length;
  const convertedLeads = leads.filter((l) => l.status === "converted").length;
  const closedLeads = convertedLeads + leads.filter((l) => l.status === "lost").length;
  const conversionRate = closedLeads > 0 ? Math.round((convertedLeads / closedLeads) * 100) : 0;
  const dueTodayCount = leads.filter(isDueTodayX).length;
  const overdueCount = leads.filter(isOverdueX).length;
  const newWeekCount = leads.filter(isNewThisWeek).length;

  const viewCounts: Record<SavedView, number> = {
    all: totalLeads,
    mine: leads.filter((l) => l.assigned_to === myUserId).length,
    unassigned: leads.filter((l) => !l.assigned_to && isOpen(l)).length,
    due_today: dueTodayCount,
    overdue: overdueCount,
    new_week: newWeekCount,
  };

  // ── Filtering ──
  const q = search.trim().toLowerCase();
  const matchesView = (l: Lead) => {
    switch (savedView) {
      case "mine": return l.assigned_to === myUserId;
      case "unassigned": return !l.assigned_to && isOpen(l);
      case "due_today": return isDueTodayX(l);
      case "overdue": return isOverdueX(l);
      case "new_week": return isNewThisWeek(l);
      default: return true;
    }
  };

  // Everything except the stage filter — used for the stage strip counts so they stay meaningful
  const baseFiltered = leads.filter((l) => {
    if (!matchesView(l)) return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    if (advFilters.assignedTo.length > 0 && !advFilters.assignedTo.includes(l.assigned_to ?? "")) return false;
    if (advFilters.createdFrom && l.created_at.slice(0, 10) < advFilters.createdFrom) return false;
    if (advFilters.createdTo && l.created_at.slice(0, 10) > advFilters.createdTo) return false;
    if (advFilters.followUpFrom && (!l.follow_up_at || l.follow_up_at.slice(0, 10) < advFilters.followUpFrom)) return false;
    if (advFilters.followUpTo && (!l.follow_up_at || l.follow_up_at.slice(0, 10) > advFilters.followUpTo)) return false;
    if (q) return (
      l.full_name.toLowerCase().includes(q) ||
      (l.phone || "").includes(q) ||
      (l.email || "").toLowerCase().includes(q)
    );
    return true;
  });

  const stageCount = (s: LeadStatus) => baseFiltered.filter((l) => l.status === s).length;
  const filteredUnsorted = statusFilter === "all" ? baseFiltered : baseFiltered.filter((l) => l.status === statusFilter);

  function sortValue(l: Lead, field: SortField): string {
    switch (field) {
      case "plan": return l.membership_plans?.name ?? "";
      case "owner": return staffById(l.assigned_to)?.name ?? "~"; // unassigned sorts last
      case "next_action": return nextAction(l) ?? "9999";
      case "last_activity": return lastActMap[l.id] ?? "";
      case "status": return String(PIPELINE_STAGES.indexOf(l.status));
      default: return ((l as unknown as Record<string, string | null>)[field]) ?? "";
    }
  }

  const filtered = [...filteredUnsorted].sort((a, b) => {
    const cmp = sortValue(a, sortField).localeCompare(sortValue(b, sortField), undefined, { numeric: true, sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const byStatus = (s: LeadStatus) => filtered.filter((l) => l.status === s);

  const activeFilterCount =
    advFilters.assignedTo.length +
    (advFilters.createdFrom || advFilters.createdTo ? 1 : 0) +
    (advFilters.followUpFrom || advFilters.followUpTo ? 1 : 0) +
    (sourceFilter !== "all" ? 1 : 0);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function clearAllFilters() {
    setSearch(""); setStatusFilter("all"); setSourceFilter("all"); setSavedView("all"); setAdvFilters(EMPTY_FILTERS);
  }

  // ── Selection + bulk actions ──
  const pageIds = pageRows.map((l) => l.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  function toggleOne(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function togglePage() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => n.delete(id)); else pageIds.forEach((id) => n.add(id));
      return n;
    });
  }

  async function bulkAssign(userId: string) {
    if (!orgId || selected.size === 0) return;
    setBulkBusy(true);
    const ids = [...selected];
    const { error } = await supabase.from("leads").update({ assigned_to: userId || null, updated_at: new Date().toISOString() }).in("id", ids);
    setBulkBusy(false);
    if (error) { show("Couldn't reassign: " + error.message, "error"); return; }
    setLeads((prev) => prev.map((l) => selected.has(l.id) ? { ...l, assigned_to: userId || null } : l));
    show(`${ids.length} lead${ids.length > 1 ? "s" : ""} ${userId ? "assigned" : "unassigned"}`);
    setSelected(new Set());
  }

  async function bulkStatus(newStatus: LeadStatus) {
    if (!orgId || selected.size === 0) return;
    setBulkBusy(true);
    const targets = leads.filter((l) => selected.has(l.id) && l.status !== newStatus);
    if (targets.length === 0) { setBulkBusy(false); setSelected(new Set()); return; }
    const { error } = await supabase.from("leads").update({ status: newStatus, updated_at: new Date().toISOString() }).in("id", targets.map((l) => l.id));
    if (error) { setBulkBusy(false); show("Couldn't update stage: " + error.message, "error"); return; }
    await supabase.from("lead_activities").insert(targets.map((l) => ({
      org_id: orgId, lead_id: l.id, type: "status_change",
      content: `${STATUS_META[l.status].label} → ${STATUS_META[newStatus].label}`, created_by: myUserId,
    })));
    setLeads((prev) => prev.map((l) => selected.has(l.id) ? { ...l, status: newStatus } : l));
    setBulkBusy(false);
    show(`${targets.length} lead${targets.length > 1 ? "s" : ""} moved to ${STATUS_META[newStatus].label}`);
    setSelected(new Set());
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} lead${selected.size > 1 ? "s" : ""}? Their tasks and activity history will be removed too.`)) return;
    setBulkBusy(true);
    const ids = [...selected];
    const { error } = await supabase.from("leads").delete().in("id", ids);
    setBulkBusy(false);
    if (error) { show("Couldn't delete: " + error.message, "error"); return; }
    setLeads((prev) => prev.filter((l) => !selected.has(l.id)));
    show(`${ids.length} lead${ids.length > 1 ? "s" : ""} deleted`);
    setSelected(new Set());
  }

  function exportCsv() {
    const rows = selected.size > 0 ? filtered.filter((l) => selected.has(l.id)) : filtered;
    const esc = (v: string | null | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Name", "Phone", "Email", "Stage", "Owner", "Source", "Interested plan", "Next action", "Last activity", "Created", "Notes"];
    const lines = rows.map((l) => [
      l.full_name, l.phone, l.email, STATUS_META[l.status].label, staffById(l.assigned_to)?.name ?? "",
      l.source ? SOURCE_LABELS[l.source] : "", l.membership_plans?.name ?? "",
      nextAction(l) ? new Date(nextAction(l)!).toLocaleString("en-IN") : "",
      lastActMap[l.id] ? new Date(lastActMap[l.id]).toLocaleString("en-IN") : "",
      new Date(l.created_at).toLocaleDateString("en-IN"), l.notes,
    ].map(esc).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    show(`Exported ${rows.length} lead${rows.length === 1 ? "" : "s"}`);
  }

  const ROW = cols(
    "36px minmax(0,2.2fr) 128px 150px 120px 150px 110px 64px",
    "36px minmax(0,1fr) auto"
  );

  const VIEWS: { key: SavedView; label: string }[] = [
    { key: "all", label: "All leads" },
    { key: "mine", label: "My leads" },
    { key: "unassigned", label: "Unassigned" },
    { key: "due_today", label: "Due today" },
    { key: "overdue", label: "Overdue" },
    { key: "new_week", label: "New this week" },
  ];

  const hasAnyFilter = q !== "" || statusFilter !== "all" || savedView !== "all" || activeFilterCount > 0;

  return (
    <div className="ps-page" style={{ paddingBottom: 48 }}>
      {/* ═══ Header ═══ */}
      <header className="ps-header">
        <div className="ps-header-text">
          <h1 className="ps-title">Leads</h1>
          <p className="ps-subtitle">
            {loading ? "\u00a0" : `${totalLeads} lead${totalLeads === 1 ? "" : "s"} · ${openLeads} open in pipeline`}
          </p>
        </div>
        <div className="ps-header-actions">
          {orgId && (
            <>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download size={15} /> Export
              </button>
              <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setImportOpen(true)}>
                <Upload size={15} /> Import
              </button>
              <button type="button" className="ps-btn ps-btn--primary" onClick={() => { setEditLead(null); setSheetOpen(true); }}>
                <Plus size={16} /> New lead
              </button>
            </>
          )}
        </div>
      </header>

      {/* ═══ KPI strip ═══ */}
      <div className="ps-card lp-kpis" style={{ marginBottom: 16 }}>
        {[
          { label: "Total leads", value: String(totalLeads), sub: `${newWeekCount} new this week`, color: "var(--text-primary)" },
          { label: "Open pipeline", value: String(openLeads), sub: "Not converted or lost", color: "var(--text-primary)" },
          { label: "Due today", value: String(dueTodayCount), sub: "Follow-ups and tasks", color: dueTodayCount > 0 ? "var(--amber)" : "var(--text-primary)", view: "due_today" as SavedView },
          { label: "Overdue", value: String(overdueCount), sub: "Needs attention", color: overdueCount > 0 ? "var(--red)" : "var(--text-primary)", view: "overdue" as SavedView },
          { label: "Converted", value: String(convertedLeads), sub: "Became members", color: convertedLeads > 0 ? "var(--green)" : "var(--text-primary)" },
          { label: "Win rate", value: `${conversionRate}%`, sub: "Of closed leads", color: "var(--text-primary)" },
        ].map((k) => (
          <button key={k.label} type="button" className="lp-kpi" disabled={!k.view}
            onClick={() => k.view && setSavedView(k.view)}
            style={{ cursor: k.view ? "pointer" : "default" }}>
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: k.color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", marginTop: 4 }}>
              {loading ? "–" : k.value}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 2 }}>{k.sub}</div>
          </button>
        ))}
      </div>

      {/* ═══ Saved views ═══ */}
      <div className="lp-views" role="tablist">
        {VIEWS.map((v) => {
          const active = savedView === v.key;
          const alert = v.key === "overdue" && viewCounts.overdue > 0;
          return (
            <button key={v.key} type="button" role="tab" aria-selected={active} onClick={() => setSavedView(v.key)}
              className="lp-view" data-active={active}>
              {v.label}
              <span className="lp-view-count" style={alert ? { background: "var(--red-dim)", color: "var(--red)" } : undefined}>
                {viewCounts[v.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* ═══ Stage strip (doubles as stage filter) ═══ */}
      <div className="lp-stages">
        {PIPELINE_STAGES.map((s) => {
          const m = STATUS_META[s];
          const n = stageCount(s);
          const active = statusFilter === s;
          const pct = baseFiltered.length > 0 ? (n / baseFiltered.length) * 100 : 0;
          return (
            <button key={s} type="button" onClick={() => setStatusFilter(active ? "all" : s)}
              className="lp-stage" data-active={active}
              style={active ? { borderColor: m.dot, background: m.bg } : undefined}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: m.dot }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: active ? m.color : "var(--text-secondary)" }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{n}</div>
              <div style={{ height: 3, borderRadius: 2, background: "var(--fill-2)", marginTop: 6, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: m.dot }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ═══ Toolbar / bulk bar ═══ */}
      {selected.size > 0 ? (
        <div className="lp-toolbar lp-bulk">
          <span style={{ fontSize: 13.5, fontWeight: 650 }}>{selected.size} selected</span>
          <select className="ps-input" defaultValue="" disabled={bulkBusy}
            onChange={(e) => { if (e.target.value !== "") bulkAssign(e.target.value === "__none" ? "" : e.target.value); e.target.value = ""; }}
            style={{ height: 34, fontSize: 13, width: "auto", minWidth: 150 }}>
            <option value="" disabled>Assign owner…</option>
            <option value="__none">Unassign</option>
            {staff.map((s) => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
          </select>
          <select className="ps-input" defaultValue="" disabled={bulkBusy}
            onChange={(e) => { if (e.target.value) bulkStatus(e.target.value as LeadStatus); e.target.value = ""; }}
            style={{ height: 34, fontSize: 13, width: "auto", minWidth: 140 }}>
            <option value="" disabled>Move to stage…</option>
            {PIPELINE_STAGES.filter((s) => s !== "converted").map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={exportCsv} disabled={bulkBusy}>
            <Download size={13} /> Export
          </button>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={bulkDelete} disabled={bulkBusy} style={{ color: "var(--red)" }}>
            <Trash2 size={13} /> Delete
          </button>
          {bulkBusy && <Loader2 size={15} className="ps-spin" />}
          <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ marginLeft: "auto" }} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
        </div>
      ) : (
        <div className="lp-toolbar">
          <div className="ps-input-wrap" style={{ flex: 1, minWidth: 220 }}>
            <span className="ps-input-icon"><Search size={16} /></span>
            <input className="ps-input ps-input--icon" type="search" value={search}
              onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone or email" style={{ height: 38 }} />
          </div>
          <select className="ps-input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as LeadSource | "all")}
            style={{ height: 38, fontSize: 13, width: "auto", minWidth: 150 }}>
            <option value="all">All sources</option>
            {(Object.entries(SOURCE_LABELS) as [LeadSource, string][]).map(([k, v]) => (
              <option key={k} value={k}>{SOURCE_EMOJI[k]} {v}</option>
            ))}
          </select>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" style={{ height: 38 }} onClick={() => setFilterSheetOpen(true)}>
            <ListFilter size={14} /> More filters
            {advFilters.assignedTo.length + (advFilters.createdFrom || advFilters.createdTo ? 1 : 0) + (advFilters.followUpFrom || advFilters.followUpTo ? 1 : 0) > 0 && (
              <span className="lp-view-count" style={{ background: "var(--accent)", color: "#fff" }}>
                {advFilters.assignedTo.length + (advFilters.createdFrom || advFilters.createdTo ? 1 : 0) + (advFilters.followUpFrom || advFilters.followUpTo ? 1 : 0)}
              </span>
            )}
          </button>
          {hasAnyFilter && (
            <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 38 }} onClick={clearAllFilters}>
              <X size={13} /> Clear
            </button>
          )}
          <div className="lp-viewtoggle">
            <button type="button" data-active={view === "list"} onClick={() => setView("list")} title="List view">
              <LayoutList size={16} />
            </button>
            <button type="button" data-active={view === "pipeline"} onClick={() => setView("pipeline")} title="Board view">
              <Columns3 size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Results ═══ */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={58} r={12} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="ps-list">
          <div className="ps-empty">
            <div className="ps-empty-icon"><User size={22} /></div>
            <div className="ps-empty-title">{leads.length === 0 ? "No leads yet" : "No leads match"}</div>
            <div className="ps-empty-text">
              {leads.length === 0 ? "Add your first lead or import a CSV to start building your pipeline." : "Try a different view, stage or search."}
            </div>
            {leads.length === 0 && orgId ? (
              <button type="button" className="ps-btn ps-btn--primary" onClick={() => { setEditLead(null); setSheetOpen(true); }}>
                <Plus size={16} /> New lead
              </button>
            ) : (
              <button type="button" className="ps-btn ps-btn--secondary" onClick={clearAllFilters}>Clear all filters</button>
            )}
          </div>
        </div>
      ) : view === "list" ? (
        <div className="ps-list">
          <div className="ps-list-head" style={ROW}>
            <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}>
              <input type="checkbox" checked={allPageSelected} onChange={togglePage} aria-label="Select all on this page"
                style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
            </span>
            <SortableHeader field="full_name" label="Lead" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <SortableHeader field="status" label="Stage" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
            <span className="ps-hide-sm"><SortableHeader field="owner" label="Owner" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></span>
            <span className="ps-hide-sm"><SortableHeader field="source" label="Source" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></span>
            <span className="ps-hide-sm"><SortableHeader field="next_action" label="Next action" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></span>
            <span className="ps-hide-sm"><SortableHeader field="last_activity" label="Last touch" sortField={sortField} sortDir={sortDir} onSort={handleSort} /></span>
            <span />
          </div>

          {pageRows.map((lead) => {
            const next = nextAction(lead);
            const overdue = isOverdueX(lead);
            const dueToday = isDueTodayX(lead);
            const owner = staffById(lead.assigned_to);
            const isSel = selected.has(lead.id);
            const m = STATUS_META[lead.status];
            return (
              <div key={lead.id} className="ps-row lp-row" data-selected={isSel}
                style={{ cursor: "pointer", ...ROW }}
                onClick={() => router.push(`/dashboard/leads/${lead.id}`)}>
                <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleOne(lead.id)} aria-label={`Select ${lead.full_name}`}
                    style={{ width: 16, height: 16, accentColor: "var(--accent)", cursor: "pointer" }} />
                </span>

                <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={lead.full_name} size={34} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.full_name}</div>
                    <div className="ps-cell-sub" style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                      {lead.phone && <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}><Phone size={10} />{lead.phone}</span>}
                      {lead.membership_plans?.name && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· {lead.membership_plans.name}</span>}
                    </div>
                  </div>
                </div>

                <div><StatusBadge status={lead.status} /></div>

                <div className="ps-hide-sm" style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {owner ? (
                    <>
                      <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-dim)", color: "var(--accent)", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {owner.name.replace(/^You \(/, "").slice(0, 2).toUpperCase()}
                      </span>
                      <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{owner.name}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Unassigned</span>
                  )}
                </div>

                <div className="ps-hide-sm" style={{ fontSize: 13, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {lead.source ? `${SOURCE_EMOJI[lead.source]} ${SOURCE_LABELS[lead.source]}` : "—"}
                </div>

                <div className="ps-hide-sm" style={{ fontSize: 13 }}>
                  {next ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: overdue ? "var(--red)" : dueToday ? "var(--amber)" : "var(--text-secondary)", fontWeight: overdue || dueToday ? 600 : 400 }}>
                      {overdue ? <AlertCircle size={13} /> : <Clock size={12} />}
                      {overdue ? "Overdue · " : dueToday ? "Today · " : ""}
                      {new Date(next).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  ) : (
                    <span style={{ color: isOpen(lead) ? "var(--amber)" : "var(--text-tertiary)", fontSize: 12.5 }}>
                      {isOpen(lead) ? "Not scheduled" : "—"}
                    </span>
                  )}
                </div>

                <div className="ps-hide-sm" style={{ fontSize: 13, color: lastActMap[lead.id] ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                  {lastActMap[lead.id] ? relTime(lastActMap[lead.id]) : "Never"}
                </div>

                <div className="lp-actions" style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                  <button type="button" className="ps-icon-btn" style={{ width: 28, height: 28 }}
                    onClick={(e) => { e.stopPropagation(); setEditLead(lead); setSheetOpen(true); }} title="Quick edit">
                    <Edit2 size={13} />
                  </button>
                  {isOpen(lead) ? (
                    <button type="button" className="ps-icon-btn" style={{ width: 28, height: 28, color: "var(--green)" }}
                      onClick={(e) => { e.stopPropagation(); setConvertLead(lead); }} title="Convert to member">
                      <CheckCircle2 size={13} />
                    </button>
                  ) : lead.converted_member_id ? (
                    <button type="button" className="ps-icon-btn" style={{ width: 28, height: 28, color: "var(--accent)" }}
                      onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/members/${lead.converted_member_id}`); }} title="View member">
                      <ChevronRight size={13} />
                    </button>
                  ) : <span style={{ width: 28 }} aria-hidden title={m.label} />}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 16px", borderTop: "1px solid var(--separator)", fontSize: 13, color: "var(--text-tertiary)" }}>
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              {filtered.length !== totalLeads && ` (filtered from ${totalLeads})`}
            </span>
            {pageCount > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button type="button" className="ps-icon-btn" style={{ width: 30, height: 30 }} disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                  <ChevronLeft size={15} />
                </button>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>Page {page + 1} of {pageCount}</span>
                <button type="button" className="ps-icon-btn" style={{ width: 30, height: 30 }} disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", paddingBottom: 24 }}>
          <div style={{ display: "flex", gap: 14, minWidth: "max-content", alignItems: "flex-start" }}>
            {(statusFilter === "all" ? PIPELINE_STAGES : [statusFilter]).map((s) => (
              <KanbanColumn
                key={s}
                status={s}
                leads={byStatus(s)}
                staff={staff}
                onOpen={(l) => router.push(`/dashboard/leads/${l.id}`)}
                onEdit={(l) => { setEditLead(l); setSheetOpen(true); }}
                onConvert={(l) => setConvertLead(l)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ Source performance ═══ */}
      {!loading && leads.length > 0 && (
        <div className="ps-card" style={{ marginTop: 20, padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Source performance</h2>
            <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Click a source to filter</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 70px 90px minmax(0,1.6fr)", gap: "0 16px", fontSize: 12, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px", paddingBottom: 8, borderBottom: "1px solid var(--separator)" }}>
            <span>Source</span><span style={{ textAlign: "right" }}>Leads</span><span style={{ textAlign: "right" }}>Converted</span><span>Conversion</span>
          </div>
          {(Object.keys(SOURCE_LABELS) as LeadSource[])
            .map((src) => {
              const count = leads.filter((l) => l.source === src).length;
              const conv = leads.filter((l) => l.source === src && l.status === "converted").length;
              return { src, count, conv, rate: count > 0 ? Math.round((conv / count) * 100) : 0 };
            })
            .filter((r) => r.count > 0)
            .sort((a, b) => b.count - a.count)
            .map((r) => (
              <button key={r.src} type="button" onClick={() => setSourceFilter(sourceFilter === r.src ? "all" : r.src)}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(0,1.4fr) 70px 90px minmax(0,1.6fr)", gap: "0 16px", alignItems: "center",
                  width: "100%", padding: "10px 0", border: "none", borderBottom: "1px solid var(--separator)", textAlign: "left", cursor: "pointer",
                  background: sourceFilter === r.src ? "var(--accent-dim)" : "transparent", font: "inherit", color: "inherit",
                }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{SOURCE_EMOJI[r.src]} {SOURCE_LABELS[r.src]}</span>
                <span style={{ fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.count}</span>
                <span style={{ fontSize: 13.5, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.conv}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--fill-2)", overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${r.rate}%`, height: "100%", background: "var(--green)" }} />
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, width: 36, textAlign: "right", color: r.rate > 0 ? "var(--green)" : "var(--text-tertiary)" }}>{r.rate}%</span>
                </span>
              </button>
            ))}
        </div>
      )}

      {/* ═══ Sheets ═══ */}
      {importOpen && orgId && (
        <ImportSheet
          orgId={orgId}
          onClose={() => setImportOpen(false)}
          onImported={(count) => {
            setImportOpen(false);
            if (orgId) loadLeads(orgId);
            show(`${count} lead${count !== 1 ? "s" : ""} imported successfully`);
          }}
        />
      )}

      {sheetOpen && orgId && (
        <LeadSheet
          lead={editLead}
          orgId={orgId}
          plans={plans}
          staff={staff}
          onClose={() => { setSheetOpen(false); setEditLead(null); }}
          onSaved={(updated) => {
            setLeads((prev) => {
              const idx = prev.findIndex((l) => l.id === updated.id);
              if (idx >= 0) { const n = [...prev]; n[idx] = updated; return n; }
              return [updated, ...prev];
            });
            setSheetOpen(false); setEditLead(null);
            show(editLead ? "Lead updated" : "Lead added");
          }}
        />
      )}

      {convertLead && orgId && (
        <ConvertSheet
          lead={convertLead}
          orgId={orgId}
          plans={plans}
          onClose={() => setConvertLead(null)}
          onConverted={(memberId) => {
            setLeads((prev) => prev.map((l) => l.id === convertLead.id ? { ...l, status: "converted", converted_member_id: memberId } : l));
            setConvertLead(null);
            show(`${convertLead.full_name} converted to member`);
          }}
        />
      )}

      {filterSheetOpen && (
        <FilterSheet
          staff={staff}
          value={advFilters}
          onClose={() => setFilterSheetOpen(false)}
          onApply={(f) => { setAdvFilters(f); setFilterSheetOpen(false); }}
        />
      )}

      {toast}

      <style>{`
        .lp-kpis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); overflow: hidden; }
        .lp-kpi { background: none; border: none; text-align: left; padding: 14px 18px; font: inherit; color: inherit; border-left: 1px solid var(--separator); }
        .lp-kpi:first-child { border-left: none; }
        .lp-kpi:not(:disabled):hover { background: var(--fill); }
        .lp-views { display: flex; gap: 2px; border-bottom: 1px solid var(--separator); margin-bottom: 14px; overflow-x: auto; }
        .lp-view { display: flex; align-items: center; gap: 7px; padding: 9px 14px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; font: inherit; font-size: 13.5px; font-weight: 500; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
        .lp-view:hover { color: var(--text-primary); }
        .lp-view[data-active="true"] { color: var(--accent); border-bottom-color: var(--accent); font-weight: 650; }
        .lp-view-count { font-size: 11px; font-weight: 650; padding: 1px 7px; border-radius: 10px; background: var(--fill-2); color: var(--text-tertiary); font-variant-numeric: tabular-nums; }
        .lp-view[data-active="true"] .lp-view-count { background: var(--accent-dim); color: var(--accent); }
        .lp-stages { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
        .lp-stage { text-align: left; padding: 10px 12px; border-radius: 12px; border: 1.5px solid var(--separator); background: var(--surface); cursor: pointer; font: inherit; color: inherit; transition: border-color 120ms, background 120ms; }
        .lp-stage:hover { border-color: var(--text-tertiary); }
        .lp-toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; min-height: 38px; }
        .lp-bulk { background: var(--accent-dim); border-radius: 12px; padding: 8px 12px; }
        .lp-viewtoggle { display: flex; border: 1px solid var(--separator); border-radius: 10px; overflow: hidden; margin-left: auto; }
        .lp-viewtoggle button { padding: 0 12px; height: 36px; background: transparent; border: none; cursor: pointer; display: flex; align-items: center; color: var(--text-tertiary); }
        .lp-viewtoggle button[data-active="true"] { background: var(--fill-2); color: var(--text-primary); }
        .lp-row[data-selected="true"] { background: var(--accent-dim); }
        .lp-row .lp-actions { opacity: 0.35; transition: opacity 120ms; }
        .lp-row:hover .lp-actions { opacity: 1; }
        @media (max-width: 1100px) {
          .lp-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .lp-kpi:nth-child(4) { border-left: none; }
          .lp-kpi:nth-child(n+4) { border-top: 1px solid var(--separator); }
          .lp-stages { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 640px) {
          .lp-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .lp-stages { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .lp-row .lp-actions { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

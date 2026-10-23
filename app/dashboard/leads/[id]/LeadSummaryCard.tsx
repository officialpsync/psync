"use client";
// app/dashboard/leads/[id]/LeadSummaryCard.tsx
// Drop-in replacement for the "At a glance" + "Details" + "Notes" aside cards.
// Self-contained: loads/saves its own field-visibility prefs (ps_layout_prefs,
// scope='lead_detail_card'), so it doesn't need any changes to the parent
// page's load() function — just import and render it in place of the old block.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import { Edit2, Phone, Mail, Clock, Settings2, X, Check } from "lucide-react";

const supabase = createClient();

type LeadStatus = "new" | "contacted" | "interested" | "trial" | "converted" | "lost";
type LeadSource = "walk_in" | "instagram" | "facebook" | "referral" | "google" | "whatsapp" | "website" | "other";
type Lead = {
  id: string; org_id: string; assigned_to: string | null;
  full_name: string; phone: string | null; email: string | null;
  source: LeadSource | null; status: LeadStatus; notes: string | null;
  created_at: string; updated_at: string;
  membership_plans?: { name: string } | null;
};
type StaffMember = { id: string; user_id: string; name: string };

const STATUS_META: Record<LeadStatus, { label: string }> = {
  new: { label: "New" }, contacted: { label: "Contacted" }, interested: { label: "Interested" },
  trial: { label: "Trial" }, converted: { label: "Converted" }, lost: { label: "Lost" },
};
const SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: "Walk-in", instagram: "Instagram", facebook: "Facebook", referral: "Referral",
  google: "Google", whatsapp: "WhatsApp", website: "Website", other: "Other",
};
const SOURCE_EMOJI: Record<LeadSource, string> = {
  walk_in: "🚶", instagram: "📸", facebook: "👥", referral: "🤝", google: "🔍", whatsapp: "💬", website: "🌐", other: "📋",
};

export type CardFieldKey =
  | "lead_age" | "last_touch" | "open_tasks" | "activities" | "next_up"
  | "status" | "owner" | "phone" | "email" | "source" | "plan" | "created" | "updated" | "notes";

const CARD_FIELD_DEFS: { key: CardFieldKey; label: string; group: "glance" | "details" | "notes" }[] = [
  { key: "lead_age", label: "Lead age", group: "glance" },
  { key: "last_touch", label: "Last touch", group: "glance" },
  { key: "open_tasks", label: "Open tasks", group: "glance" },
  { key: "activities", label: "Activities", group: "glance" },
  { key: "next_up", label: "Next up banner", group: "glance" },
  { key: "status", label: "Status", group: "details" },
  { key: "owner", label: "Lead owner", group: "details" },
  { key: "phone", label: "Phone", group: "details" },
  { key: "email", label: "Email", group: "details" },
  { key: "source", label: "Source", group: "details" },
  { key: "plan", label: "Interested plan", group: "details" },
  { key: "created", label: "Created", group: "details" },
  { key: "updated", label: "Last updated", group: "details" },
  { key: "notes", label: "Notes", group: "notes" },
];
const DEFAULT_VISIBLE: CardFieldKey[] = CARD_FIELD_DEFS.map((f) => f.key); // everything on, same as the old fixed card

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
function formatDate(iso: string) {
  return new Date(iso.slice(0, 10) + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function CustomizePopover({ visible, onChange, onClose }: { visible: CardFieldKey[]; onChange: (v: CardFieldKey[]) => void; onClose: () => void }) {
  function toggle(key: CardFieldKey) {
    onChange(visible.includes(key) ? visible.filter((k) => k !== key) : [...visible, key]);
  }
  const groups: { key: "glance" | "details" | "notes"; label: string }[] = [
    { key: "glance", label: "At a glance" }, { key: "details", label: "Details" }, { key: "notes", label: "Notes" },
  ];
  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, width: 260, background: "var(--surface)", border: "1px solid var(--separator)", borderRadius: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.14)", padding: 10, zIndex: 40 }}>
      {groups.map((g) => (
        <div key={g.key} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11.5, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.4px", padding: "4px 6px" }}>{g.label}</div>
          {CARD_FIELD_DEFS.filter((f) => f.group === g.key).map((f) => (
            <label key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", fontSize: 13.5, cursor: "pointer", borderRadius: 8 }}>
              <input type="checkbox" checked={visible.includes(f.key)} onChange={() => toggle(f.key)} style={{ accentColor: "var(--accent)" }} />
              {f.label}
            </label>
          ))}
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--separator)" }}>
        <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" onClick={() => onChange(DEFAULT_VISIBLE)}>Reset</button>
        <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

export function LeadSummaryCard({
  lead, staff, myUserId, leadAgeDays, lastTouchIso, openTasksCount, overdueCount, activitiesCount,
  nextUp, onEdit, onEditNotes, onStatusChange, onAssign, savingAssign,
}: {
  lead: Lead; staff: StaffMember[]; myUserId: string;
  leadAgeDays: number; lastTouchIso: string | null; openTasksCount: number; overdueCount: number; activitiesCount: number;
  nextUp: { label: string; dueAt: string; overdue: boolean } | null;
  onEdit: () => void; onEditNotes: () => void;
  onStatusChange: (s: LeadStatus) => void; onAssign: (userId: string) => void; savingAssign: boolean;
}) {
  const [visible, setVisible] = useState<CardFieldKey[]>(DEFAULT_VISIBLE);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoaded(true); return; }
      const { data } = await supabase.from("ps_layout_prefs").select("value").eq("user_id", user.id).eq("scope", "lead_detail_card").maybeSingle();
      const v = (data?.value as { visible?: CardFieldKey[] } | undefined)?.visible;
      if (v?.length) setVisible(v);
      setLoaded(true);
    })();
  }, []);

  async function persist(next: CardFieldKey[]) {
    setVisible(next);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("ps_layout_prefs").upsert(
      { org_id: lead.org_id, user_id: user.id, scope: "lead_detail_card", value: { visible: next }, updated_at: new Date().toISOString() },
      { onConflict: "user_id,scope" }
    );
  }

  const has = (k: CardFieldKey) => visible.includes(k);
  const sectionTitle: React.CSSProperties = { fontSize: 11.5, fontWeight: 650, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.5px", margin: 0 };
  const assignedStaff = staff.find((s) => s.user_id === lead.assigned_to);

  const glanceVisible = ["lead_age", "last_touch", "open_tasks", "activities"].some(has);
  const detailsVisible = ["status", "owner", "phone", "email", "source", "plan", "created", "updated"].some(has);

  if (!loaded) return null;

  return (
    <>
      {/* Customize affordance, sits above the stack */}
      <div style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
          <Settings2 size={12} /> Customize
        </button>
        {open && <CustomizePopover visible={visible} onChange={persist} onClose={() => setOpen(false)} />}
      </div>

      {glanceVisible && (
        <div className="ps-card ps-card-body">
          <h2 style={{ ...sectionTitle, marginBottom: 12 }}>At a glance</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {has("lead_age") && (
              <div style={{ background: "var(--fill)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}>Lead age</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{leadAgeDays === 0 ? "Today" : `${leadAgeDays} day${leadAgeDays === 1 ? "" : "s"}`}</div>
              </div>
            )}
            {has("last_touch") && (
              <div style={{ background: "var(--fill)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}>Last touch</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{lastTouchIso ? timeAgo(lastTouchIso) : "Never"}</div>
              </div>
            )}
            {has("open_tasks") && (
              <div style={{ background: "var(--fill)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}>Open tasks</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, color: overdueCount > 0 ? "var(--red)" : "var(--text-primary)" }}>{openTasksCount}</div>
              </div>
            )}
            {has("activities") && (
              <div style={{ background: "var(--fill)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", fontWeight: 500 }}>Activities</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{activitiesCount}</div>
              </div>
            )}
          </div>
          {has("next_up") && nextUp && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--separator)", display: "flex", alignItems: "center", gap: 10 }}>
              <Clock size={15} style={{ color: nextUp.overdue ? "var(--red)" : "var(--accent)", flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Next up</div>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{nextUp.label} · {new Date(nextUp.dueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {detailsVisible && (
        <div className="ps-card ps-card-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={sectionTitle}>Details</h2>
            <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 26 }} onClick={onEdit}><Edit2 size={12} /> Edit</button>
          </div>

          {(has("status") || has("owner")) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {has("status") && (
                <div>
                  <div className="ps-label" style={{ marginBottom: 5 }}>Status</div>
                  <select className="ps-input" value={lead.status} onChange={(e) => onStatusChange(e.target.value as LeadStatus)} style={{ height: 36, fontSize: 13.5 }}>
                    {(Object.keys(STATUS_META) as LeadStatus[]).map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </select>
                </div>
              )}
              {has("owner") && (
                <div>
                  <div className="ps-label" style={{ marginBottom: 5 }}>Lead owner</div>
                  <select className="ps-input" value={lead.assigned_to ?? ""} onChange={(e) => onAssign(e.target.value)} disabled={savingAssign} style={{ height: 36, fontSize: 13.5 }}>
                    <option value="">Unassigned</option>
                    {staff.map((s) => <option key={s.id} value={s.user_id}>{s.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          {["phone", "email", "source", "plan", "created", "updated"].some(has) && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--separator)" }}>
              {has("phone") && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Phone</span>
                  <span style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 6, color: lead.phone ? "var(--text-primary)" : "var(--text-tertiary)" }}>{lead.phone && <Phone size={12} style={{ color: "var(--text-tertiary)" }} />}{lead.phone || "—"}</span>
                </div>
              )}
              {has("email") && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Email</span>
                  <span style={{ fontSize: 13.5, display: "flex", alignItems: "center", gap: 6, color: lead.email ? "var(--text-primary)" : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lead.email && <Mail size={12} style={{ color: "var(--text-tertiary)" }} />}{lead.email || "—"}</span>
                </div>
              )}
              {has("source") && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Source</span>
                  <span style={{ fontSize: 13.5, color: lead.source ? "var(--text-primary)" : "var(--text-tertiary)" }}>{lead.source ? `${SOURCE_EMOJI[lead.source]} ${SOURCE_LABELS[lead.source]}` : "—"}</span>
                </div>
              )}
              {has("plan") && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Interested plan</span>
                  <span style={{ fontSize: 13.5, color: lead.membership_plans?.name ? "var(--text-primary)" : "var(--text-tertiary)" }}>{lead.membership_plans?.name ?? "—"}</span>
                </div>
              )}
              {has("created") && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--separator)" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Created</span>
                  <span style={{ fontSize: 13.5 }}>{formatDate(lead.created_at)}</span>
                </div>
              )}
              {has("updated") && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0" }}>
                  <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Last updated</span>
                  <span style={{ fontSize: 13.5 }}>{formatDate(lead.updated_at)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {has("notes") && (
        <div className="ps-card ps-card-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <h2 style={sectionTitle}>Notes</h2>
            <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 26 }} onClick={onEditNotes}><Edit2 size={12} /> {lead.notes ? "Edit" : "Add"}</button>
          </div>
          <div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-line", color: lead.notes ? "var(--text-secondary)" : "var(--text-tertiary)" }}>{lead.notes || "No notes yet."}</div>
        </div>
      )}
    </>
  );
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Search, Users, UserCheck, KeyRound, Mail, UserX, Phone, MessageCircle, Send, ShieldCheck, Pencil } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { useRole, ROLE_DEFAULTS, type StaffRole, type Permissions } from "../components/useRole"
import { Avatar, Skeleton, useToast } from "../components/ui"
import { Sheet } from "../components/Sheet"
import { DesignStyles } from "../components/DesignSystem"

const supabase = createClient()

type Staff = {
  id: string
  name: string
  phone: string | null
  email: string | null
  role: StaffRole
  permissions: Permissions
  is_active: boolean
  user_id: string | null
  invite_status: "not_invited" | "invited" | "active"
}

const ROLES: { value: StaffRole; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "trainer", label: "Trainer" },
  { value: "dietitian", label: "Dietitian" },
  { value: "receptionist", label: "Receptionist" },
  { value: "accounts", label: "Accounts" },
  { value: "general_staff", label: "General Staff" },
]

const MODULE_LABELS: { key: keyof Permissions; label: string }[] = [
  { key: "members", label: "Members" },
  { key: "attendance", label: "Attendance" },
  { key: "classes", label: "Classes" },
  { key: "workouts", label: "Workouts" },
  { key: "diet", label: "Diet plans" },
  { key: "recipes", label: "Recipe library" },
  { key: "ai_recipes", label: "AI recipe helper" },
  { key: "leads", label: "Leads" },
  { key: "payments", label: "Payments" },
  { key: "membership_plans", label: "Membership plans" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
]

const COLS = "minmax(0,2fr) 140px minmax(0,1.1fr) 100px 16px"

// Rows are buttons (the whole row opens the editor), so strip native button chrome.
// Border-bottom comes from .db-trow, so only the other sides are reset.
const ROW_BUTTON: React.CSSProperties = {
  gridTemplateColumns: COLS,
  width: "100%",
  textAlign: "left",
  font: "inherit",
  cursor: "pointer",
  background: "none",
  borderTop: 0,
  borderLeft: 0,
  borderRight: 0,
}

function emptyForm() {
  return {
    name: "",
    phone: "",
    email: "",
    role: "trainer" as StaffRole,
    permissions: { ...ROLE_DEFAULTS["trainer"] },
    is_active: true,
  }
}

export default function StaffClient() {
  const roleData = useRole()
  const router = useRouter()
  const { toast, show } = useToast()

  const [staff, setStaff] = useState<Staff[]>([])
  const [fetching, setFetching] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Staff | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [inviting, setInviting] = useState(false)

  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [roleFilter, setRoleFilter] = useState<StaffRole | "all">("all")

  useEffect(() => {
    if (!roleData.loading && roleData.staff_role !== "owner" && roleData.staff_role !== "manager") {
      router.replace("/dashboard")
    }
  }, [roleData.loading, roleData.staff_role, router])

  useEffect(() => {
    if (!roleData.loading && roleData.org_id) fetchStaff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleData.loading, roleData.org_id])

  async function fetchStaff() {
    setFetching(true)
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .eq("org_id", roleData.org_id)
      .order("name")
    if (error) console.error("Staff fetch error:", error)
    setStaff((data ?? []) as Staff[])
    setFetching(false)
    setFetched(true)
  }

  function openAdd() {
    setEditing(null)
    setForm(emptyForm())
    setSheetOpen(true)
  }

  function openEdit(s: Staff) {
    setEditing(s)
    setForm({
      name: s.name,
      phone: s.phone ?? "",
      email: s.email ?? "",
      role: s.role,
      permissions: { ...ROLE_DEFAULTS[s.role], ...s.permissions },
      is_active: s.is_active,
    })
    setSheetOpen(true)
  }

  function handleRoleChange(role: StaffRole) {
    setForm((f) => ({ ...f, role, permissions: { ...ROLE_DEFAULTS[role] } }))
  }

  function togglePerm(key: keyof Permissions) {
    setForm((f) => ({ ...f, permissions: { ...f.permissions, [key]: !f.permissions[key] } }))
  }

  async function handleSave() {
    if (!form.name.trim()) { show("Name is required", "error"); return }
    if (!roleData.org_id) { show("Couldn't find your gym. Try reloading.", "error"); return }
    setSaving(true)

    const payload = {
      org_id: roleData.org_id,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      role: form.role,
      permissions: form.permissions,
      is_active: form.is_active,
    }

    const { error } = editing
      ? await supabase.from("staff").update(payload).eq("id", editing.id)
      : await supabase.from("staff").insert(payload)

    setSaving(false)
    if (error) {
      console.error("Staff save error:", error)
      show(editing ? "Failed to update staff" : "Failed to add staff", "error")
      return
    }

    show(editing ? "Staff updated" : "Staff added", "success")
    setSheetOpen(false)
    fetchStaff()   // refetch directly; flipping `fetched` alone never re-ran the effect
  }

  async function handleInvite(s: Staff) {
    if (!s.email) { show("Add an email first", "error"); return }
    setInviting(true)
    try {
      const res = await fetch("/api/staff/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: s.id }),
      })
      const body = await res.json()
      if (!res.ok) {
        show(body.error ?? "Failed to send invite", "error")
        return
      }
      show(`Invite sent to ${s.email}`, "success")
      fetchStaff()
      setSheetOpen(false)
    } catch (err) {
      console.error("Invite error:", err)
      show("Failed to send invite", "error")
    } finally {
      setInviting(false)
    }
  }

  const loading = !fetched && (roleData.loading || fetching)
  const activeCount = staff.filter((s) => s.is_active).length
  const inactiveCount = staff.length - activeCount
  const presentRoles = ROLES.filter((r) => staff.some((s) => s.role === r.value))

  const q = query.trim().toLowerCase()
  const filtered = staff.filter((s) => {
    if (statusFilter === "active" && !s.is_active) return false
    if (statusFilter === "inactive" && s.is_active) return false
    if (roleFilter !== "all" && s.role !== roleFilter) return false
    if (!q) return true
    return (
      s.name.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q)
    )
  })
  const hasFilters = statusFilter !== "all" || roleFilter !== "all" || q !== ""
  const enabledModules = MODULE_LABELS.filter((m) => form.permissions[m.key]).length

  function clearFilters() {
    setQuery("")
    setStatusFilter("all")
    setRoleFilter("all")
  }

  const withLogin = staff.filter((s) => s.invite_status === "active").length
  const invitedCount = staff.filter((s) => s.invite_status === "invited").length
  const roleLabel = (r: StaffRole) => ROLES.find((x) => x.value === r)?.label ?? r
  const accessCount = (s: Staff) => MODULE_LABELS.filter((m) => ({ ...ROLE_DEFAULTS[s.role], ...s.permissions })[m.key]).length
  const wa = (p: string | null) => { if (!p) return null; const d = p.replace(/\D/g, ""); return `https://wa.me/${d.length === 10 ? "91" + d : d}` }

  return (
    <div className="ps-page db sf">
      <DesignStyles />
      <style>{SF_CSS}</style>

      <header className="sf-head">
        <div className="sf-title">
          <span className="sf-title-icon"><Users size={21} /></span>
          <div>
            <h1>Staff</h1>
            <p>{fetched ? `${activeCount} active · ${withLogin} with a login${inactiveCount ? ` · ${inactiveCount} inactive` : ""}` : "\u00a0"}</p>
          </div>
        </div>
        <div className="sf-actions">
          <button type="button" className="ps-btn ps-btn--primary" onClick={openAdd}><Plus size={16} strokeWidth={2.4} /><span>Add staff</span></button>
        </div>
        <div className="sf-kpis">
          <div className="sf-kpi"><span className="sf-kpi-icon"><Users size={15} /></span><div><small>Team size</small><b>{loading ? "–" : staff.length}</b></div></div>
          <div className="sf-kpi"><span className="sf-kpi-icon"><UserCheck size={15} /></span><div><small>Active</small><b>{loading ? "–" : activeCount}</b></div></div>
          <div className="sf-kpi"><span className="sf-kpi-icon"><KeyRound size={15} /></span><div><small>With a login</small><b>{loading ? "–" : withLogin}</b></div></div>
          <div className="sf-kpi"><span className="sf-kpi-icon"><Mail size={15} /></span><div><small>Invite pending</small><b>{loading ? "–" : invitedCount}</b></div></div>
          <div className="sf-kpi"><span className="sf-kpi-icon"><UserX size={15} /></span><div><small>Inactive</small><b>{loading ? "–" : inactiveCount}</b></div></div>
        </div>
      </header>

      <div className="sf-toolbar">
        <div className="sf-row">
          <div className="sf-seg" role="tablist" aria-label="Status">
            {([["all", "All", staff.length], ["active", "Active", activeCount], ["inactive", "Inactive", inactiveCount]] as const).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={statusFilter === k} onClick={() => setStatusFilter(k)}>{l} <span>{n}</span></button>
            ))}
          </div>
          <label className="sf-search"><Search size={16} />
            <input type="search" placeholder="Search by name, email or phone" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search staff" />
          </label>
        </div>
        {presentRoles.length > 0 && (
          <div className="sf-chips" role="group" aria-label="Role">
            <button type="button" className="sf-chip" aria-pressed={roleFilter === "all"} onClick={() => setRoleFilter("all")}>All roles <em>{staff.length}</em></button>
            {presentRoles.map((r) => (
              <button key={r.value} type="button" className="sf-chip" aria-pressed={roleFilter === r.value} onClick={() => setRoleFilter(roleFilter === r.value ? "all" : r.value)}>
                {r.label} <em>{staff.filter((x) => x.role === r.value).length}</em>
              </button>
            ))}
            {hasFilters && <button type="button" className="sf-link" onClick={clearFilters}>Clear filters</button>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="sf-card">{[1, 2, 3, 4].map((i) => (
          <div key={i} className="sf-tr"><span className="sf-who"><Skeleton w={38} h={38} r={19} /><Skeleton w={150} h={13} /></span><Skeleton w={80} h={22} r={11} /><Skeleton w={110} h={12} /><Skeleton w={70} h={22} r={11} /><span /></div>
        ))}</div>
      ) : staff.length === 0 ? (
        <div className="sf-empty">
          <span className="sf-empty-icon"><Users size={20} /></span>
          <strong>No staff yet</strong>
          <p>Add your first team member and choose what they can access.</p>
          <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={openAdd}><Plus size={14} /> Add staff</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="sf-empty">
          <span className="sf-empty-icon"><Search size={20} /></span>
          <strong>No staff match</strong>
          <p>Try a different name, role or status.</p>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className="sf-card">
          <div className="sf-tr sf-th"><span>Team member</span><span>Role</span><span>Access</span><span>Login</span><span>Status</span><span /></div>
          {filtered.map((s) => {
            const n = accessCount(s)
            const w = wa(s.phone)
            return (
              <div key={s.id} className="sf-tr sf-row" data-off={!s.is_active} onClick={() => openEdit(s)} role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") openEdit(s) }}>
                <span className="sf-who">
                  <Avatar name={s.name} size={38} />
                  <span className="sf-text"><b>{s.name}</b><small>{[s.phone, s.email].filter(Boolean).join(" · ") || "No contact details"}</small></span>
                </span>
                <span><span className="sf-role">{roleLabel(s.role)}</span></span>
                <span className="sf-access" title={`${n} of ${MODULE_LABELS.length} modules`}>
                  <span className="sf-bar"><i style={{ width: `${(n / MODULE_LABELS.length) * 100}%` }} /></span>
                  <small>{n}/{MODULE_LABELS.length}</small>
                </span>
                <span>
                  {s.invite_status === "active" ? <span className="sf-pill sf-pill--blue"><KeyRound size={11} />Has login</span>
                    : s.invite_status === "invited" ? <span className="sf-pill sf-pill--amber"><Mail size={11} />Invited</span>
                    : <span className="sf-pill">No login</span>}
                </span>
                <span><span className={`sf-pill ${s.is_active ? "sf-pill--green" : ""}`}><i />{s.is_active ? "Active" : "Inactive"}</span></span>
                <span className="sf-acts" onClick={(e) => e.stopPropagation()}>
                  {s.phone && <a href={`tel:${s.phone}`} className="sf-icon" aria-label={`Call ${s.name}`} title="Call"><Phone size={15} /></a>}
                  {w && <a href={w} target="_blank" rel="noreferrer" className="sf-icon" aria-label="WhatsApp" title="WhatsApp"><MessageCircle size={15} /></a>}
                  {s.invite_status !== "active" && s.email && (
                    <button type="button" className="sf-icon" title={s.invite_status === "invited" ? "Resend invite" : "Send invite"} aria-label="Send invite" disabled={inviting} onClick={() => handleInvite(s)}><Send size={15} /></button>
                  )}
                  <button type="button" className="sf-icon" title="Edit" aria-label={`Edit ${s.name}`} onClick={() => openEdit(s)}><Pencil size={15} /></button>
                  <ChevronRight size={16} className="sf-chev" />
                </span>
              </div>
            )
          })}
          <div className="sf-foot">Showing {filtered.length} of {staff.length}</div>
        </div>
      )}

      <Sheet
        width={620}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={editing ? "Edit staff" : "Add staff"}
        description={editing ? "Update their details and what they can access." : "Add a team member and choose what they can access."}
        footer={
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setSheetOpen(false)}>
              <span>Cancel</span>
            </button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
              <span>{saving ? "Saving…" : editing ? "Save changes" : "Add staff"}</span>
            </button>
          </>
        }
      >
        <div className="db" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div className="ps-form-grid">
            <div className="ps-field ps-span-2">
              <label className="ps-label">Name</label>
              <input
                className="ps-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
                autoFocus
              />
            </div>
            <div className="ps-field">
              <label className="ps-label">Phone</label>
              <input
                className="ps-input"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="ps-field">
              <label className="ps-label">Email</label>
              <input
                className="ps-input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="trainer@gym.com"
              />
            </div>
          </div>

          <div>
            <div className="ps-label" style={{ marginBottom: 10 }}>Role</div>
            <div className="db-presets" role="group" aria-label="Role">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className="db-preset"
                  aria-pressed={form.role === r.value}
                  onClick={() => handleRoleChange(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="db-card-sub" style={{ marginTop: 8 }}>
              Changing the role resets module access to that role&apos;s defaults.
            </div>
          </div>

          <div>
            <div className="db-card-head" style={{ marginBottom: 4 }}>
              <div className="ps-label">Module access</div>
              <span className="db-card-sub" style={{ marginTop: 0 }}>
                {enabledModules} of {MODULE_LABELS.length} on
              </span>
            </div>
            <div className="sf-perm-actions">
              <button type="button" onClick={() => setForm((f) => ({ ...f, permissions: MODULE_LABELS.reduce((acc, m) => ({ ...acc, [m.key]: true }), { ...f.permissions }) }))}>Turn all on</button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, permissions: MODULE_LABELS.reduce((acc, m) => ({ ...acc, [m.key]: false }), { ...f.permissions }) }))}>Turn all off</button>
              <button type="button" onClick={() => setForm((f) => ({ ...f, permissions: { ...ROLE_DEFAULTS[f.role] } }))}>Reset to role defaults</button>
            </div>
            <div className="db-toggles">
              {MODULE_LABELS.map(({ key, label }) => (
                <label key={key} className="db-toggle">
                  <span className="db-toggle-title">{label}</span>
                  <input
                    type="checkbox"
                    className="db-switch"
                    checked={!!form.permissions[key]}
                    onChange={() => togglePerm(key)}
                    aria-label={label}
                  />
                </label>
              ))}
            </div>
          </div>

          {editing && (
            <>
              <div className="db-toggles">
                <label className="db-toggle">
                  <div>
                    <div className="db-toggle-title">Active</div>
                    <div className="db-toggle-sub">Turn off to mark this staff member as inactive</div>
                  </div>
                  <input
                    type="checkbox"
                    className="db-switch"
                    checked={form.is_active}
                    onChange={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                    aria-label="Active"
                  />
                </label>
              </div>

              <div className="db-card-sub" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>
                  {editing.invite_status === "active" && "Has a login"}
                  {editing.invite_status === "invited" && "Invited — hasn't logged in yet"}
                  {(editing.invite_status === "not_invited" || !editing.invite_status) && "No login yet"}
                </span>
                {editing.invite_status !== "active" && (
                  <button
                    type="button"
                    className="ps-btn ps-btn--secondary ps-btn--sm"
                    onClick={() => handleInvite(editing)}
                    disabled={inviting || !editing.email}
                  >
                    <span>
                      {inviting ? "Sending…" : editing.invite_status === "invited" ? "Resend invite" : "Send invite"}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </Sheet>

      {toast}
    </div>
  )
}

// NOTE: no backticks inside this CSS.
const SF_CSS = `
.ps-page.sf { max-width: none !important; margin: 0 !important; padding: 18px !important; }
.db.sf { max-width: none; }
.sf { --sf-line: var(--separator); }
.sf-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px 14px; margin-bottom: 14px; }
.sf-title { display: flex; align-items: center; gap: 12px; min-width: 0; }
.sf-title-icon { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #0a66d6, #3c4fe0); box-shadow: 0 8px 18px -8px rgba(10,102,214,0.6); flex-shrink: 0; }
.sf-title h1 { margin: 0; font-size: 24px; font-weight: 750; letter-spacing: -0.025em; }
.sf-title p { margin: 1px 0 0; font-size: 13px; color: var(--text-tertiary); }
.sf-actions .ps-btn { height: 42px; border-radius: 12px; }
.sf-kpis { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.sf-kpi { display: flex; align-items: center; gap: 9px; height: 50px; padding: 0 12px 0 9px; border-radius: 12px; background: #fff; border: 1px solid var(--sf-line); min-width: 0; }
.sf-kpi-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); flex-shrink: 0; }
.sf-kpi div { display: flex; flex-direction: column; line-height: 1.15; min-width: 0; }
.sf-kpi small { font-size: 12px; font-weight: 600; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sf-kpi b { font-size: 17px; font-weight: 750; }

.sf-toolbar { position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 10px; margin-bottom: 14px; border-radius: 16px; background: #fff; border: 1px solid var(--sf-line); }
.sf-toolbar::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.sf-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sf-seg { display: flex; padding: 3px; border-radius: 11px; background: #f2f3f6; }
.sf-seg button { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--text-secondary); cursor: pointer; }
.sf-seg button span { font-size: 11.5px; font-weight: 700; color: var(--text-tertiary); }
.sf-seg button[aria-selected="true"] { background: #fff; color: var(--accent); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.sf-search { position: relative; display: flex; align-items: center; flex: 1; min-width: 200px; }
.sf-search > svg { position: absolute; left: 12px; color: var(--text-tertiary); pointer-events: none; }
.sf-search input { width: 100%; height: 38px; padding: 0 12px 0 36px; border: 1px solid var(--sf-line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; background: #fff; }
.sf-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.sf-chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; align-items: center; }
.sf-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 16px; border: 1.5px solid var(--sf-line); background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-secondary); cursor: pointer; white-space: nowrap; }
.sf-chip em { font-style: normal; font-size: 11.5px; font-weight: 700; opacity: 0.6; }
.sf-chip[aria-pressed="true"] { background: var(--accent); border-color: transparent; color: #fff; }
.sf-link { border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; white-space: nowrap; }

.sf-card { background: #fff; border: 1px solid var(--sf-line); border-radius: 18px; overflow: hidden; }
.sf-tr { display: grid; grid-template-columns: minmax(220px, 2.2fr) 140px 150px 120px 110px 150px; align-items: center; gap: 14px; padding: 0 16px; min-height: 62px; border-bottom: 1px solid #eef0f3; }
.sf-th { min-height: 40px; background: #f6f8fb; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
.sf-row { cursor: pointer; transition: background 120ms; outline: none; }
.sf-row:hover, .sf-row:focus-visible { background: #f7faff; }
.sf-row[data-off="true"] { opacity: 0.6; }
.sf-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.sf-text { display: flex; flex-direction: column; min-width: 0; }
.sf-text b { font-size: 14.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-text small { font-size: 12.5px; color: var(--text-tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sf-role { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 8px; background: var(--accent-dim, #e8f1ff); color: var(--accent); font-size: 12.5px; font-weight: 650; }
.sf-access { display: flex; align-items: center; gap: 8px; }
.sf-bar { flex: 1; height: 6px; border-radius: 4px; background: #eef2f8; overflow: hidden; max-width: 90px; }
.sf-bar i { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.sf-access small { font-size: 12.5px; font-weight: 650; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.sf-pill { display: inline-flex; align-items: center; gap: 5px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 650; background: #f0f0f3; color: #6e6e73; white-space: nowrap; }
.sf-pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.sf-pill--green { background: #e6f6ec; color: #1f8a3b; } .sf-pill--blue { background: #e8f1ff; color: #0a66d6; } .sf-pill--amber { background: #fff1de; color: #b45309; }
.sf-acts { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.sf-icon { width: 32px; height: 32px; border: none; border-radius: 9px; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; text-decoration: none; }
.sf-icon:hover:not(:disabled) { background: #eef2f8; color: var(--accent); }
.sf-icon:disabled { opacity: 0.4; }
.sf-chev { color: var(--text-tertiary); }
.sf-foot { padding: 10px 16px; font-size: 12.5px; color: var(--text-tertiary); }

.sf-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 52px 20px; background: #fff; border: 1px solid var(--sf-line); border-radius: 18px; }
.sf-empty-icon { width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center; background: var(--accent-dim, #e8f1ff); color: var(--accent); margin-bottom: 4px; }
.sf-empty strong { font-size: 15.5px; } .sf-empty p { margin: 0 0 8px; font-size: 13.5px; color: var(--text-tertiary); }

.sf-perm-actions { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 10px; }
.sf-perm-actions button { height: 28px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--separator); background: #fff; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--accent); cursor: pointer; }

@media (max-width: 1100px) {
  .sf-tr { grid-template-columns: minmax(200px, 2fr) 120px 120px 110px 110px; }
  .sf-tr > :nth-child(3) { display: none; }
}
@media (max-width: 760px) {
  .ps-page.sf { padding: 10px 10px 24px !important; }
  .sf-head { grid-template-columns: minmax(0, 1fr); }
  .sf-actions .ps-btn { width: 100%; justify-content: center; }
  .sf-kpis { display: flex; overflow-x: auto; scrollbar-width: none; }
  .sf-kpi { flex: 0 0 auto; }
  .sf-search { flex-basis: 100%; min-width: 0; }
  .sf-search input { font-size: 16px; }
  .sf-tr { grid-template-columns: minmax(0, 1fr) auto; padding: 10px 12px; min-height: 0; }
  .sf-th { display: none; }
  .sf-tr > :nth-child(2), .sf-tr > :nth-child(3), .sf-tr > :nth-child(4) { display: none; }
  .sf-tr > :nth-child(5) { display: none; }
  .sf-chev { display: none; }
}
`

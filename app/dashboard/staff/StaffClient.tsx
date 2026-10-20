"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, Search, Users } from "lucide-react"
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

  return (
    <div className="ps-page db">
      <DesignStyles />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Admin</div>
          <h1 className="db-title">Staff</h1>
          <p className="db-subtitle">
            {fetched ? (
              <>
                <strong>{activeCount}</strong> active staff {activeCount === 1 ? "member" : "members"}
                {inactiveCount > 0 && <> · {inactiveCount} inactive</>}
              </>
            ) : "\u00a0"}
          </p>
        </div>
        <div className="db-header-actions">
          <button type="button" className="ps-btn ps-btn--primary" onClick={openAdd}>
            <Plus size={16} strokeWidth={2.4} /> <span>Add staff</span>
          </button>
        </div>
      </header>

      {fetched && staff.length > 0 && (
        <div className="db-card db-toolbar">
          <label className="db-search">
            <Search size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email or phone"
              aria-label="Search staff"
            />
          </label>
          <div className="db-presets" role="group" aria-label="Filter by status">
            {([
              { value: "all" as const, label: "All" },
              { value: "active" as const, label: "Active" },
              { value: "inactive" as const, label: "Inactive" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="db-preset"
                aria-pressed={statusFilter === opt.value}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {presentRoles.length > 1 && (
            <div className="db-presets" role="group" aria-label="Filter by role" style={{ flexBasis: "100%" }}>
              <button type="button" className="db-preset" aria-pressed={roleFilter === "all"} onClick={() => setRoleFilter("all")}>
                All roles
              </button>
              {presentRoles.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className="db-preset"
                  aria-pressed={roleFilter === r.value}
                  onClick={() => setRoleFilter(roleFilter === r.value ? "all" : r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="db-card" style={{ overflow: "hidden" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="db-trow db-members-row" style={{ gridTemplateColumns: COLS }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Skeleton w={34} h={34} r={17} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Skeleton w={150} h={13} />
                  <Skeleton w={110} h={11} />
                </div>
              </div>
              <Skeleton w={72} h={22} r={11} />
              <div className="db-hide-sm"><Skeleton w={96} h={12} /></div>
              <div className="db-hide-sm"><Skeleton w={60} h={22} r={11} /></div>
              <span />
            </div>
          ))}
        </div>
      ) : staff.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <span className="db-empty-icon"><Users size={18} /></span>
            <div className="db-empty-title">No staff yet</div>
            <div className="db-empty-text">Add your first staff member and choose what they can access.</div>
            <button type="button" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }} onClick={openAdd}>
              <Plus size={16} strokeWidth={2.4} /> <span>Add staff</span>
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <span className="db-empty-icon"><Search size={18} /></span>
            <div className="db-empty-title">No staff match</div>
            <div className="db-empty-text">Try a different name, role or status.</div>
            {hasFilters && (
              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" style={{ marginTop: 14 }} onClick={clearFilters}>
                <span>Clear filters</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="db-card" style={{ overflow: "hidden" }}>
          <div className="db-table-head" style={{ gridTemplateColumns: COLS }}>
            <span>Name</span>
            <span>Role</span>
            <span className="db-hide-sm">Phone</span>
            <span className="db-hide-sm">Status</span>
            <span />
          </div>
          {filtered.map((s) => (
            <button
              key={s.id}
              type="button"
              className="db-trow db-members-row"
              style={ROW_BUTTON}
              onClick={() => openEdit(s)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                <Avatar name={s.name} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span className="db-row-title">{s.name}</span>
                    {!s.is_active && <span className="db-pill db-pill--muted db-show-sm">Inactive</span>}
                  </div>
                  <div className="db-row-sub">{s.email ?? s.phone ?? "No contact details"}</div>
                </div>
              </div>
              <div>
                <span className="db-pill db-pill--blue">
                  {ROLES.find((r) => r.value === s.role)?.label ?? s.role}
                </span>
              </div>
              <div className="db-hide-sm" style={{ fontSize: 13.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", minWidth: 0 }}>
                {s.phone ?? "—"}
              </div>
              <div className="db-hide-sm">
                <span className={`db-pill ${s.is_active ? "db-pill--green" : "db-pill--muted"}`}>
                  {s.is_active ? "Active" : "Inactive"}
                </span>
              </div>
              <ChevronRight size={16} className="db-meal-chev" />
            </button>
          ))}
        </div>
      )}

      <Sheet
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
          )}
        </div>
      </Sheet>

      {toast}
    </div>
  )
}

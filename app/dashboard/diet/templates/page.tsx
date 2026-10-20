"use client"
// app/dashboard/diet/templates/page.tsx
// Condition-based diet plan template library — browse presets + your own, assign directly to a member

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Activity, BookOpen, ClipboardList, Droplets, Flame, HeartPulse, Leaf, Loader2,
  Plus, Search, Sparkles, Stethoscope, Trash2, User, UserPlus, Zap,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Avatar, BackLink, Skeleton, useToast } from "../../components/ui"
import { Sheet } from "../../components/Sheet"
import { DesignStyles } from "../../components/DesignSystem"

// ── Types ──────────────────────────────────────────────────────────────────

interface Template {
  id: string
  org_id: string | null
  name: string
  conditions: string[]
  description: string | null
  duration_days: number
  template_json: { manual_days?: { slots: unknown[] }[] }
  is_active: boolean
  created_at: string
}

interface MemberOption { id: string; full_name: string }

const CONDITIONS = ["Diabetes", "PCOS", "Hypertension", "Thyroid", "Weight Loss", "GERD"]

// Icon follows the template's first condition; tone cycles by index (design rule: plan cards)
const CONDITION_ICONS: Record<string, LucideIcon> = {
  Diabetes: Droplets,
  PCOS: Sparkles,
  Hypertension: HeartPulse,
  Thyroid: Activity,
  "Weight Loss": Flame,
  GERD: Leaf,
}
const TONES = ["blue", "green", "purple", "amber"] as const

function Stat({ tone, icon: Icon, label, value, note, loading }: {
  tone: (typeof TONES)[number]
  icon: LucideIcon
  label: string
  value: number
  note?: string
  loading: boolean
}) {
  return (
    <div className={`db-stat db-tone-${tone}`}>
      <span className="db-chip"><Icon size={15} strokeWidth={2.3} /></span>
      <div style={{ minWidth: 0 }}>
        <div className="db-stat-label">{label}</div>
        <div className="db-stat-value">
          {loading ? <Skeleton w={28} h={18} r={6} /> : <>{value}{note && <span className="db-stat-note">{note}</span>}</>}
        </div>
      </div>
    </div>
  )
}

// ── Assign to member sheet ──────────────────────────────────────────────────

function AssignTemplateSheet({ template, orgId, onClose, onAssigned }: {
  template: Template
  orgId: string
  onClose: () => void
  onAssigned: (memberName: string) => void
}) {
  const [members, setMembers] = useState<MemberOption[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<MemberOption | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("members")
        .select("id, full_name")
        .eq("org_id", orgId)
        .eq("status", "active")
        .order("full_name")
      setMembers((data as MemberOption[]) || [])
      setLoading(false)
    }
    load()
  }, [orgId])

  const q = query.trim().toLowerCase()
  const filtered = members.filter((m) => !q || m.full_name.toLowerCase().includes(q))

  async function handleAssign() {
    if (!selected) return
    setSaving(true)
    setError("")
    try {
      await supabase
        .from("member_diet_plans")
        .update({ status: "superseded" })
        .eq("member_id", selected.id)
        .eq("status", "active")

      const { error: insertErr } = await supabase.from("member_diet_plans").insert({
        org_id: orgId,
        member_id: selected.id,
        plan_mode: "manual",
        plan_days: template.duration_days,
        start_date: new Date().toISOString().slice(0, 10),
        target_kcal: 0,
        target_protein_g: 0,
        target_carbs_g: 0,
        target_fat_g: 0,
        plan_json: template.template_json,
        coach_notes: template.description,
        status: "active",
        version_number: 1,
      })

      if (insertErr) { setError(insertErr.message); return }
      onAssigned(selected.full_name)
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Assign "${template.name}"`}
      description="Becomes the member's active plan. Their current plan, if any, is kept as an older version."
    >
      <label className="db-search" style={{ display: "block", marginBottom: 12 }}>
        <Search size={16} />
        <input
          placeholder="Search members…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </label>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0" }}>
              <Skeleton w={36} h={36} r={10} />
              <Skeleton w={160} h={13} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="db-empty">
          <span className="db-empty-icon"><Search size={18} /></span>
          <div className="db-empty-title">No members found</div>
          <div className="db-empty-text">
            {members.length === 0 ? "No active members in your gym yet." : "Try a different name."}
          </div>
        </div>
      ) : (
        <div className="db-rows" style={{ maxHeight: 360, overflowY: "auto" }}>
          {filtered.map((m) => {
            const isSelected = selected?.id === m.id
            return (
              <button
                key={m.id}
                type="button"
                className="db-filter db-tone-blue"
                aria-pressed={isSelected}
                onClick={() => setSelected(m)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 10px", borderRadius: 12, background: "none" }}
              >
                <Avatar name={m.full_name} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="db-row-title">{m.full_name}</div>
                </div>
                {isSelected && (
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      {error && <div className="ps-error" role="alert" style={{ marginTop: 12 }}>{error}</div>}

      <div style={{ display: "flex", gap: 10, marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--db-border)" }}>
        <button type="button" className="ps-btn ps-btn--secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
        <button type="button" className="ps-btn ps-btn--primary" style={{ flex: 1 }} onClick={handleAssign} disabled={!selected || saving}>
          {saving && <Loader2 size={15} className="ps-spin" />}
          {saving ? "Assigning…" : selected ? `Assign to ${selected.full_name.split(" ")[0]}` : "Assign"}
        </button>
      </div>
    </Sheet>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function DietTemplatesPage() {
  const { toast, show } = useToast()
  const [orgId, setOrgId] = useState("")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [conditionFilter, setConditionFilter] = useState<string | null>(null)
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "mine">("all")
  const [query, setQuery] = useState("")
  const [assignTarget, setAssignTarget] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function loadTemplates(org: string) {
    const { data } = await supabase
      .from("diet_plan_templates")
      .select("*")
      .or(`org_id.is.null,org_id.eq.${org}`)
      .eq("is_active", true)
      .order("name")
    setTemplates((data as Template[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) return
      setOrgId(roleData.org_id)
      await loadTemplates(roleData.org_id)
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return templates.filter((t) => {
      const matchesCondition = !conditionFilter || t.conditions.includes(conditionFilter)
      const matchesScope = scopeFilter === "all" || (scopeFilter === "global" ? t.org_id === null : t.org_id === orgId)
      const matchesQuery =
        !q ||
        t.name.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.conditions.some((c) => c.toLowerCase().includes(q))
      return matchesCondition && matchesScope && matchesQuery
    })
  }, [templates, conditionFilter, scopeFilter, query, orgId])

  const presetCount = templates.filter((t) => t.org_id === null).length
  const mineCount = templates.length - presetCount
  const coveredCount = CONDITIONS.filter((c) => templates.some((t) => t.conditions.includes(c))).length
  const hasFilters = !!conditionFilter || scopeFilter !== "all" || query.trim() !== ""

  function clearFilters() {
    setConditionFilter(null)
    setScopeFilter("all")
    setQuery("")
  }

  async function handleNewTemplate() {
    if (!orgId) return
    setCreating(true)
    try {
      const { data, error } = await supabase
        .from("diet_plan_templates")
        .insert({
          org_id: orgId,
          name: "New template",
          conditions: conditionFilter ? [conditionFilter] : [],
          duration_days: 7,
          template_json: { manual_days: [], engine_version: "manual" },
        })
        .select("id")
        .single()
      if (error || !data) { show("Couldn't create the template. Try again.", "error"); return }
      window.location.href = `/dashboard/diet/templates/${data.id}/build`
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(t: Template) {
    if (t.org_id === null) return // can't delete global presets
    if (!confirm(`Delete "${t.name}"? This cannot be undone.`)) return
    setDeleting(t.id)
    const { error } = await supabase.from("diet_plan_templates").delete().eq("id", t.id)
    if (error) { show("Couldn't delete the template", "error") }
    else { await loadTemplates(orgId); show("Template deleted") }
    setDeleting(null)
  }

  return (
    <div className="ps-page db">
      <DesignStyles />
      <BackLink href="/dashboard/diet" label="Diet plans" />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">Diet plan templates</h1>
          <p className="db-subtitle">Condition-based plans you can assign to any member in one click.</p>
        </div>
        <div className="db-header-actions">
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleNewTemplate} disabled={creating}>
            {creating ? <Loader2 size={16} className="ps-spin" /> : <Plus size={16} strokeWidth={2.4} />}
            <span>New template</span>
          </button>
        </div>
      </header>

      {/* Library summary */}
      <div className="db-card db-statbar">
        <Stat tone="blue" icon={ClipboardList} label="Templates" value={templates.length} loading={loading} />
        <Stat tone="purple" icon={BookOpen} label="Presets" value={presetCount} loading={loading} />
        <Stat tone="green" icon={User} label="Your templates" value={mineCount} loading={loading} />
        <Stat
          tone={coveredCount < CONDITIONS.length ? "amber" : "blue"}
          icon={Stethoscope}
          label="Conditions covered"
          value={coveredCount}
          note={`of ${CONDITIONS.length}`}
          loading={loading}
        />
      </div>

      <div className="db-section-head">
        <h2 className="db-section-title" style={{ margin: 0 }}>Library</h2>
        {!loading && (
          <span className="db-card-sub">
            {hasFilters ? `${filtered.length} of ${templates.length}` : `${templates.length} total`}
          </span>
        )}
      </div>

      {/* Filters: one card, search + scope on top, conditions below */}
      <div className="db-card db-toolbar">
        <label className="db-search">
          <Search size={16} />
          <input
            placeholder="Search templates…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search templates"
          />
        </label>
        <div className="db-presets" role="group" aria-label="Show templates from">
          {([
            { value: "all" as const, label: "All" },
            { value: "global" as const, label: "Presets" },
            { value: "mine" as const, label: "My templates" },
          ]).map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="db-preset"
              aria-pressed={scopeFilter === opt.value}
              onClick={() => setScopeFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="db-presets" role="group" aria-label="Filter by condition" style={{ flexBasis: "100%" }}>
          <button
            type="button"
            className="db-preset"
            aria-pressed={!conditionFilter}
            onClick={() => setConditionFilter(null)}
          >
            All conditions
          </button>
          {CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              className="db-preset"
              aria-pressed={conditionFilter === c}
              onClick={() => setConditionFilter(conditionFilter === c ? null : c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {!loading && scopeFilter !== "mine" && filtered.some((t) => t.org_id === null) && (
        <div className="db-callout db-tone-blue" style={{ marginBottom: 16 }}>
          <ClipboardList size={16} />
          <span>Presets stay as they are. Customizing one saves a copy to My templates.</span>
        </div>
      )}

      {loading ? (
        <div className="db-plans">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={250} r={20} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <span className="db-empty-icon"><Search size={18} /></span>
            <div className="db-empty-title">No templates match</div>
            <div className="db-empty-text">
              {templates.length === 0 ? "No templates yet. Create your first one." : "Try a different condition, scope or search."}
            </div>
            {hasFilters && (
              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" style={{ marginTop: 14 }} onClick={clearFilters}>
                <span>Clear filters</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="db-plans">
          {filtered.map((t, i) => {
            const mealCount = (t.template_json?.manual_days ?? []).reduce((sum, d) => sum + (d.slots?.length ?? 0), 0)
            const isGlobal = t.org_id === null
            const tone = TONES[i % TONES.length]
            const Icon = CONDITION_ICONS[t.conditions[0]] ?? ClipboardList
            return (
              <article key={t.id} className={`db-card db-plan db-tone-${tone}`}>
                <div className="db-plan-head">
                  <span className="db-chip db-chip--lg"><Icon size={18} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="db-plan-name" title={t.name}>{t.name}</div>
                    <div className="db-card-sub">{isGlobal ? "Preset" : "Your template"}</div>
                  </div>
                </div>

                <div className="db-plan-price">
                  {t.duration_days}
                  <span className="db-plan-per">
                    {t.duration_days === 1 ? "day" : "days"} · {mealCount} meal{mealCount !== 1 ? "s" : ""} set
                  </span>
                </div>

                {t.description && <p className="db-plan-desc">{t.description}</p>}

                {t.conditions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                    {t.conditions.map((c) => (
                      <span key={c} className="db-pill db-pill--muted">{c}</span>
                    ))}
                  </div>
                )}

                <div className="db-plan-foot">
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <Link
                      href={`/dashboard/diet/templates/${t.id}/build`}
                      className="ps-btn ps-btn--secondary ps-btn--sm"
                      title={isGlobal ? "Opens the builder with your own copy" : undefined}
                    >
                      <span>{isGlobal ? "Customize" : "Edit"}</span>
                    </Link>
                    {!isGlobal && (
                      <button
                        type="button"
                        className="db-icon-btn"
                        style={{ color: "var(--red)" }}
                        title="Delete template"
                        aria-label={`Delete ${t.name}`}
                        onClick={() => handleDelete(t)}
                        disabled={deleting === t.id}
                      >
                        {deleting === t.id ? <Loader2 size={14} className="ps-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className="ps-btn ps-btn--primary ps-btn--sm"
                    onClick={() => setAssignTarget(t)}
                  >
                    <UserPlus size={14} /> <span>Assign</span>
                  </button>
                </div>
              </article>
            )
          })}

          <button type="button" className="db-plan-add" onClick={handleNewTemplate} disabled={creating}>
            <span className="db-empty-icon">
              {creating ? <Loader2 size={18} className="ps-spin" /> : <Plus size={18} />}
            </span>
            <div className="db-empty-title">New template</div>
            <div className="db-empty-text">
              {conditionFilter ? `Start a ${conditionFilter} plan from scratch.` : "Build your own plan from scratch."}
            </div>
          </button>
        </div>
      )}

      {assignTarget && orgId && (
        <AssignTemplateSheet
          template={assignTarget}
          orgId={orgId}
          onClose={() => setAssignTarget(null)}
          onAssigned={(memberName) => {
            setAssignTarget(null)
            show(`Assigned to ${memberName}`)
          }}
        />
      )}

      {toast}
    </div>
  )
}

"use client"
// app/dashboard/workouts/page.tsx

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Dumbbell, Plus, Search, Loader2, Users, Copy, Trash2, Layers, Library, CalendarDays, Clock } from "lucide-react"
import { DesignStyles } from "../components/DesignSystem"
import { Skeleton } from "../components/ui"
import { GOAL_LABELS, DIFFICULTY_LABELS, type WorkoutGoal, type WorkoutProgram } from "@/lib/workout/types"
import { clonePlan } from "./components/planActions"
import { loadOrgContext, supabase } from "./components/shared"

type Tab = "mine" | "templates"

function PlanCard({ p, isGlobal, busy, onClone, onDelete }: {
  p: WorkoutProgram; isGlobal: boolean; busy: boolean
  onClone: () => void; onDelete: () => void
}) {
  return (
    <article className="db-card db-plan db-tone-purple">
      <Link href={`/dashboard/workouts/${p.id}`} style={{ textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", gap: 4 }}>
        <div className="db-plan-head" style={{ marginBottom: 10 }}>
          <span className="db-chip db-chip--lg"><Dumbbell size={18} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="db-plan-name">{p.name}</div>
            <div className="db-card-sub">
              {isGlobal ? "Built-in template" : p.is_template ? "Your template" : "Gym plan"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span className="db-pill db-pill--purple">{GOAL_LABELS[p.goal]}</span>
          <span className="db-pill db-pill--muted">{DIFFICULTY_LABELS[p.difficulty]}</span>
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 13, color: "var(--text-secondary)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CalendarDays size={14} />{p.days_per_week} days / week</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Clock size={14} />{p.duration_weeks} weeks</span>
        </div>
        {!isGlobal && (p.assigned_count ?? 0) > 0 && (
          <span className="db-plan-members"><Users size={13} /><strong>{p.assigned_count}</strong> member{p.assigned_count === 1 ? "" : "s"} on it</span>
        )}
      </Link>

      <div className="db-plan-foot">
        <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={onClone} disabled={busy}>
          {busy ? <Loader2 size={14} className="ps-spin" /> : <Copy size={14} />}
          <span>{isGlobal ? "Use template" : "Duplicate"}</span>
        </button>
        {!isGlobal && (
          <button type="button" className="db-icon-btn" aria-label={`Delete ${p.name}`} onClick={onDelete}><Trash2 size={15} /></button>
        )}
      </div>
    </article>
  )
}

export default function WorkoutsPage() {
  const router = useRouter()
  const [ctx, setCtx] = useState<{ orgId: string; userId: string } | null>(null)
  const [tab, setTab] = useState<Tab>("mine")
  const [mine, setMine] = useState<WorkoutProgram[]>([])
  const [templates, setTemplates] = useState<WorkoutProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [goal, setGoal] = useState<WorkoutGoal | "all">("all")
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const c = await loadOrgContext()
      if (!c) { setLoading(false); return }
      setCtx({ orgId: c.orgId, userId: c.userId })

      const [{ data: own }, { data: tmpl }] = await Promise.all([
        supabase.from("workout_programs").select("*").eq("org_id", c.orgId).order("created_at", { ascending: false }),
        supabase.from("workout_programs").select("*").is("org_id", null).eq("is_template", true).order("goal").order("name"),
      ])
      const list = (own as WorkoutProgram[]) ?? []
      if (list.length) {
        const { data: rows } = await supabase.from("member_workout_programs")
          .select("program_id").in("program_id", list.map((p) => p.id)).eq("status", "active")
        const counts: Record<string, number> = {}
        ;((rows as { program_id: string }[]) ?? []).forEach((r) => { counts[r.program_id] = (counts[r.program_id] ?? 0) + 1 })
        list.forEach((p) => { p.assigned_count = counts[p.id] ?? 0 })
      }
      setMine(list)
      setTemplates((tmpl as WorkoutProgram[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  async function handleClone(p: WorkoutProgram) {
    if (!ctx) return
    setBusyId(p.id)
    try {
      const id = await clonePlan(p.id, ctx.orgId, ctx.userId)
      router.push(`/dashboard/workouts/${id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't copy the plan")
      setBusyId(null)
    }
  }

  async function handleDelete(p: WorkoutProgram) {
    if ((p.assigned_count ?? 0) > 0) {
      alert(`${p.assigned_count} member${p.assigned_count === 1 ? " is" : "s are"} on "${p.name}". Move them to another plan first.`)
      return
    }
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return
    const { error } = await supabase.from("workout_programs").delete().eq("id", p.id).eq("org_id", ctx?.orgId ?? "")
    if (error) { alert("Couldn't delete: " + error.message); return }
    setMine((prev) => prev.filter((x) => x.id !== p.id))
  }

  const list = tab === "mine" ? mine : templates
  const filtered = useMemo(() => list.filter((p) =>
    (!search || p.name.toLowerCase().includes(search.toLowerCase())) && (goal === "all" || p.goal === goal)
  ), [list, search, goal])

  const onPlan = mine.reduce((s, p) => s + (p.assigned_count ?? 0), 0)
  const yourTemplates = mine.filter((p) => p.is_template).length

  return (
    <div className="ps-page db">
      <DesignStyles />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">Workouts</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{mine.length}</strong> plan{mine.length === 1 ? "" : "s"} · <strong>{onPlan}</strong> member{onPlan === 1 ? "" : "s"} training on them</>}
          </p>
        </div>
        <div className="db-header-actions">
          <Link href="/dashboard/workouts/exercises" className="ps-btn ps-btn--secondary"><Library size={16} /><span>Exercises</span></Link>
          <Link href="/dashboard/workouts/new" className="ps-btn ps-btn--primary"><Plus size={16} strokeWidth={2.4} /><span>New plan</span></Link>
        </div>
      </header>

      <div className="db-card db-statbar">
        <div className="db-stat db-tone-purple">
          <span className="db-chip"><Dumbbell size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Your plans</div><div className="db-stat-value">{loading ? "–" : mine.length}</div></div>
        </div>
        <div className="db-stat db-tone-green">
          <span className="db-chip"><Users size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Members on a plan</div><div className="db-stat-value">{loading ? "–" : onPlan}</div></div>
        </div>
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Layers size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Your templates</div><div className="db-stat-value">{loading ? "–" : yourTemplates}</div></div>
        </div>
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Library size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Built-in templates</div><div className="db-stat-value">{loading ? "–" : templates.length}</div></div>
        </div>
      </div>

      <div className="db-card db-toolbar">
        <div className="dz-tabs db-segtabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "mine"} className="dz-tab" onClick={() => setTab("mine")}>Your plans <span>{mine.length}</span></button>
          <button type="button" role="tab" aria-selected={tab === "templates"} className="dz-tab" onClick={() => setTab("templates")}>Templates <span>{templates.length}</span></button>
        </div>
        <div className="db-search">
          <Search size={16} />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plans" aria-label="Search plans" />
        </div>
        <select className="db-select" value={goal} onChange={(e) => setGoal(e.target.value as WorkoutGoal | "all")} aria-label="Goal">
          <option value="all">All goals</option>
          {(Object.keys(GOAL_LABELS) as WorkoutGoal[]).map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="db-plans">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={210} r={20} />)}</div>
      ) : filtered.length === 0 && !(tab === "mine" && mine.length === 0) ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-icon"><Search size={18} /></div>
            <div className="db-empty-title">Nothing matches</div>
            <div className="db-empty-text">Try a different search or goal.</div>
          </div>
        </div>
      ) : (
        <div className="db-plans">
          {filtered.map((p) => (
            <PlanCard key={p.id} p={p} isGlobal={!p.org_id} busy={busyId === p.id}
              onClone={() => handleClone(p)} onDelete={() => handleDelete(p)} />
          ))}
          {tab === "mine" && (
            <Link href="/dashboard/workouts/new" className="db-plan-add" style={{ textDecoration: "none" }}>
              <span className="db-empty-icon"><Plus size={18} /></span>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{mine.length ? "New plan" : "Build your first plan"}</span>
              <span style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>{mine.length ? "Start from scratch" : "Or start from a template"}</span>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

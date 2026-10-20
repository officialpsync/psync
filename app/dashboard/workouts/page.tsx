"use client"
// app/dashboard/workouts/page.tsx

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Dumbbell, Plus, Search, Loader2, Users, Copy, Trash2, ChevronRight } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Skeleton } from "../components/ui"
import { WorkoutGoal, Difficulty, GOAL_LABELS, GOAL_BADGE, DIFFICULTY_LABELS } from "@/lib/workout/types"

// ── Types ──────────────────────────────────────────────────────────────────

interface WorkoutProgram {
  id: string
  org_id: string | null
  name: string
  goal: WorkoutGoal
  difficulty: Difficulty
  days_per_week: number
  duration_weeks: number
  is_template: boolean
  notes: string | null
  status: string
  created_at: string
  updated_at: string
  assigned_count?: number
}

// ── Program card ───────────────────────────────────────────────────────────

function ProgramCard({ program, isGlobal, onClone, onDelete, cloning }: {
  program: WorkoutProgram
  isGlobal: boolean
  onClone: (p: WorkoutProgram) => void
  onDelete: (p: WorkoutProgram) => void
  cloning: boolean
}) {
  return (
    <Link
      href={`/dashboard/workouts/${program.id}`}
      className="ps-card"
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: "16px 18px", textDecoration: "none", color: "inherit", transition: "box-shadow 120ms" }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Dumbbell size={20} style={{ color: "var(--accent)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {program.name}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 3 }}>
            {program.days_per_week} days/week · {program.duration_weeks} weeks
          </div>
        </div>
        <ChevronRight size={16} style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }} />
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className={`ps-badge ${GOAL_BADGE[program.goal] ?? ""}`} style={{ fontSize: 12 }}>
          {GOAL_LABELS[program.goal]}
        </span>
        <span className="ps-badge" style={{ fontSize: 12 }}>
          {DIFFICULTY_LABELS[program.difficulty]}
        </span>
        {isGlobal && <span className="ps-badge" style={{ fontSize: 12 }}>Template</span>}
        {program.is_template && !isGlobal && <span className="ps-badge ps-badge--blue" style={{ fontSize: 12 }}>Your template</span>}
      </div>

      {typeof program.assigned_count === "number" && program.assigned_count > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-tertiary)" }}>
          <Users size={13} />
          {program.assigned_count} member{program.assigned_count !== 1 ? "s" : ""} assigned
        </div>
      )}

      {/* Actions — stop propagation so clicks don't navigate */}
      <div style={{ display: "flex", gap: 6, borderTop: "1px solid var(--separator)", paddingTop: 12, marginTop: 0 }}
        onClick={(e) => e.preventDefault()}>
        <button
          type="button"
          className="ps-btn ps-btn--secondary ps-btn--sm"
          style={{ flex: 1 }}
          onClick={(e) => { e.preventDefault(); onClone(program); }}
          disabled={cloning}
        >
          {cloning ? <Loader2 size={13} className="ps-spin" /> : <Copy size={13} />}
          {isGlobal ? "Use template" : "Duplicate"}
        </button>
        {!isGlobal && (
          <button
            type="button"
            className="ps-btn ps-btn--secondary ps-btn--sm"
            style={{ color: "var(--red)", width: 32, padding: 0, flexShrink: 0 }}
            onClick={(e) => { e.preventDefault(); onDelete(program); }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </Link>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function WorkoutsPage() {
  const router = useRouter()
  const [orgId, setOrgId] = useState("")
  const [tab, setTab] = useState<"mine" | "templates">("mine")
  const [myPlans, setMyPlans] = useState<WorkoutProgram[]>([])
  const [templates, setTemplates] = useState<WorkoutProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [goalFilter, setGoalFilter] = useState<WorkoutGoal | "all">("all")
  const [cloningId, setCloningId] = useState<string | null>(null)

  const load = useCallback(async (oid: string) => {
    // Fetch my gym's plans + their active assignment counts
    const { data: mine } = await supabase
      .from("workout_programs")
      .select("*")
      .eq("org_id", oid)
      .order("created_at", { ascending: false })

    const myList = (mine as WorkoutProgram[]) || []

    // Count active assignments per program
    if (myList.length > 0) {
      const { data: counts } = await supabase
        .from("member_workout_programs")
        .select("program_id")
        .in("program_id", myList.map((p) => p.id))
        .eq("status", "active")

      const countMap: Record<string, number> = {}
      for (const row of (counts as { program_id: string }[]) || []) {
        countMap[row.program_id] = (countMap[row.program_id] ?? 0) + 1
      }
      myList.forEach((p) => { p.assigned_count = countMap[p.id] ?? 0 })
    }

    setMyPlans(myList)

    // Global templates (org_id null)
    const { data: tmpl } = await supabase
      .from("workout_programs")
      .select("*")
      .is("org_id", null)
      .eq("is_template", true)
      .order("goal")
      .order("name")

    setTemplates((tmpl as WorkoutProgram[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData?.org_id) return
      setOrgId(roleData.org_id)
      await load(roleData.org_id)
    }
    init()
  }, [load])

  async function handleClone(program: WorkoutProgram) {
    if (!orgId) return
    setCloningId(program.id)
    try {
      // Clone the program
      const { data: newProg, error: progErr } = await supabase
        .from("workout_programs")
        .insert({
          org_id: orgId,
          name: `${program.name} (copy)`,
          goal: program.goal,
          difficulty: program.difficulty,
          days_per_week: program.days_per_week,
          duration_weeks: program.duration_weeks,
          is_template: false,
          notes: program.notes,
          status: "active",
        })
        .select("id")
        .single()

      if (progErr || !newProg) throw new Error(progErr?.message ?? "Clone failed")

      // Clone days
      const { data: days } = await supabase
        .from("workout_program_days")
        .select("*")
        .eq("program_id", program.id)
        .order("day_number")

      if (days && days.length > 0) {
        for (const day of days as { id: string; day_number: number; day_name: string; focus: string }[]) {
          const { data: newDay } = await supabase
            .from("workout_program_days")
            .insert({ program_id: newProg.id, day_number: day.day_number, day_name: day.day_name, focus: day.focus })
            .select("id")
            .single()

          if (!newDay) continue

          // Clone items for this day
          const { data: items } = await supabase
            .from("workout_program_items")
            .select("*")
            .eq("day_id", day.id)
            .order("sort_order")

          if (items && items.length > 0) {
            await supabase.from("workout_program_items").insert(
              (items as { exercise_id: string; sort_order: number; sets: number; reps: string; weight_kg: number | null; rest_sec: number; notes: string | null }[]).map((it) => ({
                day_id: newDay.id,
                exercise_id: it.exercise_id,
                sort_order: it.sort_order,
                sets: it.sets,
                reps: it.reps,
                weight_kg: it.weight_kg,
                rest_sec: it.rest_sec,
                notes: it.notes,
              }))
            )
          }
        }
      }

      router.push(`/dashboard/workouts/${newProg.id}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't clone the plan")
    } finally {
      setCloningId(null)
    }
  }

  async function handleDelete(program: WorkoutProgram) {
    if (!confirm(`Delete "${program.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from("workout_programs").delete().eq("id", program.id)
    if (error) { alert("Couldn't delete: " + error.message); return }
    setMyPlans((prev) => prev.filter((p) => p.id !== program.id))
  }

  // ── Filtering ──

  const activeList = tab === "mine" ? myPlans : templates

  const filtered = activeList.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
    const matchesGoal = goalFilter === "all" || p.goal === goalFilter
    return matchesSearch && matchesGoal
  })

  const GOALS = Object.keys(GOAL_LABELS) as WorkoutGoal[]

  // ── Stats for "mine" tab ──
  const totalPlans = myPlans.length
  const totalAssigned = myPlans.reduce((t, p) => t + (p.assigned_count ?? 0), 0)
  const yourTemplates = myPlans.filter((p) => p.is_template).length

  return (
    <div className="ps-page">
      <header className="ps-header">
        <div className="ps-header-text">
          <h1 className="ps-title">Workouts</h1>
          <p className="ps-subtitle">
            {loading ? "\u00a0" : `${totalPlans} plan${totalPlans !== 1 ? "s" : ""} · ${totalAssigned} active assignments`}
          </p>
        </div>
        <div className="ps-header-actions">
          <Link href="/dashboard/workouts/new" className="ps-btn ps-btn--primary">
            <Plus size={16} /> New plan
          </Link>
        </div>
      </header>

      {/* KPI strip — only on "mine" tab */}
      {!loading && tab === "mine" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total plans", value: totalPlans },
            { label: "Active assignments", value: totalAssigned },
            { label: "Your templates", value: yourTemplates },
          ].map((k) => (
            <div key={k.label} className="ps-card" style={{ padding: "14px 18px" }}>
              <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--separator)", marginBottom: 18 }}>
        {([
          { key: "mine" as const, label: "My plans", count: myPlans.length },
          { key: "templates" as const, label: "Global templates", count: templates.length },
        ]).map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{
              padding: "9px 16px", border: "none", borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, background: "none", cursor: "pointer", fontSize: 14, fontFamily: "inherit",
              fontWeight: tab === t.key ? 650 : 500,
              color: tab === t.key ? "var(--accent)" : "var(--text-secondary)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
            {t.label}
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: "1px 7px", borderRadius: 10,
              background: tab === t.key ? "var(--accent-dim)" : "var(--fill-2)",
              color: tab === t.key ? "var(--accent)" : "var(--text-tertiary)",
            }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <div className="ps-input-wrap" style={{ flex: 1, minWidth: 200 }}>
          <span className="ps-input-icon"><Search size={16} /></span>
          <input
            className="ps-input ps-input--icon"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plans..."
            style={{ height: 38 }}
          />
        </div>
        <select
          className="ps-input"
          value={goalFilter}
          onChange={(e) => setGoalFilter(e.target.value as WorkoutGoal | "all")}
          style={{ height: 38, fontSize: 13, width: "auto", minWidth: 150 }}
        >
          <option value="all">All goals</option>
          {GOALS.map((g) => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} w="100%" h={170} r={16} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="ps-card ps-empty">
          <div className="ps-empty-icon"><Dumbbell size={22} /></div>
          <div className="ps-empty-title">
            {tab === "mine"
              ? myPlans.length === 0 ? "No workout plans yet" : "No plans match"
              : "No templates match"}
          </div>
          <div className="ps-empty-text">
            {tab === "mine" && myPlans.length === 0
              ? "Build your first plan and assign it to members."
              : "Try a different search or goal filter."}
          </div>
          {tab === "mine" && myPlans.length === 0 && (
            <Link href="/dashboard/workouts/new" className="ps-btn ps-btn--primary">
              <Plus size={16} /> New plan
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14 }}>
          {filtered.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              isGlobal={p.org_id === null}
              onClone={handleClone}
              onDelete={handleDelete}
              cloning={cloningId === p.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

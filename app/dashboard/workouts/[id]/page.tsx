"use client"
// app/dashboard/workouts/[id]/page.tsx

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Calendar, Users, Dumbbell, Clock, Pencil } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { WorkoutProgram, WorkoutProgramDay, WorkoutProgramItem, GOAL_LABELS, GOAL_BADGE, DIFFICULTY_LABELS } from "@/lib/workout/types"
import WorkoutDayTabs from "../components/WorkoutDayTabs"
import { Skeleton } from "../../components/ui"

const supabase = createClient()

export default function WorkoutPlanViewPage() {
  const { id } = useParams<{ id: string }>()
  const [prog, setProg] = useState<WorkoutProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: p, error } = await supabase
        .from("workout_programs").select("*").eq("id", id).single()
      if (error || !p) { setNotFound(true); setLoading(false); return }

      const { data: days } = await supabase
        .from("workout_program_days").select("*").eq("program_id", id).order("day_number")

      const dayIds = (days ?? []).map((d) => d.id)
      const { data: items } = await supabase
        .from("workout_program_items")
        .select("*, exercise:workout_exercises(*)")
        .in("day_id", dayIds)
        .order("sort_order")

      const daysWithItems: WorkoutProgramDay[] = (days ?? []).map((d) => ({
        ...d,
        items: (items ?? []).filter((it) => it.day_id === d.id) as WorkoutProgramItem[],
      }))

      const { count } = await supabase
        .from("member_workout_programs")
        .select("id", { count: "exact", head: true })
        .eq("program_id", id).eq("status", "active")

      setProg({ ...p, days: daysWithItems, assigned_count: count ?? 0 })
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="ps-page ps-page--narrow">
        <Skeleton w={90} h={16} />
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton w="100%" h={120} r={16} />
          <Skeleton w="100%" h={280} r={16} />
        </div>
      </div>
    )
  }

  if (notFound || !prog) {
    return (
      <div className="ps-page ps-page--narrow">
        <Link href="/dashboard/workouts" className="ps-back">
          <ChevronLeft size={20} />Workouts
        </Link>
        <div className="ps-card">
          <div className="ps-empty">
            <div className="ps-empty-icon"><Dumbbell size={22} /></div>
            <div className="ps-empty-title">Plan not found</div>
          </div>
        </div>
      </div>
    )
  }

  const totalExercises = prog.days?.reduce((s, d) => s + (d.items?.length ?? 0), 0) ?? 0

  return (
    <div className="ps-page ps-page--narrow">
      <Link href="/dashboard/workouts" className="ps-back">
        <ChevronLeft size={20} />Workouts
      </Link>

      <div className="ps-hero">
        <div className="ps-logo ps-logo--lg"><Dumbbell size={26} /></div>
        <div className="ps-hero-text">
          <div className="ps-kicker">Workout plan</div>
          <h1 className="ps-title" style={{ fontSize: 28 }}>{prog.name}</h1>
          <div className="ps-meta" style={{ marginTop: 8 }}>
            <span className={`ps-badge ${GOAL_BADGE[prog.goal]}`}>{GOAL_LABELS[prog.goal]}</span>
            <span className="ps-badge">{DIFFICULTY_LABELS[prog.difficulty]}</span>
            {prog.is_template && <span className="ps-badge">Template</span>}
          </div>
        </div>
        {/* Only show edit for gym-owned plans — never for global templates (org_id null) */}
        {prog.org_id && (
          <div className="ps-hero-actions">
            <Link href={`/dashboard/workouts/${id}/edit`} className="ps-btn ps-btn--secondary">
              <Pencil size={15} /> Edit
            </Link>
          </div>
        )}
      </div>

      <div className="ps-card" style={{ marginBottom: 20 }}>
        <div className="ps-card-body" style={{ padding: "18px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
            {[
              { icon: <Calendar size={16} />, value: `${prog.days_per_week}`, label: "days / week" },
              { icon: <Clock size={16} />, value: `${prog.duration_weeks}`, label: "weeks" },
              { icon: <Dumbbell size={16} />, value: `${totalExercises}`, label: "exercises" },
              { icon: <Users size={16} />, value: `${prog.assigned_count}`, label: "assigned" },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                <div className="ps-tile" style={{ color: "var(--accent)", background: "var(--accent-dim)" }}>{s.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 650, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 500 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {prog.notes && (
            <div className="ps-callout" style={{ marginTop: 16 }}>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>{prog.notes}</p>
            </div>
          )}
        </div>
      </div>

      {prog.days && prog.days.length > 0 ? (
        <WorkoutDayTabs days={prog.days} />
      ) : (
        <div className="ps-card">
          <div className="ps-empty">
            <div className="ps-empty-icon"><Dumbbell size={22} /></div>
            <div className="ps-empty-title">No training days</div>
          </div>
        </div>
      )}
    </div>
  )
}

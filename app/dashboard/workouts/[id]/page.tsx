"use client"
// app/dashboard/workouts/[id]/page.tsx

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft, Dumbbell, Pencil, Copy, Loader2, StickyNote } from "lucide-react"
import { DesignStyles } from "../../components/DesignSystem"
import { Skeleton } from "../../components/ui"
import {
  GOAL_LABELS, DIFFICULTY_LABELS,
  type WorkoutProgram, type WorkoutProgramDay, type WorkoutProgramItem,
} from "@/lib/workout/types"
import WorkoutDayTabs from "../components/WorkoutDayTabs"
import { useExerciseCategories } from "../components/categories"
import { clonePlan } from "../components/planActions"
import { loadOrgContext, supabase } from "../components/shared"

export default function WorkoutPlanViewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [prog, setProg] = useState<WorkoutProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ctx, setCtx] = useState<{ orgId: string; userId: string } | null>(null)
  const [cloning, setCloning] = useState(false)
  const cats = useExerciseCategories(ctx?.orgId ?? "")

  useEffect(() => {
    async function load() {
      const c = await loadOrgContext()
      if (c) setCtx({ orgId: c.orgId, userId: c.userId })

      const { data: p, error } = await supabase.from("workout_programs").select("*").eq("id", id).single()
      if (error || !p) { setNotFound(true); setLoading(false); return }

      const { data: days } = await supabase.from("workout_program_days").select("*").eq("program_id", id).order("day_number")
      const dayIds = (days ?? []).map((d) => d.id)
      const { data: items } = dayIds.length
        ? await supabase.from("workout_program_items").select("*, exercise:workout_exercises(*)").in("day_id", dayIds).order("sort_order")
        : { data: [] }

      const withItems: WorkoutProgramDay[] = (days ?? []).map((d) => ({
        ...d, items: (items ?? []).filter((it) => it.day_id === d.id) as WorkoutProgramItem[],
      }))

      const { count } = await supabase.from("member_workout_programs")
        .select("id", { count: "exact", head: true }).eq("program_id", id).eq("status", "active")

      setProg({ ...p, days: withItems, assigned_count: count ?? 0 })
      setLoading(false)
    }
    load()
  }, [id])

  async function duplicate() {
    if (!ctx || !prog) return
    setCloning(true)
    try {
      const newId = await clonePlan(prog.id, ctx.orgId, ctx.userId)
      router.push(`/dashboard/workouts/${newId}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't copy the plan")
      setCloning(false)
    }
  }

  if (loading) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Skeleton w={90} h={16} />
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton w="100%" h={220} r={24} />
          <Skeleton w="100%" h={60} r={14} />
          <Skeleton w="100%" h={320} r={20} />
        </div>
      </div>
    )
  }

  if (notFound || !prog) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Link href="/dashboard/workouts" className="db-back"><ChevronLeft size={18} />Workouts</Link>
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-icon"><Dumbbell size={18} /></div>
            <div className="db-empty-title">Plan not found</div>
            <div className="db-empty-text">It may have been deleted.</div>
          </div>
        </div>
      </div>
    )
  }

  const isOwn = !!prog.org_id
  const totalExercises = prog.days?.reduce((s, d) => s + (d.items?.length ?? 0), 0) ?? 0

  return (
    <div className="ps-page ps-page--narrow db">
      <DesignStyles />
      <Link href="/dashboard/workouts" className="db-back"><ChevronLeft size={18} />Workouts</Link>

      <section className="db-profile">
        <div className="db-hero-glow" />
        <div className="db-profile-top">
          <span className="db-avatar-ring"><span style={{ width: 52, height: 52, borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,0.18)" }}><Dumbbell size={24} /></span></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 650, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.8 }}>
              {isOwn ? (prog.is_template ? "Your template" : "Workout plan") : "Built-in template"}
            </div>
            <h1 className="db-profile-name">{prog.name}</h1>
            <div className="db-profile-meta">
              <span>{GOAL_LABELS[prog.goal]}</span>
              <span>{DIFFICULTY_LABELS[prog.difficulty]}</span>
            </div>
          </div>
          <div className="db-profile-actions">
            {isOwn ? (
              <>
                <button type="button" className="db-glass-btn" onClick={duplicate} disabled={cloning}>
                  {cloning ? <Loader2 size={15} className="ps-spin" /> : <Copy size={15} />}<span>Duplicate</span>
                </button>
                <Link href={`/dashboard/workouts/${id}/edit`} className="db-glass-btn db-glass-btn--solid"><Pencil size={15} /><span>Edit plan</span></Link>
              </>
            ) : (
              <button type="button" className="db-glass-btn db-glass-btn--solid" onClick={duplicate} disabled={cloning}>
                {cloning ? <Loader2 size={15} className="ps-spin" /> : <Copy size={15} />}<span>Use this template</span>
              </button>
            )}
          </div>
        </div>

        <div className="db-profile-stats">
          <div className="db-pstat"><div className="db-pstat-label">Per week</div><div className="db-pstat-value">{prog.days_per_week} days</div></div>
          <div className="db-pstat"><div className="db-pstat-label">Runs for</div><div className="db-pstat-value">{prog.duration_weeks} weeks</div></div>
          <div className="db-pstat"><div className="db-pstat-label">Exercises</div><div className="db-pstat-value">{totalExercises}</div></div>
          <div className="db-pstat"><div className="db-pstat-label">Members on it</div><div className="db-pstat-value">{prog.assigned_count ?? 0}</div></div>
        </div>
      </section>

      {prog.notes && (
        <div className="db-callout db-tone-blue" style={{ marginBottom: 20 }}>
          <StickyNote size={16} />
          <span style={{ whiteSpace: "pre-wrap" }}>{prog.notes}</span>
        </div>
      )}

      {prog.days && prog.days.length > 0 ? (
        <WorkoutDayTabs days={prog.days} cats={cats} />
      ) : (
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-icon"><Dumbbell size={18} /></div>
            <div className="db-empty-title">No training days yet</div>
            {isOwn && <Link href={`/dashboard/workouts/${id}/edit`} className="ps-btn ps-btn--primary" style={{ marginTop: 12 }}>Add days</Link>}
          </div>
        </div>
      )}
    </div>
  )
}

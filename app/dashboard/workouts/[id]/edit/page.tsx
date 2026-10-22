"use client"
// app/dashboard/workouts/[id]/edit/page.tsx
// Loads the plan into a draft, then hands it to the shared PlanBuilder.

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ChevronLeft, Dumbbell } from "lucide-react"
import { DesignStyles } from "../../../components/DesignSystem"
import { Skeleton } from "../../../components/ui"
import type { WorkoutExercise, WorkoutGoal, Difficulty } from "@/lib/workout/types"
import { PlanBuilder, type PlanDraft } from "../../components/PlanBuilder"
import { loadOrgContext, supabase, uid } from "../../components/shared"

export default function EditWorkoutPlanPage() {
  const { id } = useParams<{ id: string }>()
  const [draft, setDraft] = useState<PlanDraft | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const ctx = await loadOrgContext()
      const { data: prog } = await supabase.from("workout_programs").select("*").eq("id", id).single()
      // Only this gym's plans are editable — never global templates
      if (!ctx || !prog || prog.org_id !== ctx.orgId) { setNotFound(true); return }

      const { data: dayRows } = await supabase
        .from("workout_program_days").select("*").eq("program_id", id).order("day_number")
      const dayIds = (dayRows ?? []).map((d) => d.id)
      const { data: itemRows } = dayIds.length
        ? await supabase.from("workout_program_items").select("*, exercise:workout_exercises(*)").in("day_id", dayIds).order("sort_order")
        : { data: [] }

      setDraft({
        name: prog.name,
        goal: prog.goal as WorkoutGoal,
        difficulty: prog.difficulty as Difficulty,
        daysPerWeek: prog.days_per_week,
        durationWeeks: prog.duration_weeks,
        isTemplate: prog.is_template,
        notes: prog.notes ?? "",
        days: (dayRows ?? []).map((d) => ({
          day_number: d.day_number,
          day_name: d.day_name,
          focus: d.focus ?? "",
          items: (itemRows ?? [])
            .filter((it) => it.day_id === d.id && it.exercise)
            .map((it) => ({
              uid: uid(),
              exercise: it.exercise as WorkoutExercise,
              sets: it.sets,
              reps: it.reps ?? "10",
              weight_kg: it.weight_kg != null ? String(it.weight_kg) : "",
              duration_sec: it.duration_sec != null ? String(it.duration_sec) : "60",
              rest_sec: it.rest_sec ?? 60,
              notes: it.notes ?? "",
            })),
        })),
      })
    }
    load()
  }, [id])

  if (notFound) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Link href="/dashboard/workouts" className="db-back"><ChevronLeft size={18} />Workouts</Link>
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-icon"><Dumbbell size={18} /></div>
            <div className="db-empty-title">This plan can't be edited</div>
            <div className="db-empty-text">It doesn't exist, or it's a built-in template. Duplicate it to make your own copy.</div>
          </div>
        </div>
      </div>
    )
  }

  if (!draft) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Skeleton w={90} h={16} />
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton w={220} h={34} />
          <Skeleton w="100%" h={360} r={20} />
          <Skeleton w="100%" h={280} r={20} />
        </div>
      </div>
    )
  }

  return <PlanBuilder programId={id} initial={draft} />
}

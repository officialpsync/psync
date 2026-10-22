// app/dashboard/workouts/components/planActions.ts
// Copy a plan (gym plan or global template) into this gym, including days and items.

import { supabase } from "./shared"

export async function clonePlan(programId: string, orgId: string, userId?: string): Promise<string> {
  const { data: src, error: srcErr } = await supabase.from("workout_programs").select("*").eq("id", programId).single()
  if (srcErr || !src) throw new Error("Couldn't find that plan")

  const { data: copy, error } = await supabase.from("workout_programs").insert({
    org_id: orgId,
    created_by: userId ?? null,
    name: src.org_id ? `${src.name} (copy)` : src.name,
    goal: src.goal,
    difficulty: src.difficulty,
    days_per_week: src.days_per_week,
    duration_weeks: src.duration_weeks,
    is_template: false,
    notes: src.notes,
    status: "active",
  }).select("id").single()
  if (error || !copy) throw new Error(error?.message ?? "Couldn't copy the plan")

  const { data: days } = await supabase.from("workout_program_days").select("*").eq("program_id", programId).order("day_number")
  for (const day of days ?? []) {
    const { data: newDay } = await supabase.from("workout_program_days")
      .insert({ program_id: copy.id, day_number: day.day_number, day_name: day.day_name, focus: day.focus })
      .select("id").single()
    if (!newDay) continue
    const { data: items } = await supabase.from("workout_program_items").select("*").eq("day_id", day.id).order("sort_order")
    if (items?.length) {
      await supabase.from("workout_program_items").insert(items.map((it) => ({
        day_id: newDay.id,
        exercise_id: it.exercise_id,
        sort_order: it.sort_order,
        sets: it.sets,
        reps: it.reps,
        weight_kg: it.weight_kg,
        duration_sec: it.duration_sec,
        rest_sec: it.rest_sec,
        notes: it.notes,
      })))
    }
  }
  return copy.id as string
}

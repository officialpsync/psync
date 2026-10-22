"use client"
// app/dashboard/workouts/components/PlanBuilder.tsx
// The one plan form, used by /workouts/new and /workouts/[id]/edit.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, Plus, ArrowUp, ArrowDown, Trash2, Loader2 } from "lucide-react"
import { DesignStyles } from "../../components/DesignSystem"
import {
  GOAL_LABELS, DIFFICULTY_LABELS, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS,
  type WorkoutExercise, type WorkoutGoal, type Difficulty,
} from "@/lib/workout/types"
import { useExerciseCategories } from "./categories"
import { ExercisePicker } from "./ExercisePicker"
import { ExerciseSheet } from "./ExerciseSheet"
import { ExerciseThumb, loadOrgContext, supabase, uid } from "./shared"

// ── Draft model ──────────────────────────────────────────────────────────────

export interface ItemDraft {
  uid: string; exercise: WorkoutExercise
  sets: number; reps: string; weight_kg: string; duration_sec: string; rest_sec: number; notes: string
}
export interface DayDraft { day_number: number; day_name: string; focus: string; items: ItemDraft[] }
export interface PlanDraft {
  name: string; goal: WorkoutGoal; difficulty: Difficulty
  daysPerWeek: number; durationWeeks: number; isTemplate: boolean; notes: string
  days: DayDraft[]
}

const DAY_NAMES: Record<number, string[]> = {
  2: ["Upper Body", "Lower Body"],
  3: ["Push Day", "Pull Day", "Leg Day"],
  4: ["Push Day", "Pull Day", "Leg Day", "Upper Body"],
  5: ["Push Day", "Pull Day", "Leg Day", "Upper Body", "Core & Cardio"],
  6: ["Push Day", "Pull Day", "Leg Day", "Push Day 2", "Pull Day 2", "Leg Day 2"],
}

function defaultDays(n: number): DayDraft[] {
  return Array.from({ length: n }, (_, i) => ({
    day_number: i + 1, day_name: DAY_NAMES[n]?.[i] ?? `Day ${i + 1}`, focus: "", items: [],
  }))
}

export function emptyPlan(): PlanDraft {
  return {
    name: "", goal: "general_fitness", difficulty: "beginner",
    daysPerWeek: 3, durationWeeks: 4, isTemplate: false, notes: "", days: defaultDays(3),
  }
}

/** Timed exercises store duration_sec instead of reps. */
export function isTimed(ex: Pick<WorkoutExercise, "muscle_group" | "movement_type">) {
  return ex.muscle_group === "cardio" || ex.movement_type === "cardio"
}

// ── Persistence ──────────────────────────────────────────────────────────────

async function persistPlan(draft: PlanDraft, orgId: string, userId: string, programId?: string): Promise<string> {
  const meta = {
    name: draft.name.trim(), goal: draft.goal, difficulty: draft.difficulty,
    days_per_week: draft.daysPerWeek, duration_weeks: draft.durationWeeks,
    is_template: draft.isTemplate, notes: draft.notes.trim() || null,
  }

  let id = programId
  if (id) {
    const { error } = await supabase.from("workout_programs")
      .update({ ...meta, updated_at: new Date().toISOString() })
      .eq("id", id).eq("org_id", orgId) // never touches global templates
    if (error) throw error
    await supabase.from("workout_program_days").delete().eq("program_id", id) // cascade removes items
  } else {
    const { data, error } = await supabase.from("workout_programs")
      .insert({ ...meta, org_id: orgId, created_by: userId }).select("id").single()
    if (error || !data) throw error ?? new Error("Couldn't create the plan")
    id = data.id as string
  }

  for (const day of draft.days) {
    const { data: dayRow, error: dayErr } = await supabase.from("workout_program_days")
      .insert({ program_id: id, day_number: day.day_number, day_name: day.day_name.trim() || `Day ${day.day_number}`, focus: day.focus.trim() || null })
      .select("id").single()
    if (dayErr || !dayRow) throw dayErr ?? new Error("Couldn't save a training day")
    if (!day.items.length) continue
    const { error: itemErr } = await supabase.from("workout_program_items").insert(
      day.items.map((it, idx) => ({
        day_id: dayRow.id,
        exercise_id: it.exercise.id,
        sort_order: idx,
        sets: it.sets,
        reps: it.reps || "10",
        weight_kg: it.weight_kg ? parseFloat(it.weight_kg) : null,
        duration_sec: isTimed(it.exercise) ? parseInt(it.duration_sec) || null : null,
        rest_sec: it.rest_sec,
        notes: it.notes.trim() || null,
      }))
    )
    if (itemErr) throw itemErr
  }
  return id!
}

// ── Exercise row ─────────────────────────────────────────────────────────────

function ExerciseRow({ item, index, count, onChange, onMove, onRemove }: {
  item: ItemDraft; index: number; count: number
  onChange: (patch: Partial<ItemDraft>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const [noteOpen, setNoteOpen] = useState(!!item.notes)
  const ex = item.exercise
  const timed = isTimed(ex)

  return (
    <div className="db-exrow">
      <div className="db-exrow-top">
        <span className="db-exrow-num">{index + 1}</span>
        <ExerciseThumb ex={ex} />
        <div className="db-row-text">
          <div className="db-row-title">{ex.name}</div>
          <div className="db-row-sub">{MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group} · {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}</div>
        </div>
        <div className="db-exrow-tools">
          <button type="button" className="db-icon-btn" aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
          <button type="button" className="db-icon-btn" aria-label="Move down" disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
          <button type="button" className="db-icon-btn" aria-label={`Remove ${ex.name}`} onClick={onRemove}><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="db-exrow-fields">
        <div className="db-mini">
          <label htmlFor={`sets-${item.uid}`}>Sets</label>
          <input id={`sets-${item.uid}`} inputMode="numeric" value={item.sets}
            onChange={(e) => onChange({ sets: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })} />
        </div>
        {timed ? (
          <div className="db-mini">
            <label htmlFor={`time-${item.uid}`}>Seconds</label>
            <input id={`time-${item.uid}`} inputMode="numeric" value={item.duration_sec} placeholder="60"
              onChange={(e) => onChange({ duration_sec: e.target.value.replace(/\D/g, "") })} />
          </div>
        ) : (
          <div className="db-mini">
            <label htmlFor={`reps-${item.uid}`}>Reps</label>
            <input id={`reps-${item.uid}`} value={item.reps} placeholder="10" maxLength={12}
              onChange={(e) => onChange({ reps: e.target.value })} />
          </div>
        )}
        <div className="db-mini">
          <label htmlFor={`kg-${item.uid}`}>Kg</label>
          <input id={`kg-${item.uid}`} inputMode="decimal" value={item.weight_kg} placeholder={ex.equipment === "bodyweight" ? "BW" : "—"}
            disabled={timed} onChange={(e) => onChange({ weight_kg: e.target.value.replace(/[^\d.]/g, "") })} />
        </div>
        <div className="db-mini">
          <label htmlFor={`rest-${item.uid}`}>Rest s</label>
          <input id={`rest-${item.uid}`} inputMode="numeric" value={item.rest_sec}
            onChange={(e) => onChange({ rest_sec: Math.min(600, parseInt(e.target.value.replace(/\D/g, "")) || 0) })} />
        </div>
      </div>

      {noteOpen ? (
        <div className="db-exrow-note">
          <input className="db-note-input" value={item.notes} placeholder="Coaching note, e.g. slow 3-second lowering"
            onChange={(e) => onChange({ notes: e.target.value })} />
        </div>
      ) : (
        <button type="button" className="db-note-toggle" onClick={() => setNoteOpen(true)}>+ Add coaching note</button>
      )}
    </div>
  )
}

// ── Builder ──────────────────────────────────────────────────────────────────

export function PlanBuilder({ programId, initial }: { programId?: string; initial?: PlanDraft }) {
  const router = useRouter()
  const isEdit = !!programId
  const [plan, setPlan] = useState<PlanDraft>(initial ?? emptyPlan())
  const [activeDay, setActiveDay] = useState(0)
  const [ctx, setCtx] = useState<{ orgId: string; accessToken: string; userId: string } | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const cats = useExerciseCategories(ctx?.orgId ?? "")

  useEffect(() => {
    async function init() {
      const c = await loadOrgContext()
      if (c) setCtx(c)
      const { data } = await supabase.from("workout_exercises").select("*").order("name")
      if (data) setExercises(data as WorkoutExercise[])
    }
    init()
  }, [])

  const set = <K extends keyof PlanDraft>(k: K, v: PlanDraft[K]) => setPlan((p) => ({ ...p, [k]: v }))

  /** Changing days per week keeps existing days; only asks before dropping days that have exercises. */
  function changeDays(n: number) {
    const dropping = plan.days.slice(n).filter((d) => d.items.length > 0)
    if (dropping.length && !confirm(`Remove ${dropping.map((d) => d.day_name).join(", ")} and their exercises?`)) return
    setPlan((p) => {
      const kept = p.days.slice(0, n)
      const extra = Array.from({ length: Math.max(0, n - kept.length) }, (_, i) => {
        const num = kept.length + i + 1
        return { day_number: num, day_name: DAY_NAMES[n]?.[num - 1] ?? `Day ${num}`, focus: "", items: [] }
      })
      return { ...p, daysPerWeek: n, days: [...kept, ...extra] }
    })
    setActiveDay((d) => Math.min(d, n - 1))
  }

  function updateDay(patch: Partial<DayDraft>) {
    setPlan((p) => ({ ...p, days: p.days.map((d, i) => (i === activeDay ? { ...d, ...patch } : d)) }))
  }

  function updateItems(fn: (items: ItemDraft[]) => ItemDraft[]) {
    setPlan((p) => ({ ...p, days: p.days.map((d, i) => (i === activeDay ? { ...d, items: fn(d.items) } : d)) }))
  }

  function addExercise(ex: WorkoutExercise) {
    updateItems((items) => [...items, {
      uid: uid(), exercise: ex, sets: 3, reps: "10", weight_kg: "", duration_sec: "60", rest_sec: 60, notes: "",
    }])
    setPickerOpen(false)
  }

  const stats = useMemo(() => {
    const items = plan.days.flatMap((d) => d.items)
    return { exercises: items.length, sets: items.reduce((s, it) => s + it.sets, 0) }
  }, [plan.days])

  async function save() {
    if (!plan.name.trim()) { setError("Give the plan a name"); window.scrollTo({ top: 0, behavior: "smooth" }); return }
    if (!ctx) { setError("Still loading your gym. Try again in a moment."); return }
    setSaving(true); setError("")
    try {
      const id = await persistPlan(plan, ctx.orgId, ctx.userId, programId)
      router.push(`/dashboard/workouts/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the plan")
      setSaving(false)
    }
  }

  const day = plan.days[activeDay]
  const backHref = isEdit ? `/dashboard/workouts/${programId}` : "/dashboard/workouts"

  return (
    <div className="ps-page ps-page--narrow db">
      <DesignStyles />

      <Link href={backHref} className="db-back"><ChevronLeft size={18} />{isEdit ? "Plan" : "Workouts"}</Link>

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">{isEdit ? "Edit plan" : "New plan"}</h1>
          <p className="db-subtitle">
            {stats.exercises > 0
              ? <><strong>{stats.exercises}</strong> exercises · <strong>{stats.sets}</strong> sets a week</>
              : "Set the basics, then add exercises to each training day."}
          </p>
        </div>
      </header>

      <section className="db-card db-pad">
        <div className="db-card-head">
          <div><h2 className="db-card-title">Plan details</h2><div className="db-card-sub">What it's for and how long it runs</div></div>
        </div>

        <div className="db-fieldset">
          <label className="db-fieldset-label" htmlFor="plan-name">Plan name</label>
          <input id="plan-name" className="ps-input" value={plan.name} maxLength={80}
            onChange={(e) => set("name", e.target.value)} placeholder="e.g. Beginner Push Pull Legs"
            style={error && !plan.name.trim() ? { borderColor: "var(--red)" } : undefined} />
        </div>

        <div className="db-fieldset">
          <span className="db-fieldset-label">Goal</span>
          <div className="db-presets" role="radiogroup" aria-label="Goal">
            {(Object.keys(GOAL_LABELS) as WorkoutGoal[]).map((g) => (
              <button key={g} type="button" className="db-preset" role="radio" aria-checked={plan.goal === g} aria-pressed={plan.goal === g} onClick={() => set("goal", g)}>{GOAL_LABELS[g]}</button>
            ))}
          </div>
        </div>

        <div className="db-fieldset">
          <span className="db-fieldset-label">Difficulty</span>
          <div className="db-presets" role="radiogroup" aria-label="Difficulty">
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <button key={d} type="button" className="db-preset" role="radio" aria-checked={plan.difficulty === d} aria-pressed={plan.difficulty === d} onClick={() => set("difficulty", d)}>{DIFFICULTY_LABELS[d]}</button>
            ))}
          </div>
        </div>

        <div className="db-fieldset db-field-row">
          <div>
            <span className="db-fieldset-label">Days per week</span>
            <div className="db-presets" role="radiogroup" aria-label="Days per week">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" className="db-preset" role="radio" aria-checked={plan.daysPerWeek === n} aria-pressed={plan.daysPerWeek === n} onClick={() => changeDays(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <span className="db-fieldset-label">Duration</span>
            <div className="db-presets" role="radiogroup" aria-label="Duration in weeks">
              {[2, 4, 6, 8, 12, 16].map((n) => (
                <button key={n} type="button" className="db-preset" role="radio" aria-checked={plan.durationWeeks === n} aria-pressed={plan.durationWeeks === n} onClick={() => set("durationWeeks", n)}>{n} wk</button>
              ))}
            </div>
          </div>
        </div>

        <div className="db-fieldset">
          <label className="db-fieldset-label" htmlFor="plan-notes">Trainer notes <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>(optional)</span></label>
          <textarea id="plan-notes" className="ps-input" rows={3} value={plan.notes}
            onChange={(e) => set("notes", e.target.value)} placeholder="Warm-up, progression, anything members should know" />
        </div>

        <div className="db-fieldset db-toggles">
          <label className="db-toggle">
            <div>
              <div className="db-toggle-title">Save as a reusable template</div>
              <div className="db-toggle-sub">Shows under your templates so you can start new plans from it</div>
            </div>
            <input type="checkbox" className="db-switch" checked={plan.isTemplate} onChange={(e) => set("isTemplate", e.target.checked)} />
          </label>
        </div>
      </section>

      <section className="db-card db-pad" style={{ marginTop: 16 }}>
        <div className="db-card-head">
          <div><h2 className="db-card-title">Training days</h2><div className="db-card-sub">Pick a day, then add its exercises in order</div></div>
        </div>

        <div className="db-day-tabs" role="group" aria-label="Choose a day">
          {plan.days.map((d, i) => (
            <button key={i} type="button" className="db-day-tab" aria-pressed={i === activeDay} onClick={() => setActiveDay(i)}>
              <span className="db-day-tab-name">Day {d.day_number}{d.items.length ? ` · ${d.items.length}` : ""}</span>
              <span className="db-day-tab-label">{d.day_name || `Day ${d.day_number}`}</span>
            </button>
          ))}
        </div>

        {day && (
          <>
            <div className="db-field-row" style={{ marginBottom: 18 }}>
              <div className="ps-field">
                <label className="ps-label" htmlFor="day-name">Day name</label>
                <input id="day-name" className="ps-input" value={day.day_name} maxLength={40} onChange={(e) => updateDay({ day_name: e.target.value })} />
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="day-focus">Focus</label>
                <input id="day-focus" className="ps-input" value={day.focus} maxLength={60} onChange={(e) => updateDay({ focus: e.target.value })} placeholder="e.g. Chest & Triceps" />
              </div>
            </div>

            {day.items.length > 0 && (
              <div className="db-exlist">
                {day.items.map((it, idx) => (
                  <ExerciseRow
                    key={it.uid} item={it} index={idx} count={day.items.length}
                    onChange={(patch) => updateItems((items) => items.map((x) => (x.uid === it.uid ? { ...x, ...patch } : x)))}
                    onMove={(dir) => updateItems((items) => {
                      const next = [...items]; const j = idx + dir
                      ;[next[idx], next[j]] = [next[j], next[idx]]
                      return next
                    })}
                    onRemove={() => updateItems((items) => items.filter((x) => x.uid !== it.uid))}
                  />
                ))}
              </div>
            )}

            <button type="button" className="db-addrow" onClick={() => setPickerOpen(true)}>
              <Plus size={17} strokeWidth={2.4} /> {day.items.length ? "Add another exercise" : `Add the first exercise to ${day.day_name || "this day"}`}
            </button>
          </>
        )}
      </section>

      {error && <div className="ps-error" style={{ marginTop: 16 }}>{error}</div>}

      <div className="ps-actionbar">
        <Link href={backHref} className="ps-btn ps-btn--secondary">Cancel</Link>
        <button type="button" className="ps-btn ps-btn--primary" onClick={save} disabled={saving}>
          {saving && <Loader2 size={15} className="ps-spin" />}
          <span>{saving ? "Saving…" : isEdit ? "Save changes" : "Create plan"}</span>
        </button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        exercises={exercises}
        cats={cats}
        onSelect={addExercise}
        onCreateNew={() => { setPickerOpen(false); setCreateOpen(true) }}
      />
      <ExerciseSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="create"
        orgId={ctx?.orgId ?? ""}
        accessToken={ctx?.accessToken ?? ""}
        cats={cats}
        onSaved={(ex) => { setExercises((p) => [...p, ex]); addExercise(ex); setCreateOpen(false) }}
      />
    </div>
  )
}

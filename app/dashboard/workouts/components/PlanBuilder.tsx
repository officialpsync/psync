"use client"
// app/dashboard/workouts/components/PlanBuilder.tsx
// The one plan form, used by /workouts/new and /workouts/[id]/edit.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, Plus, ArrowUp, ArrowDown, Trash2, Loader2, Dumbbell, Check, Timer, Layers, Activity, ClipboardList, CalendarDays } from "lucide-react"
import { WorkoutStyles, GOAL_THEME, goalTheme, DifficultyBars, MUSCLE_COLOR } from "./WorkoutTheme"
import type { MuscleGroup } from "@/lib/workout/types"
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
    const secs = (it: ItemDraft) => it.sets * (isTimed(it.exercise) ? parseInt(it.duration_sec) || 60 : 40) + Math.max(0, it.sets - 1) * it.rest_sec + 60
    const perDay = plan.days.map((d) => ({ sets: d.items.reduce((s, it) => s + it.sets, 0), mins: Math.round(d.items.reduce((s, it) => s + secs(it), 0) / 60) }))
    const muscles: Record<string, number> = {}
    items.forEach((it) => { muscles[it.exercise.muscle_group] = (muscles[it.exercise.muscle_group] ?? 0) + it.sets })
    const trained = perDay.filter((x) => x.sets > 0)
    return {
      exercises: items.length, sets: items.reduce((s, it) => s + it.sets, 0), perDay,
      avgMins: trained.length ? Math.round(trained.reduce((s, x) => s + x.mins, 0) / trained.length) : 0,
      split: Object.entries(muscles).sort((a, b) => b[1] - a[1]) as [MuscleGroup, number][],
    }
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

  const gt = goalTheme(plan.goal)
  const maxSplit = stats.split[0]?.[1] ?? 1

  return (
    <div className="ps-page db wk pb" style={{ ["--g1" as string]: gt.from, ["--g2" as string]: gt.to, ["--gs" as string]: gt.soft, ["--gt" as string]: gt.text } as React.CSSProperties}>
      <DesignStyles />
      <WorkoutStyles />
      <style>{PB_CSS}</style>

      <div className="wk-crumbs">
        <Link href="/dashboard/workouts"><ChevronLeft size={16} /> Workouts</Link>
        {isEdit && <><span>/</span><Link href={backHref}>{plan.name || "Plan"}</Link></>}
        <span>/</span><b>{isEdit ? "Edit" : "New plan"}</b>
      </div>

      <header className="wk-head">
        <div className="wk-title">
          <span className="wk-title-icon" style={{ background: `linear-gradient(135deg, ${gt.from}, ${gt.to})` }}><Dumbbell size={21} /></span>
          <div>
            <h1>{isEdit ? "Edit plan" : "New plan"}</h1>
            <p>{stats.exercises > 0 ? `${stats.exercises} exercises · ${stats.sets} sets a week` : "Set the basics, then add exercises to each training day."}</p>
          </div>
        </div>
      </header>

      {error && <div className="pb-error">{error}</div>}

      <div className="pb-layout">
        <div className="pb-main">
          <section className="pb-card">
            <div className="pb-card-h"><span className="pb-card-icon"><ClipboardList size={17} /></span><div><h2>Plan details</h2><p>What it&apos;s for and how long it runs</p></div></div>

            <div className="db-fieldset">
              <label className="db-fieldset-label" htmlFor="plan-name">Plan name</label>
              <input id="plan-name" className="ps-input" value={plan.name} maxLength={80}
                onChange={(e) => set("name", e.target.value)} placeholder="e.g. Beginner Push Pull Legs"
                style={error && !plan.name.trim() ? { borderColor: "var(--red)" } : undefined} />
            </div>

            <div className="db-fieldset">
              <span className="db-fieldset-label">Goal</span>
              <div className="pb-goals" role="radiogroup" aria-label="Goal">
                {(Object.keys(GOAL_LABELS) as WorkoutGoal[]).map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={plan.goal === g} className="pb-goal" onClick={() => set("goal", g)}
                    style={{ ["--c1" as string]: GOAL_THEME[g].from, ["--c2" as string]: GOAL_THEME[g].to } as React.CSSProperties}>
                    <i />{GOAL_LABELS[g]}
                  </button>
                ))}
              </div>
            </div>

            <div className="db-fieldset db-field-row">
              <div>
                <span className="db-fieldset-label">Difficulty</span>
                <div className="pb-seg" role="radiogroup" aria-label="Difficulty">
                  {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                    <button key={d} type="button" role="radio" aria-checked={plan.difficulty === d} onClick={() => set("difficulty", d)}><DifficultyBars d={d} />{DIFFICULTY_LABELS[d]}</button>
                  ))}
                </div>
              </div>
              <div>
                <span className="db-fieldset-label">Days per week</span>
                <div className="pb-seg" role="radiogroup" aria-label="Days per week">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={plan.daysPerWeek === n} onClick={() => changeDays(n)}>{n}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="db-fieldset">
              <span className="db-fieldset-label">Duration</span>
              <div className="pb-seg" role="radiogroup" aria-label="Duration in weeks">
                {[2, 4, 6, 8, 12, 16].map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={plan.durationWeeks === n} onClick={() => set("durationWeeks", n)}>{n} wk</button>
                ))}
              </div>
            </div>

            <div className="db-fieldset">
              <label className="db-fieldset-label" htmlFor="plan-notes">Trainer notes <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>(optional)</span></label>
              <textarea id="plan-notes" className="ps-input" rows={3} value={plan.notes}
                onChange={(e) => set("notes", e.target.value)} placeholder="Warm-up, progression, anything members should know" />
            </div>

            <div className="db-fieldset db-toggles" style={{ marginBottom: 0 }}>
              <label className="db-toggle">
                <div>
                  <div className="db-toggle-title">Save as a reusable template</div>
                  <div className="db-toggle-sub">Shows under your templates so you can start new plans from it</div>
                </div>
                <input type="checkbox" className="db-switch" checked={plan.isTemplate} onChange={(e) => set("isTemplate", e.target.checked)} />
              </label>
            </div>
          </section>

          <section className="pb-card">
            <div className="pb-card-h"><span className="pb-card-icon"><CalendarDays size={17} /></span><div><h2>Training days</h2><p>Pick a day, then add its exercises in order</p></div></div>

            <div className="pb-days" role="group" aria-label="Choose a day">
              {plan.days.map((d, i) => (
                <button key={i} type="button" className="pb-day" aria-pressed={i === activeDay} onClick={() => setActiveDay(i)}>
                  <small>Day {d.day_number}</small>
                  <b>{d.day_name || `Day ${d.day_number}`}</b>
                  <span>{d.items.length ? `${d.items.length} ex · ~${stats.perDay[i]?.mins ?? 0}m` : "Empty"}</span>
                  {d.items.length > 0 && <i className="pb-day-done"><Check size={11} strokeWidth={3} /></i>}
                </button>
              ))}
            </div>

            {day && (
              <>
                <div className="db-field-row" style={{ marginBottom: 16 }}>
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

                <button type="button" className="pb-add" onClick={() => setPickerOpen(true)}>
                  <span><Plus size={17} strokeWidth={2.4} /></span>
                  {day.items.length ? "Add another exercise" : `Add the first exercise to ${day.day_name || "this day"}`}
                </button>
              </>
            )}
          </section>
        </div>

        <aside className="pb-side">
          <div className="pb-preview">
            <span className="pb-preview-kind">{plan.isTemplate ? "Template" : "Workout plan"} preview</span>
            <strong>{plan.name.trim() || "Untitled plan"}</strong>
            <div className="pb-preview-tags">
              <span>{GOAL_LABELS[plan.goal]}</span>
              <span><DifficultyBars d={plan.difficulty} />{DIFFICULTY_LABELS[plan.difficulty]}</span>
            </div>
            <div className="pb-preview-stats">
              <div><Layers size={14} /><b>{stats.exercises}</b><small>exercises</small></div>
              <div><Activity size={14} /><b>{stats.sets}</b><small>sets / wk</small></div>
              <div><Timer size={14} /><b>{stats.avgMins ? `~${stats.avgMins}` : "—"}</b><small>min / session</small></div>
            </div>
          </div>

          <section className="pb-card pb-side-card">
            <h3><Activity size={15} /> Muscle split</h3>
            {stats.split.length === 0 ? <p className="pb-muted">Add exercises to see which muscles this plan works.</p> : (
              <div className="pb-split">
                {stats.split.map(([m, n]) => (
                  <div key={m}>
                    <span><i style={{ background: MUSCLE_COLOR[m] }} />{MUSCLE_GROUP_LABELS[m]}</span>
                    <span className="pb-track"><i style={{ width: `${(n / maxSplit) * 100}%`, background: MUSCLE_COLOR[m] }} /></span>
                    <b>{n}</b>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="pb-side-actions">
            <Link href={backHref} className="ps-btn ps-btn--secondary">Cancel</Link>
            <button type="button" className="ps-btn ps-btn--primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={15} className="ps-spin" /> : <Check size={15} />}
              <span>{saving ? "Saving…" : isEdit ? "Save changes" : "Create plan"}</span>
            </button>
          </div>
        </aside>
      </div>

      <div className="pb-savebar">
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

// NOTE: no backticks inside this CSS.
const PB_CSS = `
.pb-error { margin-bottom: 14px; padding: 11px 14px; border-radius: 12px; background: #fff0f1; color: #a3001a; border: 1px solid #ffd0d6; font-size: 13.5px; font-weight: 550; }
.pb-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.pb-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.pb-card { position: relative; background: #fff; border: 1px solid var(--wk-line); border-radius: 18px; padding: 18px 20px; overflow: hidden; }
.pb-main .pb-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, var(--g1), var(--g2)); }
.pb-card-h { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 16px; }
.pb-card-h h2 { margin: 0; font-size: 16.5px; font-weight: 700; letter-spacing: -0.015em; }
.pb-card-h p { margin: 2px 0 0; font-size: 13px; color: var(--text-tertiary); }
.pb-card-icon { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2)); }

.pb-goals { display: flex; flex-wrap: wrap; gap: 8px; }
.pb-goal { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; border-radius: 19px; border: 1.5px solid var(--wk-line); background: #fff; font: inherit; font-size: 13.5px; font-weight: 620; color: var(--text-secondary); cursor: pointer; transition: all 140ms; }
.pb-goal i { width: 10px; height: 10px; border-radius: 50%; background: linear-gradient(135deg, var(--c1), var(--c2)); }
.pb-goal:hover { border-color: var(--c1); color: var(--text-primary); }
.pb-goal[aria-checked="true"] { background: linear-gradient(135deg, var(--c1), var(--c2)); border-color: transparent; color: #fff; box-shadow: 0 6px 14px -8px var(--c2); }
.pb-goal[aria-checked="true"] i { background: #fff; }
.pb-seg { display: flex; flex-wrap: wrap; gap: 3px; padding: 3px; border-radius: 11px; background: #f2f3f6; width: fit-content; max-width: 100%; }
.pb-seg button { display: inline-flex; align-items: center; gap: 6px; height: 32px; min-width: 38px; justify-content: center; padding: 0 12px; border: none; border-radius: 8px; background: none; font: inherit; font-size: 13.5px; font-weight: 620; color: var(--text-secondary); cursor: pointer; }
.pb-seg button[aria-checked="true"] { background: #fff; color: var(--gt); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
.pb-seg .wk-diff { color: var(--gt); }

.pb-days { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; margin-bottom: 16px; }
.pb-day { position: relative; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 10px 12px; border-radius: 13px; border: 1.5px solid var(--wk-line); background: #fff; font: inherit; text-align: left; cursor: pointer; min-width: 0; }
.pb-day small { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-tertiary); }
.pb-day b { font-size: 14px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-day span { font-size: 12px; color: var(--text-tertiary); }
.pb-day-done { position: absolute; top: 9px; right: 9px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: #e6f7ee; color: #1f8a3b; }
.pb-day[aria-pressed="true"] { border-color: transparent; background: linear-gradient(135deg, var(--g1), var(--g2)); color: #fff; box-shadow: 0 8px 18px -10px var(--g2); }
.pb-day[aria-pressed="true"] small, .pb-day[aria-pressed="true"] span { color: rgba(255,255,255,0.85); }
.pb-day[aria-pressed="true"] .pb-day-done { background: rgba(255,255,255,0.25); color: #fff; }
.pb-add { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 54px; margin-top: 10px; border: 1.5px dashed #c9cfda; border-radius: 14px; background: var(--gs); font: inherit; font-size: 14px; font-weight: 650; color: var(--gt); cursor: pointer; transition: border-color 150ms; }
.pb-add:hover { border-color: var(--g1); }
.pb-add span { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2)); }

.pb-side { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 12px; }
.pb-preview { border-radius: 18px; padding: 16px; color: #fff; background: radial-gradient(260px 120px at 90% -20%, rgba(255,255,255,0.3), transparent 70%), linear-gradient(135deg, var(--g1), var(--g2)); box-shadow: 0 16px 34px -20px var(--g2); display: flex; flex-direction: column; gap: 8px; }
.pb-preview-kind { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
.pb-preview strong { font-size: 19px; font-weight: 750; letter-spacing: -0.02em; line-height: 1.2; word-break: break-word; }
.pb-preview-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.pb-preview-tags span { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 650; background: rgba(255,255,255,0.2); }
.pb-preview-tags .wk-diff { color: #fff; }
.pb-preview-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
.pb-preview-stats div { display: flex; flex-direction: column; gap: 1px; padding: 9px 10px; border-radius: 11px; background: rgba(255,255,255,0.15); }
.pb-preview-stats b { font-size: 17px; font-weight: 750; }
.pb-preview-stats small { font-size: 11px; opacity: 0.85; }
.pb-side-card { padding: 14px 16px; }
.pb-side-card h3 { margin: 0 0 10px; display: flex; align-items: center; gap: 7px; font-size: 14.5px; font-weight: 700; }
.pb-side-card h3 svg { color: var(--gt); }
.pb-muted { margin: 0; font-size: 12.5px; color: var(--text-tertiary); }
.pb-split { display: flex; flex-direction: column; gap: 7px; }
.pb-split > div { display: grid; grid-template-columns: 92px minmax(0, 1fr) 24px; align-items: center; gap: 8px; font-size: 13px; }
.pb-split > div > span:first-child { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.pb-split > div > span:first-child i { width: 8px; height: 8px; border-radius: 50%; }
.pb-track { height: 6px; border-radius: 4px; background: #f0f1f4; overflow: hidden; }
.pb-track i { display: block; height: 100%; border-radius: 4px; }
.pb-split b { text-align: right; font-variant-numeric: tabular-nums; }
.pb-side-actions { display: flex; gap: 8px; }
.pb-side-actions .ps-btn { flex: 1; height: 44px; justify-content: center; border-radius: 12px; }
.pb-savebar { display: none; }

@media (max-width: 1100px) {
  .pb-layout { grid-template-columns: minmax(0, 1fr); }
  .pb-side { position: static; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .pb-side-actions { display: none; }
  .ps-page.pb { padding-bottom: 96px !important; }
  .pb-savebar { position: fixed; left: var(--sb-w, 72px); right: 0; bottom: 0; z-index: 40; display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; background: rgba(255,255,255,0.92); border-top: 1px solid var(--wk-line); backdrop-filter: blur(16px) saturate(180%); }
  .pb-savebar .ps-btn { height: 42px; border-radius: 12px; }
}
@media (max-width: 899px) {
  .pb-savebar { left: 0; bottom: calc(var(--tabbar-h, 0px) + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 760px) {
  .ps-page.pb { padding-bottom: calc(150px + env(safe-area-inset-bottom, 0px)) !important; }
  .pb-card { padding: 16px 14px; border-radius: 16px; }
  .pb-days { display: flex; overflow-x: auto; scrollbar-width: none; }
  .pb-day { flex: 0 0 132px; }
  .pb-savebar .ps-btn { flex: 1; height: 46px; justify-content: center; }
  .pb .ps-input { font-size: 16px; }
}
/* Exercise rows in the builder */
.ps-page.pb { overflow-x: hidden; }
.pb-layout > * { min-width: 0; }
.pb .db-exlist { display: flex; flex-direction: column; gap: 10px; }
.pb .db-exrow { border: 1px solid var(--wk-line); border-radius: 14px; background: #fff; padding: 12px; display: flex; flex-direction: column; gap: 10px; transition: border-color 150ms, box-shadow 150ms; }
.pb .db-exrow:hover { border-color: #c9d6f2; box-shadow: 0 6px 16px -12px rgba(15,23,42,0.35); }
.pb .db-exrow-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.pb .db-exrow-num { width: 26px; height: 26px; flex-shrink: 0; border-radius: 8px; display: grid; place-items: center; font-size: 12.5px; font-weight: 750; color: #fff; background: linear-gradient(135deg, var(--g1), var(--g2)); }
.pb .db-row-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.pb .db-row-title { font-size: 14.5px; font-weight: 650; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb .db-row-sub { font-size: 12.5px; color: var(--text-tertiary); }
.pb .db-exrow-tools { display: flex; gap: 2px; flex-shrink: 0; }
.pb .db-icon-btn { width: 32px; height: 32px; border: none; border-radius: 9px; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; }
.pb .db-icon-btn:hover:not(:disabled) { background: var(--wk-soft); color: var(--text-primary); }
.pb .db-icon-btn:disabled { opacity: 0.3; cursor: default; }
.pb .db-exrow-tools .db-icon-btn:last-child:hover { background: #ffecef; color: #c4001a; }
.pb .db-exrow-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 110px)); gap: 8px; padding-left: 38px; }
.pb .db-mini { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pb .db-mini label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
.pb .db-mini input { width: 100%; height: 36px; padding: 0 10px; border: 1px solid var(--wk-line); border-radius: 9px; background: #fff; font: inherit; font-size: 14.5px; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; outline: none; }
.pb .db-mini input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.pb .db-mini input:disabled { background: var(--wk-soft); color: var(--text-tertiary); }
.pb .db-exrow-note { padding-left: 38px; }
.pb .db-note-input { width: 100%; height: 34px; padding: 0 10px; border: 1px dashed #cfd5df; border-radius: 9px; background: #fafbfc; font: inherit; font-size: 13px; color: var(--text-primary); outline: none; }
.pb .db-note-input:focus { border-style: solid; border-color: var(--accent); background: #fff; }
.pb .db-note-toggle { align-self: flex-start; margin-left: 38px; border: none; background: none; padding: 0; font: inherit; font-size: 12.5px; font-weight: 650; color: var(--accent); cursor: pointer; }
@media (max-width: 760px) {
  .pb .db-exrow-fields { grid-template-columns: repeat(4, minmax(0, 1fr)); padding-left: 0; gap: 6px; }
  .pb .db-exrow-note { padding-left: 0; }
  .pb .db-note-toggle { margin-left: 0; }
  .pb .db-exrow-top { flex-wrap: wrap; }
  .pb .db-mini input { font-size: 16px; padding: 0 8px; }
}
`

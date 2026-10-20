"use client"
// app/dashboard/workouts/[id]/edit/page.tsx

import { useCallback, useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { ChevronLeft, Loader2, Plus, Search, Trash2, X, GripVertical, ChevronDown, ChevronUp } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { WorkoutExercise, WorkoutGoal, Difficulty, MuscleGroup, GOAL_LABELS, DIFFICULTY_LABELS, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from "@/lib/workout/types"
import { Skeleton } from "../../../components/ui"

interface DayDraft { id?: string; day_number: number; day_name: string; focus: string; items: ItemDraft[] }
interface ItemDraft { uid: string; id?: string; exercise: WorkoutExercise; sets: number; reps: string; weight_kg: string; duration_sec: string; rest_sec: number; notes: string }

function uid() { return Math.random().toString(36).slice(2) }

// ---- Exercise Picker (identical to builder) ----
function ExercisePicker({ exercises, onSelect, onClose }: {
  exercises: WorkoutExercise[]; onSelect: (ex: WorkoutExercise) => void; onClose: () => void
}) {
  const [q, setQ] = useState("")
  const [group, setGroup] = useState<MuscleGroup | "all">("all")
  const groups: (MuscleGroup | "all")[] = ["all","chest","back","shoulders","arms","legs","core","cardio","full_body"]
  const filtered = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(q.toLowerCase()) && (group === "all" || ex.muscle_group === group)
  )
  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "500px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div className="ps-sheet-title">Add exercise</div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
          <div className="ps-input-wrap" style={{ marginTop: 14 }}>
            <span className="ps-input-icon"><Search size={16} /></span>
            <input autoFocus className="ps-input ps-input--icon" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises..." />
          </div>
          <div className="ps-chips" style={{ marginTop: 10, paddingBottom: 2 }}>
            {groups.map((g) => (
              <button key={g} type="button" className="ps-chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
                {g === "all" ? "All" : MUSCLE_GROUP_LABELS[g as MuscleGroup]}
              </button>
            ))}
          </div>
        </div>
        <div className="ps-sheet-body" style={{ padding: "8px 16px 20px" }}>
          {filtered.length === 0 && <div className="ps-empty" style={{ padding: "32px 16px" }}><div className="ps-empty-title">No exercises found</div></div>}
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map((ex) => (
              <li key={ex.id}>
                <button type="button" onClick={() => onSelect(ex)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: 12, border: "none", background: "none", cursor: "pointer", textAlign: "left", gap: 12 }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--fill)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="ps-cell-title" style={{ fontSize: 14 }}>{ex.name}</div>
                    <div className="ps-cell-sub">{MUSCLE_GROUP_LABELS[ex.muscle_group]} &middot; {EQUIPMENT_LABELS[ex.equipment]}</div>
                  </div>
                  <Plus size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ---- Exercise item row (identical to builder) ----
function ItemRow({ item, onUpdate, onRemove }: {
  item: ItemDraft; onUpdate: (u: ItemDraft) => void; onRemove: () => void
}) {
  const [open, setOpen] = useState(false)
  const isCardio = item.exercise.muscle_group === "cardio"
  const isBodyweight = item.exercise.equipment === "bodyweight"
  const inputStyle: React.CSSProperties = { height: 32, padding: "0 6px", textAlign: "center", border: "1px solid var(--separator)", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--fill)", color: "var(--text-primary)", fontFamily: "inherit" }

  return (
    <div className="ps-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <GripVertical size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0, cursor: "grab" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ps-cell-title" style={{ fontSize: 13.5 }}>{item.exercise.name}</div>
          <div className="ps-cell-sub">{MUSCLE_GROUP_LABELS[item.exercise.muscle_group]} &middot; {EQUIPMENT_LABELS[item.exercise.equipment]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <input type="number" min={1} max={20} value={item.sets} onChange={(e) => onUpdate({ ...item, sets: parseInt(e.target.value) || 1 })} aria-label="Sets" style={{ ...inputStyle, width: 42 }} />
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>×</span>
          <input type="text" value={isCardio ? item.duration_sec : item.reps} onChange={(e) => isCardio ? onUpdate({ ...item, duration_sec: e.target.value }) : onUpdate({ ...item, reps: e.target.value })} placeholder={isCardio ? "sec" : "reps"} style={{ ...inputStyle, width: 54 }} />
          {!isBodyweight && !isCardio && (
            <>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>@</span>
              <input type="text" value={item.weight_kg} onChange={(e) => onUpdate({ ...item, weight_kg: e.target.value })} placeholder="kg" style={{ ...inputStyle, width: 54 }} />
            </>
          )}
        </div>
        <button type="button" className="ps-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setOpen((v) => !v)}>{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
        <button type="button" className="ps-icon-btn ps-icon-btn--danger" style={{ width: 28, height: 28 }} onClick={onRemove}><Trash2 size={13} /></button>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 14px 14px", borderTop: "1px solid var(--separator)" }}>
          <div className="ps-field">
            <label className="ps-label">Rest (seconds)</label>
            <input type="number" min={0} max={600} value={item.rest_sec} onChange={(e) => onUpdate({ ...item, rest_sec: parseInt(e.target.value) || 60 })} className="ps-input" style={{ height: 38 }} />
          </div>
          <div className="ps-field">
            <label className="ps-label">Coaching note</label>
            <input type="text" value={item.notes} onChange={(e) => onUpdate({ ...item, notes: e.target.value })} placeholder="e.g. slow eccentric" className="ps-input" style={{ height: 38 }} />
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Main edit page ----
export default function EditWorkoutPlanPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [loadingPage, setLoadingPage] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [orgId, setOrgId] = useState("")

  // Plan metadata
  const [name, setName] = useState("")
  const [goal, setGoal] = useState<WorkoutGoal>("general_fitness")
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner")
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [durationWeeks, setDurationWeeks] = useState(4)
  const [isTemplate, setIsTemplate] = useState(false)
  const [notes, setNotes] = useState("")

  // Days + exercises
  const [days, setDays] = useState<DayDraft[]>([])
  const [activeDay, setActiveDay] = useState(0)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      // Load exercise library
      const { data: exData } = await supabase.from("workout_exercises").select("*").order("muscle_group").order("name")
      if (exData) setExercises(exData as WorkoutExercise[])

      // Verify ownership — only edit plans belonging to this org
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) return
      setOrgId(roleData.org_id)

      // Load plan
      const { data: prog, error: progErr } = await supabase
        .from("workout_programs").select("*").eq("id", id).single()
      if (progErr || !prog) { setNotFound(true); setLoadingPage(false); return }

      // Safety check — only edit plans owned by this org (not global templates)
      if (prog.org_id !== roleData.org_id) { setNotFound(true); setLoadingPage(false); return }

      // Prefill metadata
      setName(prog.name)
      setGoal(prog.goal as WorkoutGoal)
      setDifficulty(prog.difficulty as Difficulty)
      setDaysPerWeek(prog.days_per_week)
      setDurationWeeks(prog.duration_weeks)
      setIsTemplate(prog.is_template)
      setNotes(prog.notes ?? "")

      // Load days + items
      const { data: dayRows } = await supabase
        .from("workout_program_days").select("*").eq("program_id", id).order("day_number")
      const dayIds = (dayRows ?? []).map((d) => d.id)
      const { data: itemRows } = await supabase
        .from("workout_program_items")
        .select("*, exercise:workout_exercises(*)")
        .in("day_id", dayIds)
        .order("sort_order")

      const draftDays: DayDraft[] = (dayRows ?? []).map((d) => ({
        id: d.id,
        day_number: d.day_number,
        day_name: d.day_name,
        focus: d.focus ?? "",
        items: (itemRows ?? [])
          .filter((it) => it.day_id === d.id)
          .map((it) => ({
            uid: uid(),
            id: it.id,
            exercise: it.exercise as WorkoutExercise,
            sets: it.sets,
            reps: it.reps ?? "10",
            weight_kg: it.weight_kg != null ? String(it.weight_kg) : "",
            duration_sec: it.duration_sec != null ? String(it.duration_sec) : "60",
            rest_sec: it.rest_sec,
            notes: it.notes ?? "",
          })),
      }))

      setDays(draftDays)
      setLoadingPage(false)
    }
    load()
  }, [id])

  const updateDay = useCallback((i: number, patch: Partial<DayDraft>) => {
    setDays((prev) => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  }, [])

  const addExercise = useCallback((ex: WorkoutExercise) => {
    setDays((prev) => prev.map((d, i) =>
      i === activeDay ? { ...d, items: [...d.items, { uid: uid(), exercise: ex, sets: 3, reps: "10", weight_kg: "", duration_sec: "60", rest_sec: 60, notes: "" }] } : d
    ))
    setPickerOpen(false)
  }, [activeDay])

  const updateItem = useCallback((dayIdx: number, itemUid: string, updated: ItemDraft) => {
    setDays((prev) => prev.map((d, i) =>
      i === dayIdx ? { ...d, items: d.items.map((it) => it.uid === itemUid ? updated : it) } : d
    ))
  }, [])

  const removeItem = useCallback((dayIdx: number, itemUid: string) => {
    setDays((prev) => prev.map((d, i) =>
      i === dayIdx ? { ...d, items: d.items.filter((it) => it.uid !== itemUid) } : d
    ))
  }, [])

  async function handleSave() {
    if (!name.trim()) { setError("Plan name is required"); return }
    setSaving(true); setError("")
    try {
      // 1. Update program metadata
      const { error: progErr } = await supabase
        .from("workout_programs")
        .update({ name: name.trim(), goal, difficulty, days_per_week: daysPerWeek, duration_weeks: durationWeeks, is_template: isTemplate, notes: notes.trim() || null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", orgId) // extra safety — never update global templates
      if (progErr) throw progErr

      // 2. Delete all existing days + items (cascade will remove items)
      await supabase.from("workout_program_days").delete().eq("program_id", id)

      // 3. Re-insert days + items fresh
      for (const day of days) {
        const { data: dayRow, error: dayErr } = await supabase
          .from("workout_program_days")
          .insert({ program_id: id, day_number: day.day_number, day_name: day.day_name, focus: day.focus || null })
          .select("id").single()
        if (dayErr || !dayRow) throw dayErr ?? new Error("Day insert failed")

        if (day.items.length > 0) {
          const { error: itemErr } = await supabase.from("workout_program_items").insert(
            day.items.map((it, idx) => ({
              day_id: dayRow.id,
              exercise_id: it.exercise.id,
              sort_order: idx,
              sets: it.sets,
              reps: it.reps,
              weight_kg: it.weight_kg ? parseFloat(it.weight_kg) : null,
              duration_sec: it.exercise.muscle_group === "cardio" ? parseInt(it.duration_sec) || null : null,
              rest_sec: it.rest_sec,
              notes: it.notes || null,
            }))
          )
          if (itemErr) throw itemErr
        }
      }

      router.push(`/dashboard/workouts/${id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const currentDay = days[activeDay]

  if (loadingPage) {
    return (
      <div className="ps-page ps-page--narrow">
        <Skeleton w={90} h={16} />
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton w="100%" h={320} r={16} />
          <Skeleton w="100%" h={280} r={16} />
        </div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="ps-page ps-page--narrow">
        <button type="button" className="ps-back" onClick={() => router.back()}><ChevronLeft size={20} />Workouts</button>
        <div className="ps-card">
          <div className="ps-empty">
            <div className="ps-empty-title">Plan not found</div>
            <div className="ps-empty-text">This plan doesn&apos;t exist or you don&apos;t have permission to edit it.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-page ps-page--narrow">
      <button type="button" className="ps-back" onClick={() => router.push(`/dashboard/workouts/${id}`)}>
        <ChevronLeft size={20} />Back to plan
      </button>

      <header className="ps-header" style={{ marginBottom: 24 }}>
        <div className="ps-header-text">
          <h1 className="ps-title">Edit plan</h1>
          <p className="ps-subtitle">Changes only affect your gym&apos;s copy</p>
        </div>
      </header>

      <div className="ps-stack">
        {/* Plan details */}
        <div className="ps-card">
          <div className="ps-card-body">
            <div className="ps-card-title" style={{ marginBottom: 16 }}>Plan details</div>
            <div className="ps-form-grid">
              <div className="ps-field ps-span-2">
                <label className="ps-label" htmlFor="plan-name">Plan name</label>
                <input id="plan-name" className="ps-input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-goal">Goal</label>
                <select id="plan-goal" className="ps-input" value={goal} onChange={(e) => setGoal(e.target.value as WorkoutGoal)}>
                  {(Object.entries(GOAL_LABELS) as [WorkoutGoal, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-diff">Difficulty</label>
                <select id="plan-diff" className="ps-input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  {(Object.entries(DIFFICULTY_LABELS) as [Difficulty, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-dpw">Days per week</label>
                <select id="plan-dpw" className="ps-input" value={daysPerWeek} onChange={(e) => setDaysPerWeek(parseInt(e.target.value))}>
                  {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} days</option>)}
                </select>
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-dur">Duration</label>
                <select id="plan-dur" className="ps-input" value={durationWeeks} onChange={(e) => setDurationWeeks(parseInt(e.target.value))}>
                  {[2,4,6,8,12,16].map((n) => <option key={n} value={n}>{n} weeks</option>)}
                </select>
              </div>
              <div className="ps-field ps-span-2">
                <label className="ps-label" htmlFor="plan-notes">Trainer notes</label>
                <textarea id="plan-notes" className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." rows={3} />
              </div>
              <div className="ps-field ps-span-2">
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <button type="button" className="ps-switch" role="switch" aria-checked={isTemplate} onClick={() => setIsTemplate((v) => !v)} />
                  <span style={{ fontSize: 14, color: "var(--text-primary)" }}>Save as reusable template</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Day builder */}
        {days.length > 0 && (
          <div className="ps-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "20px 24px 0" }}>
              <div className="ps-card-title" style={{ marginBottom: 14 }}>Training days</div>
              <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", margin: "0 -24px", padding: "0 24px", borderBottom: "1px solid var(--separator)" }}>
                {days.map((day, i) => (
                  <button key={i} type="button" onClick={() => setActiveDay(i)}
                    style={{ padding: "8px 16px", border: "none", borderBottom: activeDay === i ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, background: "none", cursor: "pointer", fontSize: 13, fontWeight: activeDay === i ? 600 : 500, color: activeDay === i ? "var(--accent)" : "var(--text-secondary)", whiteSpace: "nowrap", fontFamily: "inherit" }}
                  >
                    Day {day.day_number}
                    {day.items.length > 0 && <span className={activeDay === i ? "ps-badge ps-badge--blue" : "ps-badge"} style={{ height: 18, fontSize: 11, marginLeft: 6, padding: "0 6px" }}>{day.items.length}</span>}
                  </button>
                ))}
              </div>
            </div>
            {currentDay && (
              <div style={{ padding: "18px 24px 24px" }}>
                <div className="ps-form-grid" style={{ marginBottom: 16 }}>
                  <div className="ps-field">
                    <label className="ps-label">Day name</label>
                    <input className="ps-input" value={currentDay.day_name} onChange={(e) => updateDay(activeDay, { day_name: e.target.value })} style={{ height: 38 }} />
                  </div>
                  <div className="ps-field">
                    <label className="ps-label">Muscle focus</label>
                    <input className="ps-input" value={currentDay.focus} onChange={(e) => updateDay(activeDay, { focus: e.target.value })} placeholder="e.g. Chest & Triceps" style={{ height: 38 }} />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {currentDay.items.length === 0 && <p style={{ fontSize: 13.5, color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0", margin: 0 }}>No exercises yet</p>}
                  {currentDay.items.map((item) => (
                    <ItemRow key={item.uid} item={item} onUpdate={(u) => updateItem(activeDay, item.uid, u)} onRemove={() => removeItem(activeDay, item.uid)} />
                  ))}
                </div>
                <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setPickerOpen(true)}><Plus size={16} /> Add exercise</button>
              </div>
            )}
          </div>
        )}

        {error && <div className="ps-error">{error}</div>}

        <div className="ps-actionbar">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={() => router.push(`/dashboard/workouts/${id}`)}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {pickerOpen && <ExercisePicker exercises={exercises} onSelect={addExercise} onClose={() => setPickerOpen(false)} />}
    </div>
  )
}

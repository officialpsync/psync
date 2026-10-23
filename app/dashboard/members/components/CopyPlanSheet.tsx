"use client"
// app/dashboard/members/components/CopyPlanSheet.tsx
// Copy a diet plan or workout program from one member to another, with an optional edit before copying.
// Flow: 1 Type → 2 Plan → 3 Member → 4 Review & edit.
//
// Diet: the copy is a new member_diet_plans row. Edits (targets, start date, notes, and meals for
// manually built plans) only affect the copy. AI-generated plans keep their meals; targets and notes are editable.
// Workout: member workouts link to a shared workout_programs row. Without edits the new member is linked to
// the same program. With edits, a private program is created for them, so the shared plan is never changed.

import { useEffect, useMemo, useState } from "react"
import {
  Salad, Dumbbell, ChevronRight, ChevronLeft, Check, Search, Trash2, ArrowUp, ArrowDown, Plus, X,
  Loader2, ArrowRight, Flame, Pencil,
} from "lucide-react"
import { createClient } from "@/lib/supabase"
import { Sheet } from "../../components/Sheet"
import { Avatar, Skeleton, formatDate } from "../../components/ui"
import type { WorkoutExercise } from "@/lib/workout/types"

const supabase = createClient()

export type CopyMember = { id: string; full_name: string; phone: string | null; hasDiet: boolean; hasWorkout: boolean }
export type Kind = "diet" | "workout"

// ── Diet types (match diet/[id]/build) ───────────────────────────────────────
type MealSlot = {
  id: string; meal_type: string; recipe_id: string; recipe_name: string; calories: number
  protein_g: number; carbs_g: number; fat_g: number; serving_size_description: string | null; notes: string
}
type DietRow = {
  id: string; status: string | null; start_date: string | null; created_at: string; version_number: number | null
  plan_mode: string | null; plan_days: number | null; target_kcal: number | null; target_protein_g: number | null
  target_carbs_g: number | null; target_fat_g: number | null; plan_json: Record<string, unknown> | null; coach_notes: string | null
}
type Recipe = { recipe_id: string; recipe_name: string; meal_type: string[] | null; calories_kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; serving_size_description: string | null }
type DietDraft = {
  planId: string; kcal: string; protein: string; carbs: string; fat: string; startDate: string; notes: string
  days: { slots: MealSlot[] }[] | null
  generated: boolean   // meals came from the AI engine (weekly_plan), not the manual builder
  mealsEdited: boolean // once true, the copy is saved as a manual plan
}

const MEAL_TYPES = ["early_morning", "breakfast", "lunch", "snack", "dinner", "post_workout"]
const MEAL_LABELS: Record<string, string> = {
  early_morning: "Early morning", breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", dinner: "Dinner", post_workout: "Post workout",
}
const MODE_LABELS: Record<string, string> = { recipe: "Standard", protein_heavy: "Protein heavy", ingredient: "Simple foods", manual: "Built by hand" }

// ── Workout types ────────────────────────────────────────────────────────────
type WorkoutRow = { id: string; program_id: string; status: string | null; valid_from: string | null; created_at: string; name: string; meta: string }
type ItemDraft = { uid: string; exercise: WorkoutExercise; sets: number; reps: string; weight_kg: string; duration_sec: string; rest_sec: number; notes: string }
type DayDraft = { day_number: number; day_name: string; focus: string; items: ItemDraft[] }
type Program = { id: string; name: string; goal: string; difficulty: string; days_per_week: number; duration_weeks: number; notes: string | null }

const uid = () => Math.random().toString(36).slice(2)
const isTimed = (ex: Pick<WorkoutExercise, "muscle_group" | "movement_type">) => ex.muscle_group === "cardio" || ex.movement_type === "cardio"
const today = () => new Date().toISOString().slice(0, 10)
const r = (n: number | null | undefined) => Math.round(Number(n) || 0)

function dietTitle(d: DietRow) {
  const parts: string[] = []
  if (d.target_kcal) parts.push(`${r(d.target_kcal).toLocaleString("en-IN")} kcal`)
  if (d.plan_days) parts.push(`${d.plan_days}-day`)
  return parts.length ? `${parts.join(" · ")} plan` : "Diet plan"
}
/** Manual plans: plan_json.manual_days. Generated plans: flatten plan_json.weekly_plan the same way
 *  diet/[id] "Switch to manual editing" does (without any unsaved swaps). */
function mealDays(d: DietRow | undefined): { days: { slots: MealSlot[] }[]; generated: boolean } | null {
  const pj = d?.plan_json as { manual_days?: { slots: MealSlot[] }[]; weekly_plan?: Record<string, { meals?: GenMeal[] }> } | null
  if (Array.isArray(pj?.manual_days)) return { days: pj!.manual_days!, generated: false }
  const wp = pj?.weekly_plan
  if (!wp || Array.isArray(wp)) return null
  const days = Object.entries(wp)
    .sort((a, b) => parseInt(a[0].replace("day_", "")) - parseInt(b[0].replace("day_", "")))
    .map(([, day]) => ({
      slots: (day?.meals ?? []).map((m) => ({
        id: crypto.randomUUID(), meal_type: m.meal_type, recipe_id: m.recipe_id ?? "",
        recipe_name: m.meal_label || cleanName(m.recipe_name) || "Meal",
        calories: m.calories ?? 0, protein_g: m.protein_g ?? 0, carbs_g: m.carbs_g ?? 0, fat_g: m.fat_g ?? 0,
        serving_size_description: m.serving_size_description ?? m.portion ?? null, notes: "",
      })),
    }))
  while (d?.plan_days && days.length < d.plan_days) days.push({ slots: [] })
  return { days: d?.plan_days ? days.slice(0, d.plan_days) : days, generated: true }
}
type GenMeal = {
  meal_type: string; recipe_id?: string | null; recipe_name?: string | null; meal_label?: string; portion?: string
  serving_size_description?: string | null; calories: number; protein_g: number; carbs_g: number; fat_g: number
}
function cleanName(n?: string | null) { return (n ?? "").replace(/_/g, " ").replace(/\s+/g, " ").trim() }
function mealLabel(t: string) { return MEAL_LABELS[t] ?? t.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) }

// ─────────────────────────────────────────────────────────────────────────────

export function CopyPlanSheet({ source, members, orgId, onClose, onDone, onError, initialKind, initialPlanId }: {
  source: CopyMember | null; members: CopyMember[]; orgId: string
  /** Open straight on a chosen plan (member profile). initialPlanId is a member_diet_plans id or a member_workout_programs id. */
  initialKind?: Kind; initialPlanId?: string
  onClose: () => void; onDone: (msg: string) => void; onError: (msg: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [kind, setKind] = useState<Kind | null>(null)
  const [loading, setLoading] = useState(false)
  const [diets, setDiets] = useState<DietRow[]>([])
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([])
  const [planId, setPlanId] = useState<string | null>(null)
  const [target, setTarget] = useState<CopyMember | null>(null)
  const [q, setQ] = useState("")
  const [copying, setCopying] = useState(false)

  // Step 4 drafts
  const [dietDraft, setDietDraft] = useState<DietDraft | null>(null)
  const [program, setProgram] = useState<Program | null>(null)
  const [wDays, setWDays] = useState<DayDraft[] | null>(null)
  const [wName, setWName] = useState("")
  const [wDirty, setWDirty] = useState(false)
  const [editLoading, setEditLoading] = useState(false)

  useEffect(() => {
    if (!source) return
    let cancel = false
    setStep(1); setKind(null); setPlanId(null); setTarget(null); setQ(""); setLoading(true)
    setDietDraft(null); setProgram(null); setWDays(null); setWDirty(false)
    ;(async () => {
      const [d, w] = await Promise.all([
        supabase.from("member_diet_plans")
          .select("id, status, start_date, created_at, version_number, plan_mode, plan_days, target_kcal, target_protein_g, target_carbs_g, target_fat_g, plan_json, coach_notes")
          .eq("member_id", source.id).order("created_at", { ascending: false }),
        supabase.from("member_workout_programs").select("id, program_id, status, valid_from, created_at").eq("member_id", source.id).order("created_at", { ascending: false }),
      ])
      const wRows = (w.data ?? []) as { id: string; program_id: string; status: string | null; valid_from: string | null; created_at: string }[]
      const ids = [...new Set(wRows.map((x) => x.program_id).filter(Boolean))]
      const progs: Record<string, { name: string; days_per_week: number; duration_weeks: number; difficulty: string }> = {}
      if (ids.length) {
        const { data } = await supabase.from("workout_programs").select("id, name, days_per_week, duration_weeks, difficulty").in("id", ids)
        ;(data ?? []).forEach((p) => { progs[p.id] = p })
      }
      if (cancel) return
      setDiets((d.data ?? []) as DietRow[])
      setWorkouts(wRows.map((x) => {
        const p = progs[x.program_id]
        return { ...x, name: p?.name ?? "Workout program", meta: p ? `${p.days_per_week} days/week · ${p.duration_weeks} weeks · ${p.difficulty}` : "" }
      }))
      if (initialKind && initialPlanId) {
        const list = initialKind === "diet" ? (d.data ?? []) : wRows
        if (list.some((x) => (x as { id: string }).id === initialPlanId)) {
          setKind(initialKind); setPlanId(initialPlanId); setStep(3)
        }
      }
      setLoading(false)
    })()
    return () => { cancel = true }
  }, [source, initialKind, initialPlanId])

  const first = source?.full_name.split(" ")[0] ?? ""
  const diet = diets.find((x) => x.id === planId)
  const workout = workouts.find((x) => x.id === planId)
  const planLabel = kind === "diet" ? (diet ? dietTitle(diet) : "") : workout?.name ?? ""
  const tq = q.trim().toLowerCase()
  const targets = members.filter((m) => m.id !== source?.id && (!tq || m.full_name.toLowerCase().includes(tq) || (m.phone ?? "").includes(tq)))
  const replaces = !!target && ((kind === "diet" && target.hasDiet) || (kind === "workout" && target.hasWorkout))

  function chooseKind(k: Kind) {
    setKind(k)
    const list = k === "diet" ? diets : workouts
    setPlanId((list.find((x) => x.status === "active") ?? list[0])?.id ?? null)
    setStep(2)
  }

  // Load the editable copy when entering step 4 (only once per chosen plan).
  async function toReview(force = false) {
    setStep(4)
    if (kind === "diet" && diet && dietDraft?.planId !== diet.id) {
      setDietDraft({
        planId: diet.id,
        kcal: String(r(diet.target_kcal) || ""), protein: String(r(diet.target_protein_g) || ""),
        carbs: String(r(diet.target_carbs_g) || ""), fat: String(r(diet.target_fat_g) || ""),
        startDate: today(), notes: diet.coach_notes ?? "",
        days: mealDays(diet)?.days.map((day) => ({ slots: day.slots.map((s) => ({ ...s })) })) ?? null,
        generated: mealDays(diet)?.generated ?? false, mealsEdited: false,
      })
    }
    if (kind === "workout" && workout && (force || program?.id !== workout.program_id)) {
      setEditLoading(true)
      const { data: p } = await supabase.from("workout_programs").select("id, name, goal, difficulty, days_per_week, duration_weeks, notes").eq("id", workout.program_id).single()
      const { data: dayRows } = await supabase.from("workout_program_days").select("*").eq("program_id", workout.program_id).order("day_number")
      const dayIds = (dayRows ?? []).map((d) => d.id)
      const { data: itemRows } = dayIds.length
        ? await supabase.from("workout_program_items").select("*, exercise:workout_exercises(*)").in("day_id", dayIds).order("sort_order")
        : { data: [] as Record<string, unknown>[] }
      setProgram(p as Program)
      setWName(p ? `${p.name} · ${target?.full_name.split(" ")[0] ?? ""}`.trim() : "")
      setWDays((dayRows ?? []).map((d) => ({
        day_number: d.day_number, day_name: d.day_name, focus: d.focus ?? "",
        items: ((itemRows ?? []) as Record<string, unknown>[]).filter((it) => it.day_id === d.id && it.exercise).map((it) => ({
          uid: uid(), exercise: it.exercise as WorkoutExercise, sets: it.sets as number, reps: (it.reps as string) ?? "10",
          weight_kg: it.weight_kg != null ? String(it.weight_kg) : "", duration_sec: it.duration_sec != null ? String(it.duration_sec) : "60",
          rest_sec: (it.rest_sec as number) ?? 60, notes: (it.notes as string) ?? "",
        })),
      })))
      setWDirty(false)
      setEditLoading(false)
    }
  }

  async function copy() {
    if (!source || !target || !kind) return
    setCopying(true)
    try {
      if (kind === "diet" && diet && dietDraft) {
        // Untouched AI plans copy as they are (keeps swaps, alternates and clinical checks).
        // Edited AI plans and all manual plans are saved in the manual builder's format.
        const asManual = !!dietDraft.days && (!dietDraft.generated || dietDraft.mealsEdited)
        const planJson = asManual ? { manual_days: dietDraft.days, engine_version: "manual" } : diet.plan_json
        const planMode = asManual && dietDraft.generated ? "manual" : diet.plan_mode
        await supabase.from("member_diet_plans").update({ status: "superseded" }).eq("member_id", target.id).eq("status", "active")
        const { error } = await supabase.from("member_diet_plans").insert({
          org_id: orgId, member_id: target.id, status: "active", version_number: 1,
          plan_mode: planMode, plan_days: diet.plan_days, start_date: dietDraft.startDate || today(),
          target_kcal: parseInt(dietDraft.kcal) || diet.target_kcal,
          target_protein_g: parseFloat(dietDraft.protein) || diet.target_protein_g,
          target_carbs_g: parseFloat(dietDraft.carbs) || diet.target_carbs_g,
          target_fat_g: parseFloat(dietDraft.fat) || diet.target_fat_g,
          plan_json: planJson, coach_notes: dietDraft.notes.trim() || null,
        })
        if (error) throw error
      } else if (kind === "workout" && workout) {
        let programId = workout.program_id
        if (wDirty && wDays && program) programId = await createProgram(program, wName, wDays, orgId)
        await supabase.from("member_workout_programs").update({ status: "cancelled" }).eq("member_id", target.id).eq("status", "active")
        const { error } = await supabase.from("member_workout_programs").insert({
          org_id: orgId, member_id: target.id, program_id: programId, valid_from: today(), status: "active",
        })
        if (error) throw error
      }
      onDone(`${kind === "diet" ? "Diet plan" : "Workout"} copied to ${target.full_name}`)
    } catch (e) {
      console.error(e)
      onError(e instanceof Error ? e.message : "Couldn't copy. Please try again.")
    } finally {
      setCopying(false)
    }
  }

  const STEPS = ["Type", "Plan", "Member", "Review & edit"]
  const desc: Record<number, string> = {
    1: `What do you want to copy from ${first}?`,
    2: `Pick which of ${first}'s ${kind === "diet" ? "diet plans" : "workout programs"} to copy.`,
    3: `Who should get this ${kind === "diet" ? "diet plan" : "workout"}?`,
    4: `Check the plan and adjust it for ${target?.full_name.split(" ")[0] ?? "them"} before copying. ${first}'s plan isn't changed.`,
  }

  const footer = (
    <div className="cp-foot">
      {step === 1
        ? <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
        : <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={copying}><ChevronLeft size={15} /> Back</button>}
      <span className="cp-foot-hint">{step === 4 && kind === "workout" && wDirty ? "Edits make a private copy for this member" : ""}</span>
      {step === 2 && <button type="button" className="ps-btn ps-btn--primary" disabled={!planId} onClick={() => setStep(3)}>Next <ChevronRight size={15} /></button>}
      {step === 3 && <button type="button" className="ps-btn ps-btn--primary" disabled={!target} onClick={() => toReview()}>Review <ChevronRight size={15} /></button>}
      {step === 4 && (
        <button type="button" className="ps-btn ps-btn--primary" disabled={copying || editLoading} onClick={copy}>
          {copying ? <Loader2 size={15} className="ps-spin" /> : <Check size={15} />} Copy to {target?.full_name.split(" ")[0]}
        </button>
      )}
    </div>
  )

  return (
    <Sheet open={!!source} onClose={onClose} width={step === 4 ? 960 : 760} title="Copy plan" description={source ? desc[step] : undefined} footer={footer}>
      <style>{CSS}</style>
      <div className="cp">
        <ol className="cp-steps">
          {STEPS.map((l, i) => (
            <li key={l} data-state={step === i + 1 ? "now" : step > i + 1 ? "done" : "todo"}>
              <i>{step > i + 1 ? <Check size={11} strokeWidth={3} /> : i + 1}</i><span>{l}</span>
            </li>
          ))}
        </ol>

        {step > 1 && source && (
          <div className="cp-summary" data-kind={kind ?? undefined}>
            <span className="cp-summary-icon">{kind === "diet" ? <Salad size={16} /> : <Dumbbell size={16} />}</span>
            <span className="cp-summary-who"><Avatar name={source.full_name} size={24} /><b>{first}</b></span>
            <span className="cp-summary-plan">{planLabel || (kind === "diet" ? "Diet plan" : "Workout")}</span>
            <ArrowRight size={15} className="cp-summary-arrow" />
            {target ? <span className="cp-summary-who"><Avatar name={target.full_name} size={24} /><b>{target.full_name.split(" ")[0]}</b></span> : <span className="cp-muted">Choose a member</span>}
          </div>
        )}

        {/* 1 · Type */}
        {step === 1 && (
          <div className="cp-kinds">
            {([["diet", "Diet plan", "Meals, calories and macros", Salad, diets], ["workout", "Workout program", "Training days, exercises and sets", Dumbbell, workouts]] as const).map(([k, label, sub, Icon, list]) => {
              const active = (list as { status: string | null }[]).some((x) => x.status === "active")
              return (
                <button key={k} type="button" className="cp-kind" data-kind={k} disabled={loading || list.length === 0} onClick={() => chooseKind(k)}>
                  <span className="cp-kind-icon"><Icon size={22} /></span>
                  <span className="cp-kind-text">
                    <strong>{label}</strong>
                    <small>{sub}</small>
                    <em>{loading ? "Loading…" : list.length === 0 ? `${first} has none yet` : `${list.length} available${active ? " · 1 current" : ""}`}</em>
                  </span>
                  <ChevronRight size={18} className="cp-kind-chev" />
                </button>
              )
            })}
          </div>
        )}

        {/* 2 · Plan */}
        {step === 2 && (
          <div className="cp-grid">
            {kind === "diet" && diets.map((d) => {
              const on = d.id === planId
              const md = mealDays(d)
              const meals = md ? md.days.reduce((n, day) => n + day.slots.length, 0) : null
              return (
                <button key={d.id} type="button" className="cp-plan" data-on={on} onClick={() => setPlanId(d.id)}>
                  <span className="cp-plan-top">
                    <span className="cp-radio" />
                    <strong>{dietTitle(d)}</strong>
                    <StatusTag status={d.status} />
                  </span>
                  <span className="cp-macros">
                    <span className="cp-m cp-m--p">P {r(d.target_protein_g)}g</span>
                    <span className="cp-m cp-m--c">C {r(d.target_carbs_g)}g</span>
                    <span className="cp-m cp-m--f">F {r(d.target_fat_g)}g</span>
                  </span>
                  <small>
                    {[MODE_LABELS[d.plan_mode ?? ""] ?? d.plan_mode, d.version_number ? `v${d.version_number}` : null,
                      d.start_date ? `from ${formatDate(d.start_date)}` : `created ${formatDate(d.created_at)}`, meals !== null ? `${meals} meals` : null].filter(Boolean).join(" · ")}
                  </small>
                </button>
              )
            })}
            {kind === "workout" && workouts.map((w) => {
              const on = w.id === planId
              return (
                <button key={w.id} type="button" className="cp-plan" data-on={on} onClick={() => setPlanId(w.id)}>
                  <span className="cp-plan-top">
                    <span className="cp-radio" />
                    <strong>{w.name}</strong>
                    <StatusTag status={w.status} />
                  </span>
                  <small style={{ textTransform: "capitalize" }}>{w.meta}</small>
                  <small>{w.valid_from ? `From ${formatDate(w.valid_from)}` : `Assigned ${formatDate(w.created_at)}`}</small>
                </button>
              )
            })}
          </div>
        )}

        {/* 3 · Member */}
        {step === 3 && (
          <>
            <label className="cp-search">
              <Search size={15} />
              <input autoFocus placeholder="Search members by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <div className="cp-members">
              {targets.length === 0 ? <div className="cp-empty">No members found</div> : targets.slice(0, 60).map((tm) => {
                const on = target?.id === tm.id
                const has = kind === "diet" ? tm.hasDiet : tm.hasWorkout
                return (
                  <button key={tm.id} type="button" className="cp-member" data-on={on}
                    onClick={() => { if (target?.id !== tm.id) { setTarget(tm); setDietDraft(null); setProgram(null) } }}>
                    <Avatar name={tm.full_name} size={34} />
                    <span className="cp-member-text">
                      <strong>{tm.full_name}</strong>
                      <small>{tm.phone ?? "No phone"}</small>
                    </span>
                    {has && <span className="cp-tag cp-tag--amber">Has a {kind === "diet" ? "diet" : "workout"}</span>}
                    <span className="cp-tick">{on && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                )
              })}
            </div>
            {replaces && <div className="cp-warn">{target!.full_name.split(" ")[0]}&apos;s current {kind === "diet" ? "diet plan" : "workout"} will be replaced. It stays in their history.</div>}
          </>
        )}

        {/* 4 · Review & edit */}
        {step === 4 && kind === "diet" && dietDraft && <DietEditor draft={dietDraft} onChange={setDietDraft} orgId={orgId} startDate={dietDraft.startDate} />}
        {step === 4 && kind === "workout" && (editLoading || !wDays ? (
          <div style={{ display: "grid", gap: 10 }}><Skeleton w="100%" h={56} r={12} /><Skeleton w="100%" h={220} r={12} /></div>
        ) : (
          <WorkoutEditor name={wName} onName={(v) => { setWName(v); setWDirty(true) }} days={wDays}
            onDays={(d) => { setWDays(d); setWDirty(true) }} dirty={wDirty} onReset={() => toReview(true)} />
        ))}
      </div>
    </Sheet>
  )
}

function StatusTag({ status }: { status: string | null }) {
  if (!status) return null
  const tone = status === "active" ? "green" : status === "draft" ? "blue" : "grey"
  return <span className={`cp-tag cp-tag--${tone}`}>{status === "active" ? "Current" : status[0].toUpperCase() + status.slice(1)}</span>
}

// ── Diet editor ──────────────────────────────────────────────────────────────

function DietEditor({ draft, onChange, orgId, startDate }: { draft: DietDraft; onChange: (d: DietDraft) => void; orgId: string; startDate: string }) {
  const [day, setDay] = useState(0)
  const [adding, setAdding] = useState<string | null>(null)
  const set = (p: Partial<DietDraft>) => onChange({ ...draft, ...p })
  const days = draft.days
  const slots = days?.[day]?.slots ?? []
  const totals = slots.reduce((t, s) => ({ k: t.k + s.calories, p: t.p + s.protein_g, c: t.c + s.carbs_g, f: t.f + s.fat_g }), { k: 0, p: 0, c: 0, f: 0 })
  const target = parseInt(draft.kcal) || 0

  function setSlots(fn: (s: MealSlot[]) => MealSlot[]) {
    if (!days) return
    set({ days: days.map((d, i) => (i === day ? { slots: fn(d.slots) } : d)), mealsEdited: true })
  }
  function dayLabel(i: number) {
    const d = new Date(`${startDate || today()}T00:00:00`); d.setDate(d.getDate() + i)
    return { w: d.toLocaleDateString("en-IN", { weekday: "short" }), n: d.getDate() }
  }

  return (
    <div className="cp-edit">
      <section className="cp-card">
        <h4>Targets</h4>
        <div className="cp-targets">
          {([["kcal", "Calories", "kcal", "k"], ["protein", "Protein", "g", "p"], ["carbs", "Carbs", "g", "c"], ["fat", "Fat", "g", "f"]] as const).map(([k, label, unit, tone]) => (
            <label key={k} className={`cp-target cp-target--${tone}`}>
              <span>{label}</span>
              <span className="cp-target-field">
                <input inputMode="decimal" value={draft[k]} onChange={(e) => set({ [k]: e.target.value.replace(/[^\d.]/g, "").slice(0, 5) } as Partial<DietDraft>)} />
                <em>{unit}</em>
              </span>
            </label>
          ))}
        </div>
        <div className="cp-row2">
          <label className="cp-field">
            <span>Start date</span>
            <input type="date" className="cp-input" value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} style={{ colorScheme: "light" }} />
          </label>
          <label className="cp-field" style={{ flex: 2 }}>
            <span>Trainer notes</span>
            <textarea className="cp-input" rows={2} value={draft.notes} placeholder="Instructions or restrictions for this member" onChange={(e) => set({ notes: e.target.value })} />
          </label>
        </div>
      </section>

      {days && draft.generated && (
        <div className="cp-info" data-tone={draft.mealsEdited ? "amber" : "blue"}>
          <Pencil size={15} />
          <span>
            {draft.mealsEdited
              ? "You've changed meals, so the copy will be saved as a manually built plan. Meal swaps and auto-updates from the diet engine won't carry over."
              : "These meals were generated automatically. Copied as they are, they keep their swap options. Editing any meal saves the copy as a manually built plan."}
          </span>
        </div>
      )}

      {days ? (
        <section className="cp-card">
          <div className="cp-card-head">
            <h4>Meals</h4>
            <span className="cp-day-total" data-off={target > 0 && Math.abs(totals.k - target) / target > 0.1}>
              <Flame size={12} /> {r(totals.k)} / {target || "—"} kcal · P {r(totals.p)} · C {r(totals.c)} · F {r(totals.f)}
            </span>
          </div>
          <div className="cp-days">
            {days.map((d, i) => {
              const l = dayLabel(i)
              return (
                <button key={i} type="button" data-on={i === day} onClick={() => { setDay(i); setAdding(null) }}>
                  <small>{l.w}</small><b>{l.n}</b><i>{d.slots.length}</i>
                </button>
              )
            })}
          </div>
          <div className="cp-meals">
            {[...MEAL_TYPES, ...[...new Set(slots.map((x) => x.meal_type))].filter((t) => !MEAL_TYPES.includes(t))].map((mt) => {
              const group = slots.filter((s) => s.meal_type === mt)
              return (
                <div key={mt} className="cp-mealgroup">
                  <div className="cp-mealgroup-head">
                    <span>{mealLabel(mt)}</span>
                    <button type="button" className="cp-link" onClick={() => setAdding(adding === mt ? null : mt)}><Plus size={13} /> Add</button>
                  </div>
                  {group.map((s) => (
                    <div key={s.id} className="cp-meal">
                      <div className="cp-meal-text">
                        <strong>{s.recipe_name}</strong>
                        <small>{r(s.calories)} kcal · P {r(s.protein_g)} C {r(s.carbs_g)} F {r(s.fat_g)}{s.serving_size_description ? ` · ${s.serving_size_description}` : ""}</small>
                        <input className="cp-note" placeholder="Note for this meal" value={s.notes ?? ""} onChange={(e) => setSlots((all) => all.map((x) => (x.id === s.id ? { ...x, notes: e.target.value } : x)))} />
                      </div>
                      <button type="button" className="cp-icon" aria-label={`Remove ${s.recipe_name}`} onClick={() => setSlots((all) => all.filter((x) => x.id !== s.id))}><Trash2 size={14} /></button>
                    </div>
                  ))}
                  {adding === mt && (
                    <RecipePicker orgId={orgId} mealType={mt} onClose={() => setAdding(null)} onPick={(rc) => {
                      setSlots((all) => [...all, {
                        id: crypto.randomUUID(), meal_type: mt, recipe_id: rc.recipe_id, recipe_name: rc.recipe_name,
                        calories: rc.calories_kcal ?? 0, protein_g: rc.protein_g ?? 0, carbs_g: rc.carbs_g ?? 0, fat_g: rc.fat_g ?? 0,
                        serving_size_description: rc.serving_size_description, notes: "",
                      }])
                      setAdding(null)
                    }} />
                  )}
                </div>
              )
            })}
          </div>
          {day > 0 && slots.length === 0 && (days[day - 1]?.slots.length ?? 0) > 0 && (
            <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => setSlots(() => days[day - 1].slots.map((s) => ({ ...s, id: crypto.randomUUID() })))}>Copy previous day</button>
          )}
        </section>
      ) : (
        <div className="cp-info">
          <Pencil size={15} />
          <span>This plan has no meals saved yet. You can change the targets and notes, and build meals later from the diet page.</span>
        </div>
      )}
    </div>
  )
}

let recipeCache: Recipe[] | null = null
function RecipePicker({ orgId, mealType, onPick, onClose }: { orgId: string; mealType: string; onPick: (r: Recipe) => void; onClose: () => void }) {
  const [list, setList] = useState<Recipe[] | null>(recipeCache)
  const [q, setQ] = useState("")
  const [all, setAll] = useState(false)
  useEffect(() => {
    if (recipeCache) return
    const cols = "recipe_id, recipe_name, meal_type, calories_kcal, protein_g, carbs_g, fat_g, serving_size_description"
    Promise.all([
      supabase.from("recipes").select(cols).is("org_id", null).eq("is_active", true),
      supabase.from("recipes").select(cols).eq("org_id", orgId).eq("is_active", true),
    ]).then(([g, m]) => {
      const seen = new Map<string, Recipe>()
      ;[...(g.data ?? []), ...(m.data ?? [])].forEach((x) => seen.set((x as Recipe).recipe_id, x as Recipe))
      recipeCache = [...seen.values()].sort((a, b) => a.recipe_name.localeCompare(b.recipe_name))
      setList(recipeCache)
    })
  }, [orgId])
  const shown = useMemo(() => (list ?? []).filter((x) =>
    (all || !x.meal_type?.length || x.meal_type.includes(mealType)) && (!q || x.recipe_name.toLowerCase().includes(q.toLowerCase()))).slice(0, 40), [list, q, all, mealType])
  return (
    <div className="cp-picker">
      <div className="cp-picker-bar">
        <label className="cp-search cp-search--sm"><Search size={14} /><input autoFocus placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="cp-check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All meal types</label>
        <button type="button" className="cp-icon" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="cp-picker-list">
        {!list ? <Skeleton w="100%" h={40} r={8} /> : shown.length === 0 ? <div className="cp-empty">No recipes found</div> : shown.map((x) => (
          <button key={x.recipe_id} type="button" onClick={() => onPick(x)}>
            <span><strong>{x.recipe_name}</strong><small>{r(x.calories_kcal)} kcal · P {r(x.protein_g)} C {r(x.carbs_g)} F {r(x.fat_g)}</small></span>
            <Plus size={14} />
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Workout editor ───────────────────────────────────────────────────────────

let exerciseCache: WorkoutExercise[] | null = null
function WorkoutEditor({ name, onName, days, onDays, dirty, onReset }: {
  name: string; onName: (v: string) => void; days: DayDraft[]; onDays: (d: DayDraft[]) => void; dirty: boolean; onReset: () => void
}) {
  const [active, setActive] = useState(0)
  const [picking, setPicking] = useState(false)
  const [exs, setExs] = useState<WorkoutExercise[] | null>(exerciseCache)
  const [q, setQ] = useState("")
  const d = days[active]

  useEffect(() => {
    if (!picking || exerciseCache) return
    supabase.from("workout_exercises").select("*").order("name").then(({ data }) => {
      exerciseCache = ((data ?? []) as WorkoutExercise[]).filter((e) => e.is_active !== false)
      setExs(exerciseCache)
    })
  }, [picking])

  function setItems(fn: (it: ItemDraft[]) => ItemDraft[]) { onDays(days.map((x, i) => (i === active ? { ...x, items: fn(x.items) } : x))) }
  function patch(u: string, p: Partial<ItemDraft>) { setItems((it) => it.map((x) => (x.uid === u ? { ...x, ...p } : x))) }
  function move(i: number, dir: -1 | 1) { setItems((it) => { const n = [...it]; const j = i + dir; if (j < 0 || j >= n.length) return it; [n[i], n[j]] = [n[j], n[i]]; return n }) }
  const shown = (exs ?? []).filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40)

  return (
    <div className="cp-edit">
      <div className="cp-info" data-tone={dirty ? "amber" : "blue"}>
        <Dumbbell size={15} />
        <span>
          {dirty
            ? "You've edited this program, so a private copy will be created for this member. The original shared program isn't changed."
            : "No changes yet: the member is linked to the same shared program. Edit anything below to give them their own version."}
        </span>
        {dirty && <button type="button" className="cp-link" onClick={onReset}>Undo edits</button>}
      </div>

      {dirty && (
        <label className="cp-field">
          <span>Name of the new copy</span>
          <input className="cp-input" value={name} maxLength={80} onChange={(e) => onName(e.target.value)} />
        </label>
      )}

      <section className="cp-card">
        <div className="cp-wdays">
          {days.map((x, i) => (
            <button key={i} type="button" data-on={i === active} onClick={() => { setActive(i); setPicking(false) }}>
              <b>{x.day_name || `Day ${x.day_number}`}</b><small>{x.items.length} exercises</small>
            </button>
          ))}
        </div>

        {d && (
          <>
            <div className="cp-row2" style={{ marginBottom: 10 }}>
              <label className="cp-field"><span>Day name</span>
                <input className="cp-input" value={d.day_name} onChange={(e) => onDays(days.map((x, i) => (i === active ? { ...x, day_name: e.target.value } : x)))} />
              </label>
              <label className="cp-field"><span>Focus</span>
                <input className="cp-input" value={d.focus} placeholder="e.g. Chest & triceps" onChange={(e) => onDays(days.map((x, i) => (i === active ? { ...x, focus: e.target.value } : x)))} />
              </label>
            </div>

            <div className="cp-exlist">
              {d.items.length === 0 && <div className="cp-empty">No exercises on this day</div>}
              {d.items.map((it, i) => {
                const timed = isTimed(it.exercise)
                return (
                  <div key={it.uid} className="cp-ex">
                    <span className="cp-ex-num">{i + 1}</span>
                    <div className="cp-ex-main">
                      <strong>{it.exercise.name}</strong>
                      <div className="cp-ex-fields">
                        <label><span>Sets</span><input inputMode="numeric" value={it.sets} onChange={(e) => patch(it.uid, { sets: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })} /></label>
                        {timed
                          ? <label><span>Sec</span><input inputMode="numeric" value={it.duration_sec} onChange={(e) => patch(it.uid, { duration_sec: e.target.value.replace(/\D/g, "") })} /></label>
                          : <label><span>Reps</span><input value={it.reps} maxLength={12} onChange={(e) => patch(it.uid, { reps: e.target.value })} /></label>}
                        <label><span>Kg</span><input inputMode="decimal" value={it.weight_kg} disabled={timed} placeholder="—" onChange={(e) => patch(it.uid, { weight_kg: e.target.value.replace(/[^\d.]/g, "") })} /></label>
                        <label><span>Rest</span><input inputMode="numeric" value={it.rest_sec} onChange={(e) => patch(it.uid, { rest_sec: Math.min(600, parseInt(e.target.value.replace(/\D/g, "")) || 0) })} /></label>
                      </div>
                      <input className="cp-note" placeholder="Coaching note" value={it.notes} onChange={(e) => patch(it.uid, { notes: e.target.value })} />
                    </div>
                    <div className="cp-ex-tools">
                      <button type="button" className="cp-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                      <button type="button" className="cp-icon" disabled={i === d.items.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                      <button type="button" className="cp-icon" onClick={() => setItems((all) => all.filter((x) => x.uid !== it.uid))} aria-label={`Remove ${it.exercise.name}`}><Trash2 size={14} /></button>
                    </div>
                  </div>
                )
              })}
            </div>

            {picking ? (
              <div className="cp-picker">
                <div className="cp-picker-bar">
                  <label className="cp-search cp-search--sm"><Search size={14} /><input autoFocus placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} /></label>
                  <button type="button" className="cp-icon" onClick={() => setPicking(false)} aria-label="Close"><X size={14} /></button>
                </div>
                <div className="cp-picker-list">
                  {!exs ? <Skeleton w="100%" h={40} r={8} /> : shown.length === 0 ? <div className="cp-empty">No exercises found</div> : shown.map((e) => (
                    <button key={e.id} type="button" onClick={() => {
                      setItems((all) => [...all, { uid: uid(), exercise: e, sets: 3, reps: "10", weight_kg: "", duration_sec: "60", rest_sec: 60, notes: "" }])
                      setPicking(false); setQ("")
                    }}>
                      <span><strong>{e.name}</strong><small style={{ textTransform: "capitalize" }}>{e.muscle_group.replace("_", " ")} · {e.equipment.replace("_", " ")}</small></span>
                      <Plus size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" style={{ marginTop: 10 }} onClick={() => setPicking(true)}><Plus size={14} /> Add exercise</button>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** Creates a private program for the member from the edited draft (same shape as PlanBuilder saves). */
async function createProgram(p: Program, name: string, days: DayDraft[], orgId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  const { data: prog, error } = await supabase.from("workout_programs").insert({
    org_id: orgId, created_by: user?.id ?? null, name: name.trim() || `${p.name} (copy)`, goal: p.goal, difficulty: p.difficulty,
    days_per_week: days.length, duration_weeks: p.duration_weeks, is_template: false, notes: p.notes, status: "active",
  }).select("id").single()
  if (error || !prog) throw error ?? new Error("Couldn't create the program")
  for (const day of days) {
    const { data: row, error: dErr } = await supabase.from("workout_program_days")
      .insert({ program_id: prog.id, day_number: day.day_number, day_name: day.day_name.trim() || `Day ${day.day_number}`, focus: day.focus.trim() || null })
      .select("id").single()
    if (dErr || !row) throw dErr ?? new Error("Couldn't save a training day")
    if (!day.items.length) continue
    const { error: iErr } = await supabase.from("workout_program_items").insert(day.items.map((it, idx) => ({
      day_id: row.id, exercise_id: it.exercise.id, sort_order: idx, sets: it.sets, reps: it.reps || "10",
      weight_kg: it.weight_kg ? parseFloat(it.weight_kg) : null,
      duration_sec: isTimed(it.exercise) ? parseInt(it.duration_sec) || null : null,
      rest_sec: it.rest_sec, notes: it.notes.trim() || null,
    })))
    if (iErr) throw iErr
  }
  return prog.id as string
}

// NOTE: no backticks inside this CSS.
const CSS = `
.cp { display: flex; flex-direction: column; gap: 16px; --cp-line: var(--separator); --cp-soft: #f5f6f8; }
.cp-muted { color: var(--text-tertiary); font-size: 13px; }

.cp-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.cp-steps li { display: flex; align-items: center; gap: 7px; padding-top: 9px; border-top: 3px solid var(--cp-line); font-size: 12.5px; font-weight: 600; color: var(--text-tertiary); min-width: 0; }
.cp-steps li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-steps li[data-state="now"] { color: var(--text-primary); border-top-color: var(--accent); }
.cp-steps li[data-state="done"] { color: var(--accent); border-top-color: var(--accent); }
.cp-steps i { font-style: normal; width: 20px; height: 20px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; font-size: 11px; background: var(--cp-soft); }
.cp-steps li[data-state="now"] i { background: var(--accent); color: #fff; }
.cp-steps li[data-state="done"] i { background: var(--accent-dim); }

.cp-summary { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: linear-gradient(90deg, #eef5ff, #f7f3ff); border: 1px solid #e3e9f5; font-size: 13px; }
.cp-summary[data-kind="diet"] { background: linear-gradient(90deg, #ecf8f0, #f2f7ff); border-color: #dcefe3; }
.cp-summary-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: #fff; color: #8944ab; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
.cp-summary[data-kind="diet"] .cp-summary-icon { color: #1f8a3b; }
.cp-summary-who { display: inline-flex; align-items: center; gap: 6px; }
.cp-summary-plan { color: var(--text-secondary); padding: 3px 9px; border-radius: 8px; background: rgba(255,255,255,0.75); max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-summary-arrow { color: var(--text-tertiary); }

.cp-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cp-kind { position: relative; display: flex; align-items: flex-start; gap: 14px; padding: 18px; border-radius: 16px; border: 1px solid var(--cp-line); background: #fff; font: inherit; text-align: left; cursor: pointer; overflow: hidden; transition: border-color .15s, box-shadow .15s, transform .15s; }
.cp-kind::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; }
.cp-kind[data-kind="diet"]::before { background: linear-gradient(90deg, #34c759, #30b0c7); }
.cp-kind[data-kind="workout"]::before { background: linear-gradient(90deg, #af52de, #5856d6); }
.cp-kind:hover:not(:disabled) { border-color: var(--accent); box-shadow: 0 6px 20px rgba(0,98,196,0.12); transform: translateY(-1px); }
.cp-kind:disabled { opacity: 0.5; cursor: default; }
.cp-kind-icon { width: 46px; height: 46px; border-radius: 13px; display: grid; place-items: center; flex-shrink: 0; }
.cp-kind[data-kind="diet"] .cp-kind-icon { background: #e6f6ec; color: #1f8a3b; }
.cp-kind[data-kind="workout"] .cp-kind-icon { background: #f3eafb; color: #8944ab; }
.cp-kind-text { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cp-kind-text strong { font-size: 16px; color: var(--text-primary); }
.cp-kind-text small { font-size: 13px; color: var(--text-secondary); }
.cp-kind-text em { font-style: normal; font-size: 12.5px; font-weight: 600; color: var(--accent); margin-top: 6px; }
.cp-kind-chev { color: var(--text-tertiary); align-self: center; }

.cp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.cp-plan { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 14px; border: 1px solid var(--cp-line); background: #fff; font: inherit; text-align: left; cursor: pointer; }
.cp-plan:hover { border-color: #c4c8d0; }
.cp-plan[data-on="true"] { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.cp-plan-top { display: flex; align-items: center; gap: 10px; }
.cp-plan-top strong { flex: 1; font-size: 14.5px; color: var(--text-primary); min-width: 0; }
.cp-plan small { font-size: 12.5px; color: var(--text-tertiary); padding-left: 28px; }
.cp-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #c4c8d0; flex-shrink: 0; }
.cp-plan[data-on="true"] .cp-radio { border: 5px solid var(--accent); }
.cp-macros { display: flex; gap: 6px; padding-left: 28px; flex-wrap: wrap; }
.cp-m { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; }
.cp-m--p { background: #e7f0ff; color: #0062c4; } .cp-m--c { background: #e6f6ec; color: #1f8a3b; } .cp-m--f { background: #f3eafb; color: #8944ab; }
.cp-tag { font-size: 11.5px; font-weight: 650; padding: 2px 9px; border-radius: 10px; white-space: nowrap; }
.cp-tag--green { background: #e6f6ec; color: #1f8a3b; } .cp-tag--blue { background: #e7f0ff; color: #0062c4; }
.cp-tag--grey { background: #f0f0f3; color: #6e6e73; } .cp-tag--amber { background: #fff1de; color: #b45309; }

.cp-search { position: relative; display: flex; align-items: center; }
.cp-search > svg { position: absolute; left: 12px; color: var(--text-tertiary); pointer-events: none; }
.cp-search input { width: 100%; height: 40px; padding: 0 12px 0 36px; border: 1px solid var(--cp-line); border-radius: 10px; font: inherit; font-size: 14px; outline: none; background: #fff; color: var(--text-primary); }
.cp-search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
.cp-search--sm { flex: 1; } .cp-search--sm input { height: 34px; font-size: 13px; }
.cp-members { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; max-height: 380px; overflow-y: auto; padding: 2px; }
.cp-member { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--cp-line); background: #fff; font: inherit; text-align: left; cursor: pointer; }
.cp-member:hover { border-color: #c4c8d0; }
.cp-member[data-on="true"] { border-color: var(--accent); background: var(--accent-dim); }
.cp-member-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cp-member-text strong { font-size: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cp-member-text small { font-size: 12.5px; color: var(--text-tertiary); }
.cp-tick { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #d4d7dd; display: grid; place-items: center; flex-shrink: 0; color: #fff; }
.cp-member[data-on="true"] .cp-tick { background: var(--accent); border-color: var(--accent); }
.cp-warn { padding: 10px 12px; border-radius: 10px; background: #fff7ea; border: 1px solid #ffe2b8; color: #9a4b00; font-size: 13px; }
.cp-empty { padding: 18px; text-align: center; color: var(--text-tertiary); font-size: 13px; }

.cp-edit { display: flex; flex-direction: column; gap: 14px; }
.cp-card { border: 1px solid var(--cp-line); border-radius: 14px; padding: 14px; background: #fff; }
.cp-card h4 { margin: 0 0 10px; font-size: 13px; font-weight: 650; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
.cp-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.cp-card-head h4 { margin: 0; }
.cp-targets { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
.cp-target { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 11px; border: 1px solid transparent; }
.cp-target > span:first-child { font-size: 12px; font-weight: 600; }
.cp-target--k { background: #fff5e6; color: #b45309; } .cp-target--p { background: #eef4ff; color: #0062c4; }
.cp-target--c { background: #edf8f1; color: #1f8a3b; } .cp-target--f { background: #f6effc; color: #8944ab; }
.cp-target-field { display: flex; align-items: baseline; gap: 4px; }
.cp-target input { width: 100%; min-width: 0; border: none; background: transparent; font: inherit; font-size: 20px; font-weight: 700; color: var(--text-primary); outline: none; padding: 0; }
.cp-target em { font-style: normal; font-size: 12px; opacity: 0.8; }
.cp-target:focus-within { border-color: currentColor; }
.cp-row2 { display: flex; gap: 10px; }
.cp-field { flex: 1; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.cp-field > span { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); }
.cp-input { width: 100%; min-height: 38px; padding: 8px 10px; border: 1px solid var(--cp-line); border-radius: 9px; font: inherit; font-size: 14px; color: var(--text-primary); background: #fff; outline: none; resize: vertical; }
.cp-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }

.cp-day-total { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; font-weight: 600; color: #1f8a3b; background: #edf8f1; padding: 4px 10px; border-radius: 9px; }
.cp-day-total[data-off="true"] { color: #b45309; background: #fff5e6; }
.cp-days { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 10px; scrollbar-width: thin; }
.cp-days button { flex: 0 0 auto; width: 54px; display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 7px 0; border-radius: 11px; border: 1px solid var(--cp-line); background: #fff; font: inherit; cursor: pointer; }
.cp-days small { font-size: 11px; color: var(--text-tertiary); } .cp-days b { font-size: 16px; }
.cp-days i { font-style: normal; font-size: 10.5px; color: var(--text-tertiary); }
.cp-days button[data-on="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.cp-days button[data-on="true"] small, .cp-days button[data-on="true"] i { color: rgba(255,255,255,0.85); }
.cp-meals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.cp-mealgroup { border-radius: 12px; background: var(--cp-soft); padding: 10px; display: flex; flex-direction: column; gap: 6px; }
.cp-mealgroup-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 650; }
.cp-meal { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; background: #fff; border-radius: 10px; border: 1px solid var(--cp-line); }
.cp-meal-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cp-meal-text strong { font-size: 13.5px; }
.cp-meal-text small { font-size: 12px; color: var(--text-tertiary); }
.cp-note { margin-top: 5px; width: 100%; height: 28px; padding: 0 8px; border: 1px dashed var(--cp-line); border-radius: 7px; font: inherit; font-size: 12.5px; background: transparent; color: var(--text-primary); outline: none; }
.cp-note:focus { border-style: solid; border-color: var(--accent); background: #fff; }
.cp-link { display: inline-flex; align-items: center; gap: 3px; border: none; background: none; font: inherit; font-size: 12.5px; font-weight: 650; color: var(--accent); cursor: pointer; padding: 2px 4px; white-space: nowrap; }
.cp-icon { width: 30px; height: 30px; flex-shrink: 0; border: none; border-radius: 8px; background: none; color: var(--text-tertiary); display: inline-grid; place-items: center; cursor: pointer; }
.cp-icon:hover:not(:disabled) { background: #eceef2; color: var(--text-primary); }
.cp-icon:disabled { opacity: 0.3; cursor: default; }

.cp-picker { border: 1px solid var(--accent); border-radius: 11px; background: #fff; overflow: hidden; margin-top: 4px; }
.cp-picker-bar { display: flex; align-items: center; gap: 8px; padding: 8px; border-bottom: 1px solid var(--cp-line); }
.cp-check { display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text-secondary); white-space: nowrap; }
.cp-picker-list { max-height: 220px; overflow-y: auto; padding: 4px; }
.cp-picker-list button { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 8px; font: inherit; text-align: left; cursor: pointer; color: var(--accent); }
.cp-picker-list button:hover { background: var(--accent-dim); }
.cp-picker-list span { display: flex; flex-direction: column; min-width: 0; }
.cp-picker-list strong { font-size: 13.5px; color: var(--text-primary); font-weight: 600; }
.cp-picker-list small { font-size: 12px; color: var(--text-tertiary); }

.cp-info { display: flex; align-items: flex-start; gap: 10px; padding: 11px 13px; border-radius: 11px; background: #eef4ff; color: #0b4e98; font-size: 13px; line-height: 1.45; }
.cp-info[data-tone="amber"] { background: #fff7ea; color: #8a4500; }
.cp-info > svg { flex-shrink: 0; margin-top: 2px; }
.cp-info span { flex: 1; }

.cp-wdays { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-bottom: 12px; }
.cp-wdays button { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 8px 12px; border-radius: 11px; border: 1px solid var(--cp-line); background: #fff; font: inherit; cursor: pointer; text-align: left; }
.cp-wdays b { font-size: 13.5px; } .cp-wdays small { font-size: 11.5px; color: var(--text-tertiary); }
.cp-wdays button[data-on="true"] { background: linear-gradient(135deg, #5856d6, #af52de); border-color: transparent; color: #fff; }
.cp-wdays button[data-on="true"] small { color: rgba(255,255,255,0.85); }
.cp-exlist { display: flex; flex-direction: column; gap: 8px; }
.cp-ex { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border-radius: 12px; border: 1px solid var(--cp-line); background: #fff; }
.cp-ex-num { width: 24px; height: 24px; border-radius: 7px; background: #f3eafb; color: #8944ab; font-size: 12px; font-weight: 700; display: grid; place-items: center; flex-shrink: 0; margin-top: 2px; }
.cp-ex-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.cp-ex-main strong { font-size: 14px; }
.cp-ex-fields { display: grid; grid-template-columns: repeat(4, minmax(0, 88px)); gap: 6px; }
.cp-ex-fields label { display: flex; flex-direction: column; gap: 2px; }
.cp-ex-fields span { font-size: 11px; font-weight: 600; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.03em; }
.cp-ex-fields input { width: 100%; height: 32px; padding: 0 8px; border: 1px solid var(--cp-line); border-radius: 8px; font: inherit; font-size: 14px; font-variant-numeric: tabular-nums; outline: none; background: #fff; color: var(--text-primary); }
.cp-ex-fields input:focus { border-color: var(--accent); }
.cp-ex-fields input:disabled { background: var(--cp-soft); }
.cp-ex-tools { display: flex; flex-direction: column; }

.cp-foot { display: flex; align-items: center; gap: 10px; width: 100%; }
.cp-foot-hint { flex: 1; font-size: 12.5px; color: #8a4500; text-align: right; }

@media (max-width: 760px) {
  .cp-steps li span { display: none; }
  .cp-steps li[data-state="now"] span { display: inline; }
  .cp-kinds, .cp-meals { grid-template-columns: 1fr; }
  .cp-grid, .cp-members { grid-template-columns: 1fr; }
  .cp-members { max-height: none; }
  .cp-targets { grid-template-columns: 1fr 1fr; }
  .cp-row2 { flex-direction: column; }
  .cp-summary-plan { max-width: 100%; order: 5; flex-basis: 100%; }
  .cp-ex-fields { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .cp-ex-tools { flex-direction: row; position: absolute; right: 6px; top: 6px; }
  .cp-ex { position: relative; padding-top: 12px; }
  .cp-ex-main strong { padding-right: 96px; }
  .cp-foot-hint { display: none; }
  .cp-foot .ps-btn { flex: 1; }
  .cp-input, .cp-search input, .cp-ex-fields input { font-size: 16px; }
}
`

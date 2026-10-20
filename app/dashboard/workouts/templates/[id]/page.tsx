"use client"
// app/dashboard/workouts/templates/[id]/page.tsx

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, ChevronDown, ChevronUp, Calendar, Dumbbell, Clock, Copy, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ExerciseThumbnail, ExerciseImages } from "../../components/ExerciseMedia"
import { WorkoutProgram, WorkoutProgramDay, WorkoutProgramItem, GOAL_LABELS, GOAL_BADGE, DIFFICULTY_LABELS, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from "@/lib/workout/types"

function ExerciseRow({ item }: { item: WorkoutProgramItem }) {
  const [open, setOpen] = useState(false)
  const ex = item.exercise
  const isCardio = ex?.muscle_group === "cardio"
  return (
    <div style={{ borderBottom: "1px solid var(--separator)" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "inherit" }}
      >
        <ExerciseThumbnail name={ex?.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ps-cell-title" style={{ fontSize: 13.5 }}>{ex?.name}</div>
          {ex && <div className="ps-cell-sub">{MUSCLE_GROUP_LABELS[ex.muscle_group]} · {EQUIPMENT_LABELS[ex.equipment]}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span className="ps-badge" style={{ fontVariantNumeric: "tabular-nums", fontSize: 12 }}>
            {isCardio && item.duration_sec ? `${item.sets} × ${item.duration_sec}s` : `${item.sets} × ${item.reps}`}
          </span>
          {item.rest_sec > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--text-tertiary)" }}>
              <Clock size={10} />{item.rest_sec}s
            </span>
          )}
          <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>
      {open && (
        <div style={{ padding: "2px 0 14px" }}>
          <ExerciseImages name={ex?.name} />
          {item.notes && (
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{item.notes}</p>
          )}
        </div>
      )}
    </div>
  )
}

export default function TemplatePreviewPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [prog, setProg] = useState<WorkoutProgram | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeDay, setActiveDay] = useState(0)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from("workout_programs").select("*").eq("id", id).is("org_id", null).single()
      if (!p) { setLoading(false); return }
      const { data: days } = await supabase.from("workout_program_days").select("*").eq("program_id", id).order("day_number")
      const dayIds = (days ?? []).map((d) => d.id)
      const { data: items } = await supabase.from("workout_program_items").select("*, exercise:workout_exercises(*)").in("day_id", dayIds).order("sort_order")
      const daysWithItems: WorkoutProgramDay[] = (days ?? []).map((d) => ({
        ...d,
        items: (items ?? []).filter((it) => it.day_id === d.id) as WorkoutProgramItem[],
      }))
      setProg({ ...p, days: daysWithItems })
      setLoading(false)
    }
    load()
  }, [id])

  async function handleCopy() {
    if (!prog) return
    setCopying(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) throw new Error("Could not resolve org")

      const { data: newProg } = await supabase
        .from("workout_programs")
        .insert({ org_id: roleData.org_id, created_by: user.id, name: prog.name, goal: prog.goal, difficulty: prog.difficulty, days_per_week: prog.days_per_week, duration_weeks: prog.duration_weeks, is_template: false, notes: prog.notes })
        .select("id").single()
      if (!newProg) throw new Error("Clone failed")

      for (const day of prog.days ?? []) {
        const { data: newDay } = await supabase
          .from("workout_program_days")
          .insert({ program_id: newProg.id, day_number: day.day_number, day_name: day.day_name, focus: day.focus })
          .select("id").single()
        if (!newDay) continue
        if (day.items?.length) {
          await supabase.from("workout_program_items").insert(
            day.items.map((it) => ({ day_id: newDay.id, exercise_id: it.exercise_id, sort_order: it.sort_order, sets: it.sets, reps: it.reps, weight_kg: it.weight_kg, duration_sec: it.duration_sec, rest_sec: it.rest_sec, notes: it.notes }))
          )
        }
      }
      router.push(`/dashboard/workouts/${newProg.id}`)
    } catch (err) {
      console.error(err)
      setCopying(false)
    }
  }

  if (loading) {
    return (
      <div className="ps-page ps-page--narrow">
        <div style={{ padding: "80px 0", display: "flex", justifyContent: "center" }}>
          <Loader2 size={24} className="ps-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      </div>
    )
  }

  if (!prog) {
    return (
      <div className="ps-page ps-page--narrow">
        <div className="ps-empty">
          <div className="ps-empty-title">Template not found</div>
          <Link href="/dashboard/workouts" className="ps-btn ps-btn--secondary">Back to workouts</Link>
        </div>
      </div>
    )
  }

  const totalExercises = prog.days?.reduce((s, d) => s + (d.items?.length ?? 0), 0) ?? 0
  const day = prog.days?.[activeDay]

  return (
    <div className="ps-page ps-page--narrow">
      <Link href="/dashboard/workouts" className="ps-back"><ChevronLeft size={20} />Workouts</Link>

      <div style={{ marginBottom: 12 }}>
        <span className="ps-badge">Pre-built template</span>
      </div>

      <div className="ps-hero" style={{ marginBottom: 20 }}>
        <div className="ps-logo ps-logo--lg" style={{ background: "var(--fill-2)", color: "var(--text-secondary)", boxShadow: "none" }}>
          <Dumbbell size={26} />
        </div>
        <div className="ps-hero-text">
          <h1 className="ps-title" style={{ fontSize: 26 }}>{prog.name}</h1>
          <div className="ps-meta" style={{ marginTop: 8 }}>
            <span className={`ps-badge ${GOAL_BADGE[prog.goal]}`}>{GOAL_LABELS[prog.goal]}</span>
            <span className="ps-badge">{DIFFICULTY_LABELS[prog.difficulty]}</span>
          </div>
        </div>
        <div className="ps-hero-actions">
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleCopy} disabled={copying}>
            {copying ? <Loader2 size={15} className="ps-spin" /> : <Copy size={15} />}
            {copying ? "Copying..." : "Use this plan"}
          </button>
        </div>
      </div>

      <div className="ps-card" style={{ marginBottom: 20 }}>
        <div className="ps-card-body" style={{ padding: "16px 24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16 }}>
            {[
              { icon: <Calendar size={16} />, value: `${prog.days_per_week}`, label: "days / week" },
              { icon: <Clock size={16} />, value: `${prog.duration_weeks}`, label: "weeks" },
              { icon: <Dumbbell size={16} />, value: `${totalExercises}`, label: "exercises" },
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

      <div className="ps-card" style={{ overflow: "hidden", marginBottom: 80 }}>
        <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", borderBottom: "1px solid var(--separator)" }}>
          {prog.days?.map((d, i) => (
            <button key={d.id} type="button" onClick={() => setActiveDay(i)}
              style={{ padding: "10px 16px", border: "none", borderBottom: activeDay === i ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, background: "none", cursor: "pointer", fontSize: 13, fontWeight: activeDay === i ? 600 : 500, color: activeDay === i ? "var(--accent)" : "var(--text-secondary)", whiteSpace: "nowrap", fontFamily: "inherit" }}
            >
              {d.day_name}
              {d.items && d.items.length > 0 && (
                <span className={activeDay === i ? "ps-badge ps-badge--blue" : "ps-badge"} style={{ height: 18, fontSize: 11, marginLeft: 6, padding: "0 6px" }}>
                  {d.items.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ padding: "14px 20px 20px" }}>
          {day?.focus && <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 12 }}>{day.focus}</p>}
          {!day?.items?.length ? (
            <div className="ps-empty" style={{ padding: "24px 0" }}><div className="ps-empty-title">Rest day</div></div>
          ) : (
            <div>{day.items.map((item) => <ExerciseRow key={item.id} item={item} />)}</div>
          )}
        </div>
      </div>

      <div className="ps-actionbar">
        <Link href="/dashboard/workouts" className="ps-btn ps-btn--secondary">Back</Link>
        <button type="button" className="ps-btn ps-btn--primary" onClick={handleCopy} disabled={copying}>
          {copying ? <Loader2 size={15} className="ps-spin" /> : <Copy size={15} />}
          {copying ? "Copying..." : "Use this plan"}
        </button>
      </div>
    </div>
  )
}

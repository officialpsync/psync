"use client"
// app/dashboard/workouts/[id]/page.tsx
// Plan view for gym plans and built-in templates: hero, week overview, muscle split, equipment, schedule.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import {
  ChevronLeft, Dumbbell, Pencil, Copy, Loader2, StickyNote, CalendarDays, Clock, Layers, Users, Printer, Timer, Wrench, Activity,
} from "lucide-react"
import { DesignStyles } from "../../components/DesignSystem"
import { Skeleton } from "../../components/ui"
import {
  GOAL_LABELS, DIFFICULTY_LABELS, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS,
  type WorkoutProgram, type WorkoutProgramDay, type WorkoutProgramItem, type MuscleGroup, type Equipment,
} from "@/lib/workout/types"
import WorkoutDayTabs from "../components/WorkoutDayTabs"
import { useExerciseCategories } from "../components/categories"
import { clonePlan } from "../components/planActions"
import { loadOrgContext, supabase } from "../components/shared"
import { WorkoutStyles, goalTheme, DifficultyBars, MUSCLE_COLOR } from "../components/WorkoutTheme"

/** Rough session length: work time per set plus rest between sets. */
function itemSeconds(it: WorkoutProgramItem) {
  const timed = it.exercise?.muscle_group === "cardio" || it.exercise?.movement_type === "cardio"
  const work = timed ? (it.duration_sec ?? 60) : 40
  return it.sets * work + Math.max(0, it.sets - 1) * (it.rest_sec ?? 60) + 60 // +1 min setup
}

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

  const summary = useMemo(() => {
    const days = prog?.days ?? []
    const items = days.flatMap((d) => d.items ?? [])
    const muscles: Record<string, number> = {}
    const equip = new Set<Equipment>()
    items.forEach((it) => {
      if (!it.exercise) return
      muscles[it.exercise.muscle_group] = (muscles[it.exercise.muscle_group] ?? 0) + it.sets
      equip.add(it.exercise.equipment)
    })
    const totalSets = items.reduce((s, it) => s + it.sets, 0)
    const perDay = days.map((d) => ({
      d, sets: (d.items ?? []).reduce((s, it) => s + it.sets, 0),
      mins: Math.round((d.items ?? []).reduce((s, it) => s + itemSeconds(it), 0) / 60),
      muscles: [...new Set((d.items ?? []).map((it) => it.exercise?.muscle_group).filter(Boolean))] as MuscleGroup[],
    }))
    const trainDays = perDay.filter((x) => x.sets > 0)
    const avgMins = trainDays.length ? Math.round(trainDays.reduce((s, x) => s + x.mins, 0) / trainDays.length) : 0
    const split = Object.entries(muscles).sort((a, b) => b[1] - a[1]) as [MuscleGroup, number][]
    return { exercises: items.length, totalSets, perDay, avgMins, split, equip: [...equip] }
  }, [prog])

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
      <div className="ps-page db wk">
        <DesignStyles /><WorkoutStyles />
        <Skeleton w={120} h={16} />
        <div style={{ marginTop: 14, display: "grid", gap: 14 }}>
          <Skeleton w="100%" h={200} r={22} />
          <Skeleton w="100%" h={110} r={18} />
          <Skeleton w="100%" h={360} r={18} />
        </div>
      </div>
    )
  }

  if (notFound || !prog) {
    return (
      <div className="ps-page db wk">
        <DesignStyles /><WorkoutStyles />
        <div className="wk-crumbs"><Link href="/dashboard/workouts"><ChevronLeft size={16} /> Workouts</Link></div>
        <div className="wk-empty"><span className="wk-empty-icon"><Dumbbell size={20} /></span><strong>Plan not found</strong><p>It may have been deleted.</p></div>
      </div>
    )
  }

  const isOwn = !!prog.org_id
  const t = goalTheme(prog.goal)
  const maxSplit = summary.split[0]?.[1] ?? 1

  return (
    <div className="ps-page db wk wv" style={{ ["--g1" as string]: t.from, ["--g2" as string]: t.to, ["--gs" as string]: t.soft, ["--gt" as string]: t.text } as React.CSSProperties}>
      <DesignStyles />
      <WorkoutStyles />
      <style>{WV_CSS}</style>

      <div className="wk-crumbs">
        <Link href="/dashboard/workouts"><ChevronLeft size={16} /> Workouts</Link>
        <span>/</span><b>{prog.name}</b>
      </div>

      <section className="wv-hero">
        <div className="wv-hero-top">
          <span className="wv-hero-icon"><Dumbbell size={26} /></span>
          <div className="wv-hero-id">
            <span className="wv-kind">{isOwn ? (prog.is_template ? "Your template" : "Workout plan") : "Built-in template"}</span>
            <h1>{prog.name}</h1>
            <div className="wv-tags">
              <span>{GOAL_LABELS[prog.goal]}</span>
              <span><DifficultyBars d={prog.difficulty} />{DIFFICULTY_LABELS[prog.difficulty]}</span>
              {isOwn && (prog.assigned_count ?? 0) > 0 && <span><Users size={12} />{prog.assigned_count} on it</span>}
            </div>
          </div>
          <div className="wv-actions">
            <button type="button" className="wv-glass wv-hide-sm" onClick={() => window.print()}><Printer size={15} /><span>Print</span></button>
            {isOwn ? (
              <>
                <button type="button" className="wv-glass" onClick={duplicate} disabled={cloning}>
                  {cloning ? <Loader2 size={15} className="ps-spin" /> : <Copy size={15} />}<span>Duplicate</span>
                </button>
                <Link href={`/dashboard/workouts/${id}/edit`} className="wv-glass wv-glass--solid"><Pencil size={15} /><span>Edit plan</span></Link>
              </>
            ) : (
              <button type="button" className="wv-glass wv-glass--solid" onClick={duplicate} disabled={cloning}>
                {cloning ? <Loader2 size={15} className="ps-spin" /> : <Copy size={15} />}<span>Use this template</span>
              </button>
            )}
          </div>
        </div>
        <div className="wv-stats">
          <div><CalendarDays size={16} /><span><small>Per week</small><b>{prog.days_per_week} days</b></span></div>
          <div><Clock size={16} /><span><small>Runs for</small><b>{prog.duration_weeks} weeks</b></span></div>
          <div><Layers size={16} /><span><small>Exercises</small><b>{summary.exercises}</b></span></div>
          <div><Activity size={16} /><span><small>Sets a week</small><b>{summary.totalSets}</b></span></div>
          <div><Timer size={16} /><span><small>Avg session</small><b>{summary.avgMins ? `~${summary.avgMins} min` : "—"}</b></span></div>
        </div>
      </section>

      {/* Week at a glance */}
      {summary.perDay.length > 0 && (
        <div className="wv-week">
          {summary.perDay.map(({ d, sets, mins, muscles }) => (
            <div key={d.id} className="wv-day" data-rest={sets === 0}>
              <small>Day {d.day_number}</small>
              <strong title={d.day_name}>{d.day_name}</strong>
              <span className="wv-day-meta">{sets ? `${d.items?.length} ex · ${sets} sets · ~${mins}m` : "Rest day"}</span>
              <span className="wv-day-dots">{muscles.slice(0, 6).map((m) => <i key={m} title={MUSCLE_GROUP_LABELS[m]} style={{ background: MUSCLE_COLOR[m] }} />)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="wv-layout">
        <div className="wv-main">
          {prog.days && prog.days.length > 0 ? (
            <WorkoutDayTabs days={prog.days} cats={cats} />
          ) : (
            <div className="wk-empty">
              <span className="wk-empty-icon"><Dumbbell size={20} /></span>
              <strong>No training days yet</strong>
              {isOwn && <Link href={`/dashboard/workouts/${id}/edit`} className="ps-btn ps-btn--primary ps-btn--sm">Add days</Link>}
            </div>
          )}
        </div>

        <aside className="wv-side">
          <section className="wv-card">
            <h3><Activity size={15} /> Muscle split</h3>
            {summary.split.length === 0 ? <p className="wv-muted">No exercises yet.</p> : (
              <>
                <div className="wv-splitbar">
                  {summary.split.map(([m, n]) => <i key={m} style={{ flexGrow: n, background: MUSCLE_COLOR[m] }} title={`${MUSCLE_GROUP_LABELS[m]}: ${n} sets`} />)}
                </div>
                <div className="wv-split">
                  {summary.split.map(([m, n]) => (
                    <div key={m} className="wv-split-row">
                      <span><i style={{ background: MUSCLE_COLOR[m] }} />{MUSCLE_GROUP_LABELS[m]}</span>
                      <span className="wv-split-track"><i style={{ width: `${(n / maxSplit) * 100}%`, background: MUSCLE_COLOR[m] }} /></span>
                      <b>{n}</b>
                    </div>
                  ))}
                </div>
                <p className="wv-muted" style={{ marginTop: 8 }}>Sets per week, by muscle group</p>
              </>
            )}
          </section>

          {summary.equip.length > 0 && (
            <section className="wv-card">
              <h3><Wrench size={15} /> Equipment needed</h3>
              <div className="wv-equip">{summary.equip.map((e) => <span key={e}>{EQUIPMENT_LABELS[e] ?? e}</span>)}</div>
            </section>
          )}

          {prog.notes && (
            <section className="wv-card wv-notes">
              <h3><StickyNote size={15} /> Trainer notes</h3>
              <p>{prog.notes}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

// NOTE: no backticks inside this CSS.
const WV_CSS = `
.wv-hero { position: relative; overflow: hidden; isolation: isolate; border-radius: 22px; padding: 20px 22px 16px; color: #fff; background: radial-gradient(520px 220px at 90% -20%, rgba(255,255,255,0.28), transparent 60%), linear-gradient(120deg, var(--g1), var(--g2)); box-shadow: 0 18px 40px -22px var(--g2); }
.wv-hero-top { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.wv-hero-icon { width: 58px; height: 58px; border-radius: 17px; display: grid; place-items: center; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.32); flex-shrink: 0; }
.wv-hero-id { flex: 1; min-width: 220px; }
.wv-kind { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.85; }
.wv-hero-id h1 { margin: 2px 0 8px; font-size: 28px; font-weight: 760; letter-spacing: -0.025em; color: #fff; line-height: 1.1; }
.wv-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.wv-tags span { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 11px; border-radius: 13px; font-size: 12.5px; font-weight: 650; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.26); }
.wv-tags .wk-diff { color: #fff; }
.wv-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.wv-glass { display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.15); color: #fff; font: inherit; font-size: 14px; font-weight: 620; cursor: pointer; text-decoration: none; backdrop-filter: blur(10px); }
.wv-glass:hover { background: rgba(255,255,255,0.26); }
.wv-glass--solid { background: #fff; color: var(--gt); border-color: #fff; }
.wv-glass--solid:hover { background: var(--gs); }
.wv-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-top: 18px; }
.wv-stats > div { display: flex; align-items: center; gap: 10px; padding: 11px 13px; border-radius: 14px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.2); min-width: 0; }
.wv-stats span { display: flex; flex-direction: column; min-width: 0; }
.wv-stats small { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.8; }
.wv-stats b { font-size: 17px; font-weight: 740; white-space: nowrap; }

.wv-week { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 14px 0; }
.wv-day { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; background: #fff; border: 1px solid var(--wk-line); overflow: hidden; }
.wv-day::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 3px; background: linear-gradient(90deg, var(--g1), var(--g2)); }
.wv-day[data-rest="true"] { background: #fafbfc; } .wv-day[data-rest="true"]::before { background: #d1d1d6; }
.wv-day small { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--gt); }
.wv-day strong { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wv-day-meta { font-size: 12px; color: var(--text-tertiary); }
.wv-day-dots { display: flex; gap: 4px; margin-top: 6px; min-height: 8px; }
.wv-day-dots i { width: 8px; height: 8px; border-radius: 50%; }

.wv-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
.wv-main { min-width: 0; }
.wv-side { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 16px; }
.wv-card { background: #fff; border: 1px solid var(--wk-line); border-radius: 16px; padding: 14px 16px; }
.wv-card h3 { margin: 0 0 12px; display: flex; align-items: center; gap: 7px; font-size: 14.5px; font-weight: 700; }
.wv-card h3 svg { color: var(--gt); }
.wv-muted { margin: 0; font-size: 12.5px; color: var(--text-tertiary); }
.wv-splitbar { display: flex; gap: 2px; height: 10px; border-radius: 6px; overflow: hidden; margin-bottom: 12px; }
.wv-split { display: flex; flex-direction: column; gap: 7px; }
.wv-split-row { display: grid; grid-template-columns: 96px minmax(0, 1fr) 26px; align-items: center; gap: 8px; font-size: 13px; }
.wv-split-row > span:first-child { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.wv-split-row > span:first-child i { width: 8px; height: 8px; border-radius: 50%; }
.wv-split-track { height: 6px; border-radius: 4px; background: #f0f1f4; overflow: hidden; }
.wv-split-track i { display: block; height: 100%; border-radius: 4px; }
.wv-split-row b { text-align: right; font-variant-numeric: tabular-nums; }
.wv-equip { display: flex; flex-wrap: wrap; gap: 6px; }
.wv-equip span { height: 28px; padding: 0 11px; border-radius: 14px; display: inline-flex; align-items: center; font-size: 12.5px; font-weight: 600; background: var(--gs); color: var(--gt); }
.wv-notes p { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--text-secondary); white-space: pre-wrap; }

@media (max-width: 1100px) {
  .wv-layout { grid-template-columns: minmax(0, 1fr); }
  .wv-side { position: static; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
  .wv-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  .wv-hero { padding: 16px; border-radius: 20px; }
  .wv-hero-icon { width: 48px; height: 48px; }
  .wv-hero-id h1 { font-size: 22px; }
  .wv-actions { width: 100%; margin-left: 0; }
  .wv-actions .wv-glass { flex: 1; justify-content: center; }
  .wv-hide-sm { display: none !important; }
  .wv-stats { display: flex; overflow-x: auto; margin: 14px -16px 0; padding: 0 16px; scrollbar-width: none; }
  .wv-stats > div { flex: 0 0 auto; min-width: 135px; }
  .wv-week { display: flex; overflow-x: auto; scrollbar-width: none; margin: 12px -10px; padding: 0 10px; }
  .wv-day { flex: 0 0 150px; }
}
@media print {
  .ps-sidebar, nav, .wv-actions, .wk-crumbs { display: none !important; }
  .wv-hero { box-shadow: none; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wv-layout { grid-template-columns: minmax(0, 1fr); }
}
`

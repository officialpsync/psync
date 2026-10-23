"use client"
// app/dashboard/workouts/page.tsx
// Plan library: your plans and built-in templates, with goal / level filters, sort and grid or list view.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Dumbbell, Plus, Search, Loader2, Users, Copy, Trash2, Layers, Library, CalendarDays, Clock,
  LayoutGrid, List, ChevronRight, Sparkles, Pencil,
} from "lucide-react"
import { DesignStyles } from "../components/DesignSystem"
import { Skeleton } from "../components/ui"
import { GOAL_LABELS, DIFFICULTY_LABELS, type WorkoutGoal, type Difficulty, type WorkoutProgram } from "@/lib/workout/types"
import { clonePlan } from "./components/planActions"
import { loadOrgContext, supabase } from "./components/shared"
import { WorkoutStyles, goalTheme, DifficultyBars, GOAL_THEME } from "./components/WorkoutTheme"

type Tab = "mine" | "templates"
type Sort = "recent" | "name" | "members" | "days"
type Layout = "grid" | "list"

const SORT_LABEL: Record<Sort, string> = { recent: "Newest", name: "Name A–Z", members: "Most members", days: "Days per week" }
const LAYOUT_KEY = "psync.workouts.layout"

function PlanCard({ p, isGlobal, busy, onClone, onDelete, layout }: {
  p: WorkoutProgram; isGlobal: boolean; busy: boolean; layout: Layout
  onClone: () => void; onDelete: () => void
}) {
  const t = goalTheme(p.goal)
  const members = p.assigned_count ?? 0
  return (
    <article className="wl-card" data-layout={layout} style={{ ["--g1" as string]: t.from, ["--g2" as string]: t.to, ["--gs" as string]: t.soft, ["--gt" as string]: t.text } as React.CSSProperties}>
      <Link href={`/dashboard/workouts/${p.id}`} className="wl-link">
        <div className="wl-band">
          <span className="wl-icon"><Dumbbell size={18} strokeWidth={2.3} /></span>
          <span className="wl-kind">{isGlobal ? "Built-in" : p.is_template ? "Template" : "Gym plan"}</span>
          {!isGlobal && members > 0 && <span className="wl-live"><Users size={12} />{members}</span>}
        </div>
        <div className="wl-body">
          <h3 title={p.name}>{p.name}</h3>
          <div className="wl-tags">
            <span className="wl-goal">{GOAL_LABELS[p.goal]}</span>
            <span className="wl-level"><DifficultyBars d={p.difficulty} />{DIFFICULTY_LABELS[p.difficulty]}</span>
          </div>
          <div className="wl-stats">
            <span><CalendarDays size={14} /><b>{p.days_per_week}</b> days/wk</span>
            <span><Clock size={14} /><b>{p.duration_weeks}</b> weeks</span>
            {!isGlobal && <span className="wl-members"><Users size={14} /><b>{members}</b> {members === 1 ? "member" : "members"}</span>}
          </div>
          {p.notes && layout === "grid" && <p className="wl-notes">{p.notes}</p>}
        </div>
      </Link>
      <div className="wl-foot">
        <button type="button" className="wl-btn" onClick={onClone} disabled={busy}>
          {busy ? <Loader2 size={14} className="ps-spin" /> : <Copy size={14} />}
          {isGlobal ? "Use template" : "Duplicate"}
        </button>
        {!isGlobal && <Link href={`/dashboard/workouts/${p.id}/edit`} className="wl-btn"><Pencil size={14} />Edit</Link>}
        <span style={{ flex: 1 }} />
        {!isGlobal && <button type="button" className="wl-icon-btn" aria-label={`Delete ${p.name}`} onClick={onDelete}><Trash2 size={15} /></button>}
        <Link href={`/dashboard/workouts/${p.id}`} className="wl-icon-btn" aria-label="Open"><ChevronRight size={16} /></Link>
      </div>
    </article>
  )
}

export default function WorkoutsPage() {
  const router = useRouter()
  const [ctx, setCtx] = useState<{ orgId: string; userId: string } | null>(null)
  const [tab, setTab] = useState<Tab>("mine")
  const [mine, setMine] = useState<WorkoutProgram[]>([])
  const [templates, setTemplates] = useState<WorkoutProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [goal, setGoal] = useState<WorkoutGoal | "all">("all")
  const [level, setLevel] = useState<Difficulty | "all">("all")
  const [days, setDays] = useState<number | "all">("all")
  const [sort, setSort] = useState<Sort>("recent")
  const [layout, setLayout] = useState<Layout>("grid")
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => { try { const v = localStorage.getItem(LAYOUT_KEY); if (v === "list" || v === "grid") setLayout(v) } catch { /* ignore */ } }, [])
  function changeLayout(l: Layout) { setLayout(l); try { localStorage.setItem(LAYOUT_KEY, l) } catch { /* ignore */ } }

  useEffect(() => {
    async function init() {
      const c = await loadOrgContext()
      if (!c) { setLoading(false); return }
      setCtx({ orgId: c.orgId, userId: c.userId })
      const [{ data: own }, { data: tmpl }] = await Promise.all([
        supabase.from("workout_programs").select("*").eq("org_id", c.orgId).order("created_at", { ascending: false }),
        supabase.from("workout_programs").select("*").is("org_id", null).eq("is_template", true).order("goal").order("name"),
      ])
      const list = (own as WorkoutProgram[]) ?? []
      if (list.length) {
        const { data: rows } = await supabase.from("member_workout_programs")
          .select("program_id").in("program_id", list.map((p) => p.id)).eq("status", "active")
        const counts: Record<string, number> = {}
        ;((rows as { program_id: string }[]) ?? []).forEach((r) => { counts[r.program_id] = (counts[r.program_id] ?? 0) + 1 })
        list.forEach((p) => { p.assigned_count = counts[p.id] ?? 0 })
      }
      setMine(list)
      setTemplates((tmpl as WorkoutProgram[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  async function handleClone(p: WorkoutProgram) {
    if (!ctx) return
    setBusyId(p.id)
    try {
      const id = await clonePlan(p.id, ctx.orgId, ctx.userId)
      router.push(`/dashboard/workouts/${id}/edit`)
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't copy the plan")
      setBusyId(null)
    }
  }

  async function handleDelete(p: WorkoutProgram) {
    if ((p.assigned_count ?? 0) > 0) {
      alert(`${p.assigned_count} member${p.assigned_count === 1 ? " is" : "s are"} on "${p.name}". Move them to another plan first.`)
      return
    }
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return
    const { error } = await supabase.from("workout_programs").delete().eq("id", p.id).eq("org_id", ctx?.orgId ?? "")
    if (error) { alert("Couldn't delete: " + error.message); return }
    setMine((prev) => prev.filter((x) => x.id !== p.id))
  }

  const list = tab === "mine" ? mine : templates
  const goalCounts = useMemo(() => {
    const m: Record<string, number> = {}
    list.forEach((p) => { m[p.goal] = (m[p.goal] ?? 0) + 1 })
    return m
  }, [list])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const r = list.filter((p) =>
      (!term || p.name.toLowerCase().includes(term) || (p.notes ?? "").toLowerCase().includes(term)) &&
      (goal === "all" || p.goal === goal) &&
      (level === "all" || p.difficulty === level) &&
      (days === "all" || p.days_per_week === days))
    const by: Record<Sort, (a: WorkoutProgram, b: WorkoutProgram) => number> = {
      recent: (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      name: (a, b) => a.name.localeCompare(b.name),
      members: (a, b) => (b.assigned_count ?? 0) - (a.assigned_count ?? 0),
      days: (a, b) => a.days_per_week - b.days_per_week,
    }
    return [...r].sort(by[sort])
  }, [list, search, goal, level, days, sort])

  const onPlan = mine.reduce((s, p) => s + (p.assigned_count ?? 0), 0)
  const yourTemplates = mine.filter((p) => p.is_template).length
  const inUse = mine.filter((p) => (p.assigned_count ?? 0) > 0).length
  const anyFilter = goal !== "all" || level !== "all" || days !== "all" || !!search

  return (
    <div className="ps-page db wk">
      <DesignStyles />
      <WorkoutStyles />
      <style>{WL_CSS}</style>

      <header className="wk-head">
        <div className="wk-title">
          <span className="wk-title-icon"><Dumbbell size={21} /></span>
          <div>
            <h1>Workouts</h1>
            <p>{loading ? "\u00a0" : `${mine.length} plan${mine.length === 1 ? "" : "s"} · ${onPlan} member${onPlan === 1 ? "" : "s"} training`}</p>
          </div>
        </div>
        <div className="wk-kpis">
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-purple"><Dumbbell size={15} /></span><div><small>Your plans</small><b>{loading ? "–" : mine.length}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-green"><Users size={15} /></span><div><small>Members on a plan</small><b>{loading ? "–" : onPlan}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-amber"><Sparkles size={15} /></span><div><small>Plans in use</small><b>{loading ? "–" : inUse}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-blue"><Layers size={15} /></span><div><small>Your templates</small><b>{loading ? "–" : yourTemplates}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-teal"><Library size={15} /></span><div><small>Built-in</small><b>{loading ? "–" : templates.length}</b></div></div>
        </div>
        <div className="wk-actions">
          <Link href="/dashboard/workouts/exercises" className="ps-btn ps-btn--secondary"><Library size={16} /><span>Exercises</span></Link>
          <Link href="/dashboard/workouts/new" className="ps-btn ps-btn--primary"><Plus size={16} strokeWidth={2.4} /><span>New plan</span></Link>
        </div>
      </header>

      <div className="wk-toolbar">
        <div className="wk-row">
          <div className="wk-seg" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "mine"} onClick={() => setTab("mine")}>Your plans <span>{mine.length}</span></button>
            <button type="button" role="tab" aria-selected={tab === "templates"} onClick={() => setTab("templates")}>Templates <span>{templates.length}</span></button>
          </div>
          <label className="wk-search"><Search size={16} />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plans and notes" aria-label="Search plans" />
          </label>
          <select className="wk-select" value={level} onChange={(e) => setLevel(e.target.value as Difficulty | "all")} aria-label="Level">
            <option value="all">All levels</option>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
          </select>
          <select className="wk-select" value={String(days)} onChange={(e) => setDays(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Days per week">
            <option value="all">Any days/week</option>
            {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} days / week</option>)}
          </select>
          <select className="wk-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => <option key={s} value={s}>{SORT_LABEL[s]}</option>)}
          </select>
          <div className="wk-seg" aria-label="Layout">
            <button type="button" aria-pressed={layout === "grid"} onClick={() => changeLayout("grid")} aria-label="Grid"><LayoutGrid size={15} /></button>
            <button type="button" aria-pressed={layout === "list"} onClick={() => changeLayout("list")} aria-label="List"><List size={15} /></button>
          </div>
        </div>
        <div className="wk-chips" role="group" aria-label="Filter by goal">
          <button type="button" className="wk-chip" aria-pressed={goal === "all"} onClick={() => setGoal("all")}>All goals <em>{list.length}</em></button>
          {(Object.keys(GOAL_LABELS) as WorkoutGoal[]).map((g) => (
            <button key={g} type="button" className="wk-chip" aria-pressed={goal === g} onClick={() => setGoal(goal === g ? "all" : g)}
              style={{ ["--chip" as string]: `linear-gradient(135deg, ${GOAL_THEME[g].from}, ${GOAL_THEME[g].to})` } as React.CSSProperties}>
              <i style={{ background: GOAL_THEME[g].from }} />{GOAL_LABELS[g]} <em>{goalCounts[g] ?? 0}</em>
            </button>
          ))}
          {anyFilter && <button type="button" className="wl-clear" onClick={() => { setGoal("all"); setLevel("all"); setDays("all"); setSearch("") }}>Clear filters</button>}
        </div>
      </div>

      {loading ? (
        <div className="wl-grid">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} w="100%" h={230} r={18} />)}</div>
      ) : tab === "mine" && mine.length === 0 ? (
        <div className="wk-empty">
          <span className="wk-empty-icon"><Dumbbell size={20} /></span>
          <strong>Build your first plan</strong>
          <p>Start from scratch, or pick one of {templates.length} built-in templates and make it yours.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => setTab("templates")}><Library size={14} /> Browse templates</button>
            <Link href="/dashboard/workouts/new" className="ps-btn ps-btn--primary ps-btn--sm"><Plus size={14} /> New plan</Link>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="wk-empty">
          <span className="wk-empty-icon"><Search size={20} /></span>
          <strong>Nothing matches</strong>
          <p>Try a different search, goal or level.</p>
        </div>
      ) : (
        <div className="wl-grid" data-layout={layout}>
          {filtered.map((p) => (
            <PlanCard key={p.id} p={p} isGlobal={!p.org_id} busy={busyId === p.id} layout={layout}
              onClone={() => handleClone(p)} onDelete={() => handleDelete(p)} />
          ))}
          {tab === "mine" && layout === "grid" && (
            <Link href="/dashboard/workouts/new" className="wl-add">
              <span><Plus size={20} /></span>
              <strong>New plan</strong>
              <small>Start from scratch</small>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

// NOTE: no backticks inside this CSS.
const WL_CSS = `
.wl-clear { flex: 0 0 auto; border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; padding: 0 6px; }
.wl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.wl-grid[data-layout="list"] { grid-template-columns: minmax(0, 1fr); gap: 8px; }

.wl-card { display: flex; flex-direction: column; background: #fff; border: 1px solid var(--wk-line); border-radius: 18px; overflow: hidden; transition: box-shadow 160ms, transform 160ms; }
.wl-card:hover { box-shadow: 0 14px 30px -16px rgba(15,23,42,0.35); transform: translateY(-2px); }
.wl-link { display: flex; flex-direction: column; color: inherit; text-decoration: none; flex: 1; }
.wl-band { position: relative; display: flex; align-items: center; gap: 8px; height: 64px; padding: 0 14px; color: #fff; background: radial-gradient(160px 80px at 90% -20%, rgba(255,255,255,0.35), transparent 70%), linear-gradient(120deg, var(--g1), var(--g2)); }
.wl-icon { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.3); }
.wl-kind { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.92; }
.wl-live { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 12px; background: rgba(255,255,255,0.95); color: var(--gt); font-size: 12px; font-weight: 700; }
.wl-body { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 9px; }
.wl-body h3 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wl-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.wl-goal { height: 24px; padding: 0 10px; border-radius: 12px; display: inline-flex; align-items: center; font-size: 12px; font-weight: 650; background: var(--gs); color: var(--gt); }
.wl-level { height: 24px; padding: 0 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; background: #f2f3f6; color: var(--text-secondary); }
.wl-level .wk-diff { color: var(--gt); }
.wl-stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; color: var(--text-secondary); }
.wl-stats span { display: inline-flex; align-items: center; gap: 5px; }
.wl-stats svg { color: var(--text-tertiary); }
.wl-stats b { color: var(--text-primary); font-weight: 700; }
.wl-members b { color: var(--gt); }
.wl-notes { margin: 0; font-size: 12.5px; color: var(--text-tertiary); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.wl-foot { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--wk-line); background: #fbfbfd; }
.wl-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--wk-line); background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; text-decoration: none; }
.wl-btn:hover { border-color: var(--g1); color: var(--gt); }
.wl-icon-btn { width: 32px; height: 32px; border-radius: 9px; border: none; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; text-decoration: none; }
.wl-icon-btn:hover { background: #eef0f4; color: var(--text-primary); }

.wl-card[data-layout="list"] { flex-direction: row; align-items: stretch; border-radius: 14px; }
.wl-card[data-layout="list"]:hover { transform: none; }
.wl-card[data-layout="list"] .wl-link { flex-direction: row; align-items: center; }
.wl-card[data-layout="list"] .wl-band { width: 6px; height: auto; align-self: stretch; padding: 0; }
.wl-card[data-layout="list"] .wl-band > * { display: none; }
.wl-card[data-layout="list"] .wl-body { flex-direction: row; align-items: center; gap: 16px; padding: 12px 16px; flex: 1; min-width: 0; }
.wl-card[data-layout="list"] .wl-body h3 { flex: 1; min-width: 0; font-size: 15px; }
.wl-card[data-layout="list"] .wl-foot { border-top: none; border-left: 1px solid var(--wk-line); }

.wl-add { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 230px; border: 1.5px dashed #c9cfda; border-radius: 18px; color: var(--accent); text-decoration: none; background: #fafbff; transition: border-color 150ms; }
.wl-add:hover { border-color: var(--accent); }
.wl-add span { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: linear-gradient(135deg, #0a66d6, #3c4fe0); color: #fff; margin-bottom: 4px; }
.wl-add strong { font-size: 15px; } .wl-add small { font-size: 12.5px; color: var(--text-tertiary); }

@media (max-width: 900px) {
  .wl-card[data-layout="list"] .wl-body { flex-wrap: wrap; gap: 8px; }
  .wl-card[data-layout="list"] .wl-body h3 { flex-basis: 100%; }
}
@media (max-width: 760px) {
  .wl-grid { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .wl-card[data-layout="list"] { flex-direction: column; }
  .wl-card[data-layout="list"] .wl-foot { border-left: none; border-top: 1px solid var(--wk-line); }
  .wl-btn { height: 38px; }
}
`

"use client"
// app/dashboard/workouts/templates/page.tsx
// Exercise templates library: browse built-in programs and custom templates, preview, and clone for members.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Dumbbell, Plus, Search, Loader2, Copy, ChevronRight, Library, CalendarDays, Clock,
  LayoutGrid, List, Sparkles, Filter, ChevronLeft, ArrowLeft
} from "lucide-react"
import { DesignStyles } from "../../components/DesignSystem"
import { Skeleton } from "../../components/ui"
import { GOAL_LABELS, DIFFICULTY_LABELS, type WorkoutGoal, type Difficulty, type WorkoutProgram } from "@/lib/workout/types"
import { clonePlan } from "../components/planActions"
import { loadOrgContext, supabase } from "../components/shared"
import { WorkoutStyles, goalTheme, DifficultyBars } from "../components/WorkoutTheme"

type SourceFilter = "all" | "builtin" | "custom"
type Sort = "recent" | "name" | "days"
type Layout = "grid" | "list"

const SORT_LABEL: Record<Sort, string> = { recent: "Newest", name: "Name A–Z", days: "Days per week" }
const LAYOUT_KEY = "psync.workouts.templates.layout"

function TemplateCard({
  p,
  isGlobal,
  busy,
  onClone,
  layout,
}: {
  p: WorkoutProgram
  isGlobal: boolean
  busy: boolean
  layout: Layout
  onClone: () => void
}) {
  const t = goalTheme(p.goal)
  return (
    <article
      className="wl-card"
      data-layout={layout}
      style={{
        ["--g1" as string]: t.from,
        ["--g2" as string]: t.to,
        ["--gs" as string]: t.soft,
        ["--gt" as string]: t.text,
      } as React.CSSProperties}
    >
      <Link href={`/dashboard/workouts/${p.id}`} className="wl-link">
        <div className="wl-band">
          <span className="wl-icon"><Dumbbell size={18} strokeWidth={2.3} /></span>
          <span className="wl-kind">{isGlobal ? "Built-in" : "Gym Template"}</span>
          <span className="wl-live"><Sparkles size={12} />Preset</span>
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
          </div>
          {p.notes && layout === "grid" && <p className="wl-notes">{p.notes}</p>}
        </div>
      </Link>
      <div className="wl-foot">
        <button type="button" className="wl-btn" onClick={onClone} disabled={busy} title="Create gym plan from this template">
          {busy ? <Loader2 size={14} className="ps-spin" /> : <Copy size={14} />}
          Use template
        </button>
        <span style={{ flex: 1 }} />
        <Link href={`/dashboard/workouts/${p.id}`} className="wl-icon-btn" aria-label="Open template details" title="View details">
          <ChevronRight size={16} />
        </Link>
      </div>
    </article>
  )
}

export default function ExerciseTemplatesPage() {
  const router = useRouter()
  const [ctx, setCtx] = useState<{ orgId: string; userId: string } | null>(null)
  const [builtIn, setBuiltIn] = useState<WorkoutProgram[]>([])
  const [custom, setCustom] = useState<WorkoutProgram[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [source, setSource] = useState<SourceFilter>("all")
  const [goal, setGoal] = useState<WorkoutGoal | "all">("all")
  const [level, setLevel] = useState<Difficulty | "all">("all")
  const [days, setDays] = useState<number | "all">("all")
  const [sort, setSort] = useState<Sort>("name")
  const [layout, setLayout] = useState<Layout>("grid")
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    try {
      const v = localStorage.getItem(LAYOUT_KEY)
      if (v === "list" || v === "grid") setLayout(v)
    } catch { /* ignore */ }
  }, [])

  function changeLayout(l: Layout) {
    setLayout(l)
    try { localStorage.setItem(LAYOUT_KEY, l) } catch { /* ignore */ }
  }

  useEffect(() => {
    async function init() {
      const c = await loadOrgContext()
      if (!c) { setLoading(false); return }
      setCtx({ orgId: c.orgId, userId: c.userId })
      const [{ data: globalTemplates }, { data: gymTemplates }] = await Promise.all([
        supabase
          .from("workout_programs")
          .select("*")
          .is("org_id", null)
          .eq("is_template", true)
          .order("goal")
          .order("name"),
        supabase
          .from("workout_programs")
          .select("*")
          .eq("org_id", c.orgId)
          .eq("is_template", true)
          .order("created_at", { ascending: false }),
      ])
      setBuiltIn((globalTemplates as WorkoutProgram[]) ?? [])
      setCustom((gymTemplates as WorkoutProgram[]) ?? [])
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
      alert(e instanceof Error ? e.message : "Couldn't copy the template")
      setBusyId(null)
    }
  }

  const allTemplates = useMemo(() => {
    if (source === "builtin") return builtIn.map((p) => ({ ...p, isGlobal: true }))
    if (source === "custom") return custom.map((p) => ({ ...p, isGlobal: false }))
    return [
      ...custom.map((p) => ({ ...p, isGlobal: false })),
      ...builtIn.map((p) => ({ ...p, isGlobal: true })),
    ]
  }, [source, builtIn, custom])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const r = allTemplates.filter((p) =>
      (!term || p.name.toLowerCase().includes(term) || (p.notes ?? "").toLowerCase().includes(term)) &&
      (goal === "all" || p.goal === goal) &&
      (level === "all" || p.difficulty === level) &&
      (days === "all" || p.days_per_week === days)
    )
    const by: Record<Sort, (a: WorkoutProgram, b: WorkoutProgram) => number> = {
      recent: (a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      name: (a, b) => a.name.localeCompare(b.name),
      days: (a, b) => a.days_per_week - b.days_per_week,
    }
    return [...r].sort(by[sort])
  }, [allTemplates, search, goal, level, days, sort])

  return (
    <div className="ps-page db wk">
      <DesignStyles />
      <WorkoutStyles />
      <style>{WL_CSS}</style>

      <header className="wk-head">
        <div className="wk-title">
          <Link href="/dashboard/workouts" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none", marginBottom: 6 }}>
            <ArrowLeft size={14} /> Back to Exercise plans
          </Link>
          <div>
            <h1>Exercise Templates</h1>
            <p>{loading ? "\u00a0" : `${allTemplates.length} workout templates available (${builtIn.length} built-in, ${custom.length} custom)`}</p>
          </div>
        </div>
        <div className="wk-actions">
          <Link href="/dashboard/workouts" className="ps-btn ps-btn--secondary">
            <Dumbbell size={16} /><span>Exercise plans</span>
          </Link>
          <Link href="/dashboard/workouts/exercises" className="ps-btn ps-btn--secondary">
            <Library size={16} /><span>Exercises</span>
          </Link>
          <Link href="/dashboard/workouts/new?template=true" className="ps-btn ps-btn--primary">
            <Plus size={16} strokeWidth={2.4} /><span>New template</span>
          </Link>
        </div>
      </header>

      <div className="wk-toolbar">
        <div className="wk-row">
          <div className="wk-seg" role="tablist">
            <button type="button" role="tab" aria-selected={source === "all"} onClick={() => setSource("all")}>
              All <span>{builtIn.length + custom.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={source === "builtin"} onClick={() => setSource("builtin")}>
              Built-in <span>{builtIn.length}</span>
            </button>
            <button type="button" role="tab" aria-selected={source === "custom"} onClick={() => setSource("custom")}>
              Custom <span>{custom.length}</span>
            </button>
          </div>
          <label className="wk-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates by name or muscle focus..."
              aria-label="Search templates"
            />
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

        <div className="wk-goal-row">
          <div className="wk-pill-scroll">
            <button type="button" className={`wk-pill ${goal === "all" ? "wk-pill--active" : ""}`} onClick={() => setGoal("all")}>
              All goals
            </button>
            {(Object.keys(GOAL_LABELS) as WorkoutGoal[]).map((g) => (
              <button
                key={g}
                type="button"
                className={`wk-pill ${goal === g ? "wk-pill--active" : ""}`}
                onClick={() => setGoal(g)}
              >
                {GOAL_LABELS[g]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="wl-grid" data-layout={layout}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wl-card" style={{ minHeight: 200, padding: 16 }}>
              <Skeleton width="40%" height={20} />
              <div style={{ marginTop: 12 }}><Skeleton width="70%" height={14} /></div>
              <div style={{ marginTop: 8 }}><Skeleton width="50%" height={14} /></div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "64px 20px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16 }}>
          <Sparkles size={36} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 6px" }}>No templates found</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 0 16px" }}>
            Try adjusting your search query or filters.
          </p>
          <button
            type="button"
            className="ps-btn ps-btn--secondary"
            onClick={() => { setSearch(""); setGoal("all"); setLevel("all"); setDays("all"); setSource("all"); }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="wl-grid" data-layout={layout}>
          {filtered.map((p) => (
            <TemplateCard
              key={p.id}
              p={p}
              isGlobal={p.isGlobal}
              busy={busyId === p.id}
              layout={layout}
              onClone={() => handleClone(p)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const WL_CSS = `
.wl-clear { flex: 0 0 auto; border: none; background: none; font: inherit; font-size: 13px; font-weight: 650; color: var(--accent); cursor: pointer; padding: 0 6px; }
.wl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
.wl-grid[data-layout="list"] { grid-template-columns: minmax(0, 1fr); gap: 8px; }

.wl-card { display: flex; flex-direction: column; background: var(--surface, #fff); border: 1px solid var(--wk-line); border-radius: 18px; overflow: hidden; transition: box-shadow 160ms, transform 160ms; color: var(--text-primary); }
.wl-card:hover { box-shadow: var(--shadow-md, 0 14px 30px -16px rgba(15,23,42,0.35)); transform: translateY(-2px); }
.wl-link { display: flex; flex-direction: column; color: inherit; text-decoration: none; flex: 1; }
.wl-band { position: relative; display: flex; align-items: center; gap: 8px; height: 64px; padding: 0 14px; color: #fff; background: radial-gradient(160px 80px at 90% -20%, rgba(255,255,255,0.35), transparent 70%), linear-gradient(120deg, var(--g1), var(--g2)); }
.wl-icon { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: rgba(255,255,255,0.22); border: 1px solid rgba(255,255,255,0.3); }
.wl-kind { font-size: 11.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.92; }
.wl-live { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px; border-radius: 12px; background: rgba(255,255,255,0.95); color: var(--gt); font-size: 12px; font-weight: 700; }
.wl-body { padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 9px; }
.wl-body h3 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
.wl-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.wl-goal { height: 24px; padding: 0 10px; border-radius: 12px; display: inline-flex; align-items: center; font-size: 12px; font-weight: 650; background: var(--gs); color: var(--gt); }
.wl-level { height: 24px; padding: 0 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; background: var(--surface-2, #f2f3f6); color: var(--text-secondary); }
.wl-level .wk-diff { color: var(--gt); }
.wl-stats { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; color: var(--text-secondary); }
.wl-stats span { display: inline-flex; align-items: center; gap: 5px; }
.wl-stats svg { color: var(--text-tertiary); }
.wl-stats b { color: var(--text-primary); font-weight: 700; }
.wl-notes { margin: 0; font-size: 12.5px; color: var(--text-tertiary); line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.wl-foot { display: flex; align-items: center; gap: 6px; padding: 10px 12px; border-top: 1px solid var(--wk-line); background: var(--surface-2, #fbfbfd); flex-wrap: wrap; }
.wl-btn { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--wk-line); background: var(--surface, #fff); font: inherit; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; text-decoration: none; }
.wl-btn:hover { border-color: var(--g1); color: var(--gt); background: var(--surface-3); }
.wl-icon-btn { width: 32px; height: 32px; border-radius: 9px; border: none; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; text-decoration: none; }
.wl-icon-btn:hover { background: var(--surface-3, #eef0f4); color: var(--text-primary); }

.wl-card[data-layout="list"] { flex-direction: row; align-items: stretch; border-radius: 14px; }
.wl-card[data-layout="list"]:hover { transform: none; }
.wl-card[data-layout="list"] .wl-link { flex-direction: row; align-items: center; }
.wl-card[data-layout="list"] .wl-band { width: 6px; height: auto; align-self: stretch; padding: 0; }
.wl-card[data-layout="list"] .wl-band > * { display: none; }
.wl-card[data-layout="list"] .wl-body { flex-direction: row; align-items: center; gap: 16px; padding: 12px 16px; flex: 1; min-width: 0; }
.wl-card[data-layout="list"] .wl-body h3 { flex: 1; min-width: 0; font-size: 15px; }
.wl-card[data-layout="list"] .wl-foot { border-top: none; border-left: 1px solid var(--wk-line); }

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

html[data-theme="dark"] .wl-card, html.dark .wl-card {
  background: var(--surface) !important;
  border-color: var(--border) !important;
}
html[data-theme="dark"] .wl-foot, html.dark .wl-foot {
  background: var(--surface-2) !important;
  border-color: var(--border) !important;
}
html[data-theme="dark"] .wl-btn, html.dark .wl-btn {
  background: var(--surface-2) !important;
  border-color: var(--border) !important;
  color: var(--text-primary) !important;
}
`
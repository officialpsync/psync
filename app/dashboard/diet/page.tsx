"use client"
// app/dashboard/diet/page.tsx
// All diet plans: status tabs with counts, search, type and calorie filters, sort, schedule progress,
// and quick edit / status change on each row.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Plus, Search, ChevronRight, Salad, Flame, Users, TrendingUp, Pencil, MoreHorizontal, Archive, CheckCircle2,
  BookOpen, Carrot, LayoutTemplate, CalendarClock,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Avatar, formatDate, Skeleton, useToast } from "../components/ui"
import { DesignStyles } from "../components/DesignSystem"
import { DietStyles } from "./components/DietTheme"

interface PlanRow {
  id: string; plan_mode: string; plan_days: number; start_date: string; target_kcal: number
  status: string; created_at: string; version_number: number | null
  members: { id: string; full_name: string } | null
}
type StatusTab = "active" | "draft" | "ending" | "older" | "all"
type Sort = "recent" | "start" | "kcal_hi" | "kcal_lo" | "name"

const MODE_LABEL: Record<string, string> = { recipe: "Standard", protein_heavy: "Protein heavy", ingredient: "Simple foods", manual: "Built by hand" }
const KCAL_BANDS = [
  { key: "lt1500", label: "Under 1,500", test: (k: number) => k < 1500 },
  { key: "1500", label: "1,500–2,000", test: (k: number) => k >= 1500 && k < 2000 },
  { key: "2000", label: "2,000–2,500", test: (k: number) => k >= 2000 && k < 2500 },
  { key: "2500", label: "2,500+", test: (k: number) => k >= 2500 },
] as const

function schedule(p: PlanRow) {
  const start = new Date(`${p.start_date}T00:00:00`)
  const end = new Date(start); end.setDate(end.getDate() + Math.max(1, p.plan_days) - 1)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const day = Math.floor((today.getTime() - start.getTime()) / 86400000) + 1
  const left = Math.ceil((end.getTime() - today.getTime()) / 86400000)
  return { end, day, left, started: day >= 1, done: left < 0, pct: Math.min(1, Math.max(0, day / Math.max(1, p.plan_days))) }
}

export default function DietPlansPage() {
  const { toast, show } = useToast()
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<StatusTab>("active")
  const [mode, setMode] = useState<string | null>(null)
  const [band, setBand] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>("recent")
  const [menu, setMenu] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) return
      const { data } = await supabase
        .from("member_diet_plans")
        .select("id, plan_mode, plan_days, start_date, target_kcal, status, created_at, version_number, members(id, full_name)")
        .eq("org_id", roleData.org_id)
        .order("created_at", { ascending: false })
        .limit(500)
      setPlans((data as unknown as PlanRow[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener("click", close)
    return () => window.removeEventListener("click", close)
  }, [menu])

  async function setStatus(p: PlanRow, status: string) {
    setMenu(null)
    if (status === "active" && p.members?.id) {
      await supabase.from("member_diet_plans").update({ status: "superseded" }).eq("member_id", p.members.id).eq("status", "active")
    }
    const { error } = await supabase.from("member_diet_plans").update({ status }).eq("id", p.id)
    if (error) { show("Couldn't update the plan", "error"); return }
    setPlans((prev) => prev.map((x) => {
      if (x.id === p.id) return { ...x, status }
      if (status === "active" && x.members?.id === p.members?.id && x.status === "active") return { ...x, status: "superseded" }
      return x
    }))
    show(status === "active" ? "Plan is now active" : status === "archived" ? "Plan archived" : "Plan updated")
  }

  const isEnding = (p: PlanRow) => { const s = schedule(p); return p.status === "active" && s.left >= 0 && s.left <= 3 }
  const isOlder = (p: PlanRow) => p.status === "superseded" || p.status === "archived"

  const counts = useMemo(() => ({
    active: plans.filter((p) => p.status === "active").length,
    draft: plans.filter((p) => p.status === "draft").length,
    ending: plans.filter(isEnding).length,
    older: plans.filter(isOlder).length,
    all: plans.length,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [plans])

  const modes = useMemo(() => [...new Set(plans.map((p) => p.plan_mode))], [plans])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(() => {
    const r = plans.filter((p) => {
      if (tab === "active" && p.status !== "active") return false
      if (tab === "draft" && p.status !== "draft") return false
      if (tab === "ending" && !isEnding(p)) return false
      if (tab === "older" && !isOlder(p)) return false
      if (mode && p.plan_mode !== mode) return false
      if (band && !KCAL_BANDS.find((b) => b.key === band)?.test(p.target_kcal)) return false
      return !q || (p.members?.full_name || "").toLowerCase().includes(q)
    })
    const by: Record<Sort, (a: PlanRow, b: PlanRow) => number> = {
      recent: (a, b) => b.created_at.localeCompare(a.created_at),
      start: (a, b) => b.start_date.localeCompare(a.start_date),
      kcal_hi: (a, b) => b.target_kcal - a.target_kcal,
      kcal_lo: (a, b) => a.target_kcal - b.target_kcal,
      name: (a, b) => (a.members?.full_name ?? "").localeCompare(b.members?.full_name ?? ""),
    }
    return [...r].sort(by[sort])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, tab, mode, band, q, sort])

  const stats = useMemo(() => {
    const active = plans.filter((p) => p.status === "active")
    const members = new Set(active.map((p) => p.members?.id).filter(Boolean)).size
    const avgKcal = active.length ? Math.round(active.reduce((s, p) => s + (p.target_kcal || 0), 0) / active.length) : 0
    const thisWeek = plans.filter((p) => Date.now() - new Date(p.created_at).getTime() < 7 * 86400000).length
    return { activeCount: active.length, members, avgKcal, thisWeek }
  }, [plans])

  const anyFilter = !!q || !!mode || !!band
  const TABS: { key: StatusTab; label: string }[] = [
    { key: "active", label: "Active" }, { key: "ending", label: "Ending soon" }, { key: "draft", label: "Drafts" },
    { key: "older", label: "Older" }, { key: "all", label: "All" },
  ]

  return (
    <div className="ps-page db dt">
      <DesignStyles />
      <DietStyles />
      <style>{DL_CSS}</style>

      <header className="dt-head">
        <div className="dt-title">
          <span className="dt-title-icon"><Salad size={21} /></span>
          <div>
            <h1>Diet plans</h1>
            <p>{loading ? "\u00a0" : `${stats.activeCount} active plan${stats.activeCount === 1 ? "" : "s"} across ${stats.members} member${stats.members === 1 ? "" : "s"}`}</p>
          </div>
        </div>
        <div className="dt-kpis">
          <div className="dt-kpi"><span className="dt-kpi-icon"><Salad size={15} /></span><div><small>Active plans</small><b>{loading ? "–" : stats.activeCount}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Users size={15} /></span><div><small>Members on a plan</small><b>{loading ? "–" : stats.members}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Flame size={15} /></span><div><small>Avg. target</small><b>{loading ? "–" : stats.avgKcal ? `${stats.avgKcal.toLocaleString("en-IN")} kcal` : "—"}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><TrendingUp size={15} /></span><div><small>New this week</small><b>{loading ? "–" : stats.thisWeek}</b></div></div>
        </div>
        <div className="dt-actions">
          <Link href="/dashboard/diet/templates" className="ps-btn ps-btn--secondary"><LayoutTemplate size={16} /><span>Templates</span></Link>
          <Link href="/dashboard/diet/recipes" className="ps-btn ps-btn--secondary dl-hide-md"><BookOpen size={16} /><span>Recipes</span></Link>
          <Link href="/dashboard/diet/ingredients" className="ps-btn ps-btn--secondary dl-hide-md"><Carrot size={16} /><span>Ingredients</span></Link>
          <Link href="/dashboard/diet/new" className="ps-btn ps-btn--primary"><Plus size={16} strokeWidth={2.4} /><span>New plan</span></Link>
        </div>
      </header>

      <div className="dt-toolbar">
        <div className="dt-row">
          <div className="dt-seg" role="tablist">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} <span>{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <label className="dt-search"><Search size={16} />
            <input type="search" enterKeyHint="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by member name" aria-label="Search diet plans" />
          </label>
          <select className="dt-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="recent">Newest first</option>
            <option value="start">Start date</option>
            <option value="kcal_hi">Calories: high to low</option>
            <option value="kcal_lo">Calories: low to high</option>
            <option value="name">Member A–Z</option>
          </select>
        </div>
        <div className="dt-chips">
          <button type="button" className="dt-chip" aria-pressed={!mode} onClick={() => setMode(null)}>All types</button>
          {modes.map((m) => (
            <button key={m} type="button" className="dt-chip" aria-pressed={mode === m} onClick={() => setMode(mode === m ? null : m)}>
              {MODE_LABEL[m] ?? m} <em>{plans.filter((p) => p.plan_mode === m).length}</em>
            </button>
          ))}
          <span className="dl-sep" />
          {KCAL_BANDS.map((b) => (
            <button key={b.key} type="button" className="dt-chip" aria-pressed={band === b.key} onClick={() => setBand(band === b.key ? null : b.key)}>
              <Flame size={13} />{b.label}
            </button>
          ))}
          {anyFilter && <button type="button" className="dt-link" onClick={() => { setSearch(""); setMode(null); setBand(null) }}>Clear filters</button>}
        </div>
      </div>

      <div className="dl-card">
        <div className="dl-tr dl-th">
          <span>Member</span><span>Plan</span><span>Schedule</span><span>Daily target</span><span>Status</span><span />
        </div>

        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="dl-tr">
              <span className="dl-who"><Skeleton w={38} h={38} r={19} /><Skeleton w={140} h={13} /></span>
              <Skeleton w={100} h={12} /><Skeleton w={120} h={12} /><Skeleton w={70} h={12} /><Skeleton w={60} h={22} r={11} /><span />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="dt-empty" style={{ border: "none", borderRadius: 0 }}>
            <span className="dt-empty-icon"><Salad size={20} /></span>
            {plans.length === 0 ? (
              <>
                <strong>No diet plans yet</strong>
                <p>Generate a plan from a member&apos;s health profile in under a minute.</p>
                <Link href="/dashboard/diet/new" className="ps-btn ps-btn--primary ps-btn--sm"><Plus size={14} /> New plan</Link>
              </>
            ) : (
              <>
                <strong>No plans match</strong>
                <p>Try another tab, or clear the filters.</p>
                <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => { setTab("all"); setSearch(""); setMode(null); setBand(null) }}>Show all plans</button>
              </>
            )}
          </div>
        ) : (
          filtered.map((plan) => {
            const name = plan.members?.full_name ?? "Unknown member"
            const s = schedule(plan)
            const ending = isEnding(plan)
            const pill = plan.status === "active" ? (ending ? ["amber", s.left === 0 ? "Ends today" : `${s.left}d left`] : ["green", "Active"])
              : plan.status === "draft" ? ["blue", "Draft"] : plan.status === "archived" ? ["grey", "Archived"] : ["grey", "Older"]
            return (
              <div key={plan.id} className="dl-tr dl-row" data-older={isOlder(plan)}>
                <Link href={`/dashboard/diet/${plan.id}`} className="dl-cover" aria-label={`Open ${name}'s plan`} />
                <span className="dl-who">
                  <Avatar name={name} size={38} />
                  <span className="dl-text">
                    <strong>{name}</strong>
                    <small className="dl-show-sm">{MODE_LABEL[plan.plan_mode] ?? plan.plan_mode} · {plan.target_kcal.toLocaleString("en-IN")} kcal</small>
                    <small className="dl-hide-sm">Created {formatDate(plan.created_at)}</small>
                  </span>
                </span>
                <span className="dl-text dl-hide-sm">
                  <span className="dl-mode">{MODE_LABEL[plan.plan_mode] ?? plan.plan_mode}</span>
                  <small>{plan.plan_days}-day plan{plan.version_number ? ` · v${plan.version_number}` : ""}</small>
                </span>
                <span className="dl-sched dl-hide-sm">
                  <span>{formatDate(plan.start_date)} → {formatDate(s.end.toISOString().slice(0, 10))}</span>
                  {plan.status === "active" && s.started && !s.done
                    ? <span className="dl-prog"><i style={{ width: `${s.pct * 100}%` }} /><em>Day {s.day}/{plan.plan_days}</em></span>
                    : <small>{!s.started ? <><CalendarClock size={12} /> Starts {formatDate(plan.start_date)}</> : s.done ? "Finished" : ""}</small>}
                </span>
                <span className="dl-kcal"><b>{plan.target_kcal.toLocaleString("en-IN")}</b> kcal</span>
                <span><span className={`dl-pill dl-pill--${pill[0]}`}><i />{pill[1]}</span></span>
                <span className="dl-actions">
                  <Link href={`/dashboard/diet/${plan.id}/edit`} className="dl-icon" title="Edit plan" aria-label="Edit plan"><Pencil size={15} /></Link>
                  <span className="dl-menu-anchor" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="dl-icon" aria-label="More" onClick={() => setMenu(menu === plan.id ? null : plan.id)}><MoreHorizontal size={16} /></button>
                    {menu === plan.id && (
                      <span className="dl-menu" role="menu">
                        {plan.status !== "active" && <button type="button" onClick={() => setStatus(plan, "active")}><CheckCircle2 size={15} />Make active</button>}
                        {plan.status !== "archived" && <button type="button" onClick={() => setStatus(plan, "archived")}><Archive size={15} />Archive</button>}
                        {plan.members?.id && <Link href={`/dashboard/members/${plan.members.id}`}><Users size={15} />Open member</Link>}
                        <Link href={`/dashboard/diet/${plan.id}/build`}><Salad size={15} />Edit meals</Link>
                      </span>
                    )}
                  </span>
                  <ChevronRight size={16} className="dl-chev" />
                </span>
              </div>
            )
          })
        )}
        {!loading && filtered.length > 0 && <div className="dl-foot">Showing {filtered.length} of {plans.length} plans</div>}
      </div>
      {toast}
    </div>
  )
}

// NOTE: no backticks inside this CSS.
const DL_CSS = `
.dl-sep { width: 1px; height: 22px; background: var(--dt-line); flex: 0 0 auto; margin: 0 4px; }
.dl-card { position: relative; background: #fff; border: 1px solid var(--dt-line); border-radius: 18px; overflow: visible; }
.dl-tr { position: relative; display: grid; grid-template-columns: minmax(200px, 2fr) minmax(130px, 1.1fr) minmax(170px, 1.4fr) 120px 110px 100px; align-items: center; gap: 14px; padding: 0 16px; min-height: 62px; border-bottom: 1px solid #eef0f3; }
.dl-th { min-height: 40px; background: #f6f8fb; border-radius: 18px 18px 0 0; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
.dl-row { transition: background 120ms; }
.dl-row:hover { background: #f7faff; }
.dl-row[data-older="true"] { opacity: 0.7; }
.dl-cover { position: absolute; inset: 0; z-index: 0; }
.dl-row > *:not(.dl-cover) { position: relative; z-index: 1; pointer-events: none; }
.dl-row .dl-actions, .dl-row .dl-actions * { pointer-events: auto; }
.dl-who { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dl-text { display: flex; flex-direction: column; min-width: 0; }
.dl-text strong { font-size: 14.5px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dl-text small, .dl-sched small { font-size: 12.5px; color: var(--text-tertiary); display: inline-flex; align-items: center; gap: 4px; }
.dl-mode { align-self: flex-start; padding: 2px 9px; border-radius: 7px; background: var(--accent-dim, #e8f1ff); color: var(--accent); font-size: 12.5px; font-weight: 650; }
.dl-sched { display: flex; flex-direction: column; gap: 5px; font-size: 13px; color: var(--text-secondary); min-width: 0; }
.dl-prog { position: relative; display: block; height: 16px; border-radius: 8px; background: #eef2f8; overflow: hidden; }
.dl-prog i { position: absolute; inset: 0 auto 0 0; border-radius: 8px; background: linear-gradient(90deg, #0a66d6, #3c4fe0); }
.dl-prog em { position: relative; display: block; font-style: normal; font-size: 10.5px; font-weight: 700; line-height: 16px; padding-left: 8px; color: #fff; text-shadow: 0 0 2px rgba(0,0,0,0.25); }
.dl-kcal { font-size: 13px; color: var(--text-tertiary); white-space: nowrap; }
.dl-kcal b { font-size: 15px; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.dl-pill { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 650; white-space: nowrap; }
.dl-pill i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.dl-pill--green { background: #e6f6ec; color: #1f8a3b; } .dl-pill--amber { background: #fff1de; color: #b45309; }
.dl-pill--blue { background: #e8f1ff; color: #0a66d6; } .dl-pill--grey { background: #f0f0f3; color: #6e6e73; }
.dl-actions { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
.dl-icon { width: 32px; height: 32px; border: none; border-radius: 9px; background: none; display: grid; place-items: center; color: var(--text-tertiary); cursor: pointer; text-decoration: none; }
.dl-icon:hover { background: #eef2f8; color: var(--accent); }
.dl-chev { color: var(--text-tertiary); }
.dl-menu-anchor { position: relative; }
.dl-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 30; min-width: 190px; padding: 5px; border-radius: 12px; background: #fff; box-shadow: 0 0 0 1px rgba(15,23,42,0.06), 0 16px 36px -10px rgba(15,23,42,0.3); display: flex; flex-direction: column; }
.dl-menu button, .dl-menu a { display: flex; align-items: center; gap: 9px; padding: 9px 10px; border: none; background: none; border-radius: 8px; font: inherit; font-size: 13.5px; color: var(--text-primary); text-decoration: none; cursor: pointer; text-align: left; }
.dl-menu button:hover, .dl-menu a:hover { background: #f4f7fc; }
.dl-menu svg { color: var(--text-tertiary); }
.dl-foot { padding: 10px 16px; font-size: 12.5px; color: var(--text-tertiary); }
.dl-show-sm { display: none !important; }
@media (max-width: 1250px) { .dl-hide-md { display: none !important; } }
@media (max-width: 900px) {
  .dl-tr { grid-template-columns: minmax(0, 1fr) auto auto; padding: 10px 12px; min-height: 0; }
  .dl-th, .dl-hide-sm, .dl-kcal { display: none !important; }
  .dl-show-sm { display: inline-flex !important; }
  .dl-chev { display: none; }
  .dl-menu { position: fixed; left: 10px; right: 10px; top: auto; bottom: calc(var(--tabbar-h, 0px) + 12px); }
}
`

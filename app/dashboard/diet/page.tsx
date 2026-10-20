"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Search, ChevronRight, Salad, Flame, Users, TrendingUp } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Avatar, formatDate, Segmented, Skeleton } from "../components/ui"
import { DesignStyles } from "../components/DesignSystem"

interface PlanRow {
  id: string
  plan_mode: string
  plan_days: number
  start_date: string
  target_kcal: number
  status: string
  created_at: string
  members: { full_name: string } | null
}

type StatusFilter = "active" | "superseded" | "all"

const MODE_LABEL: Record<string, string> = {
  recipe: "Standard",
  protein_heavy: "Protein heavy",
  ingredient: "Simple foods",
}

const COLS = "minmax(0,2.2fr) minmax(0,1.1fr) minmax(0,1fr) 130px 16px"

export default function DietPlansPage() {
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<StatusFilter>("active")

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) return
      const { data } = await supabase
        .from("member_diet_plans")
        .select("id, plan_mode, plan_days, start_date, target_kcal, status, created_at, members(full_name)")
        .eq("org_id", roleData.org_id)
        .order("created_at", { ascending: false })
        .limit(200)
      setPlans((data as unknown as PlanRow[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  const q = search.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      plans.filter((p) => {
        if (status !== "all" && p.status !== status) return false
        return !q || (p.members?.full_name || "").toLowerCase().includes(q)
      }),
    [plans, status, q]
  )

  const stats = useMemo(() => {
    const active = plans.filter((p) => p.status === "active")
    const members = new Set(active.map((p) => p.members?.full_name).filter(Boolean)).size
    const avgKcal = active.length ? Math.round(active.reduce((s, p) => s + (p.target_kcal || 0), 0) / active.length) : 0
    const thisWeek = plans.filter((p) => Date.now() - new Date(p.created_at).getTime() < 7 * 86400000).length
    return { activeCount: active.length, members, avgKcal, thisWeek }
  }, [plans])

  return (
    <div className="ps-page db">
      <DesignStyles />

      {/* Header */}
      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">Diet plans</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{stats.activeCount}</strong> active plan{stats.activeCount === 1 ? "" : "s"} across your members</>}
          </p>
        </div>
        <div className="db-header-actions">
          <Link href="/dashboard/diet/new" className="ps-btn ps-btn--primary">
            <Plus size={16} strokeWidth={2.4} /> <span>New plan</span>
          </Link>
        </div>
      </header>

      {/* Summary bar */}
      <div className="db-card db-statbar">
        <div className="db-stat db-tone-green">
          <span className="db-chip"><Salad size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Active plans</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : stats.activeCount}</div>
          </div>
        </div>
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Users size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Members on a plan</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : stats.members}</div>
          </div>
        </div>
        <div className="db-stat db-tone-amber">
          <span className="db-chip"><Flame size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">Avg. daily target</div>
            <div className="db-stat-value">{loading ? <Skeleton w={60} h={20} /> : stats.avgKcal ? `${stats.avgKcal.toLocaleString("en-IN")} kcal` : "—"}</div>
          </div>
        </div>
        <div className="db-stat db-tone-purple">
          <span className="db-chip"><TrendingUp size={15} strokeWidth={2.3} /></span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">New this week</div>
            <div className="db-stat-value">{loading ? <Skeleton w={30} h={20} /> : stats.thisWeek}</div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="db-card db-toolbar">
        <label className="db-search">
          <Search size={16} />
          <input
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by member name"
            aria-label="Search diet plans"
          />
        </label>
        <div style={{ maxWidth: 320, flexShrink: 0 }}>
          <Segmented<StatusFilter>
            block
            label="Plan status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "active", label: "Active" },
              { value: "superseded", label: "Older" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="db-card" style={{ overflow: "hidden" }}>
        <div className="db-table-head" style={{ gridTemplateColumns: COLS }}>
          <span>Member</span><span>Type</span><span>Starts</span><span>Daily target</span><span />
        </div>

        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="db-trow db-members-row" style={{ gridTemplateColumns: COLS }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Skeleton w={38} h={38} r={19} />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}><Skeleton w={140} h={13} /><Skeleton w={90} h={11} /></div>
              </div>
              <span className="db-hide-sm"><Skeleton w={80} h={12} /></span>
              <span className="db-hide-sm"><Skeleton w={60} h={12} /></span>
              <Skeleton w={70} h={12} />
              <span />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="db-empty" style={{ padding: "48px 16px" }}>
            <span className="db-empty-icon"><Salad size={18} /></span>
            {plans.length === 0 ? (
              <>
                <div className="db-empty-title">No diet plans yet</div>
                <div className="db-empty-text">Generate a plan from a member&apos;s health profile in under a minute.</div>
                <Link href="/dashboard/diet/new" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }}><Plus size={16} /> New plan</Link>
              </>
            ) : q ? (
              <>
                <div className="db-empty-title">No plans for &ldquo;{search.trim()}&rdquo;</div>
                <button type="button" className="ps-btn ps-btn--plain" onClick={() => setSearch("")}>Clear search</button>
              </>
            ) : (
              <>
                <div className="db-empty-title">No {status === "superseded" ? "older" : status} plans</div>
                <button type="button" className="ps-btn ps-btn--plain" onClick={() => setStatus("all")}>Show all plans</button>
              </>
            )}
          </div>
        ) : (
          filtered.map((plan) => {
            const name = plan.members?.full_name ?? "Unknown member"
            const mode = MODE_LABEL[plan.plan_mode] ?? plan.plan_mode
            const older = plan.status !== "active"
            return (
              <Link key={plan.id} href={`/dashboard/diet/${plan.id}`} className="db-trow db-members-row" style={{ gridTemplateColumns: COLS }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <Avatar name={name} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <div className="db-row-title" style={older ? { color: "var(--text-secondary)" } : undefined}>{name}</div>
                    <div className="db-row-sub db-hide-sm">{plan.plan_days}-day plan{older ? ", replaced by a newer version" : ""}</div>
                    <div className="db-row-sub db-show-sm">{mode}, {plan.plan_days} days from {formatDate(plan.start_date)}</div>
                  </div>
                </div>
                <div className="db-hide-sm db-row-sub" style={{ fontSize: 13.5 }}>
                  {older ? <span className="db-pill db-pill--muted">{mode}</span> : <span className="db-pill db-pill--green">{mode}</span>}
                </div>
                <div className="db-hide-sm db-row-sub" style={{ fontVariantNumeric: "tabular-nums" }}>{formatDate(plan.start_date)}</div>
                <div className="db-row-title" style={{ fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                  {plan.target_kcal.toLocaleString("en-IN")} <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>kcal</span>
                </div>
                <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

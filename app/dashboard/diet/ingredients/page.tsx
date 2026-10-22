"use client"
// app/dashboard/diet/ingredients/page.tsx
// Ingredient library: built-ins (read-only, shared) + this gym's own (private).

import { useEffect, useMemo, useState } from "react"
import { Plus, Search, Carrot, Database, Beef, Leaf, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { DesignStyles } from "../../components/DesignSystem"
import { Skeleton } from "../../components/ui"
import { IngredientSheet } from "../components/IngredientSheet"
import {
  INGREDIENT_GROUPS, ingredientGroup, groupLabel, normalizeName,
  type IngredientGroup, type IngredientRow,
} from "@/lib/nutrition/recipeMath"

const supabase = createClient()

type Source = "all" | "builtin" | "mine"
const COLS = "minmax(0,2.2fr) minmax(0,1.2fr) 72px 64px 64px 64px 16px"
const fmt = (v: number | null) => (v == null ? "–" : String(Math.round(Number(v) * 10) / 10))

export default function IngredientsPage() {
  const [ctx, setCtx] = useState<{ orgId: string; userId: string } | null>(null)
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [source, setSource] = useState<Source>("all")
  const [group, setGroup] = useState<IngredientGroup | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<IngredientRow | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (role?.org_id) setCtx({ orgId: role.org_id, userId: user.id })
      // RLS returns built-ins + this gym's own only
      const { data } = await supabase.from("ingredients").select("*").order("food_name").limit(5000)
      setRows((data as IngredientRow[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const live = useMemo(() => rows.filter((r) => r.is_active !== false), [rows])
  const mine = useMemo(() => rows.filter((r) => r.org_id), [rows])

  const filtered = useMemo(() => {
    const term = normalizeName(q)
    const base = source === "mine" ? mine : source === "builtin" ? live.filter((r) => !r.org_id) : live
    return base.filter((r) =>
      (!group || ingredientGroup(r.category) === group) &&
      (!term || normalizeName(r.food_name).includes(term) || normalizeName(r.common_name).includes(term))
    )
  }, [live, mine, q, source, group])

  const groupCounts = useMemo(() => {
    const m: Partial<Record<IngredientGroup, number>> = {}
    live.forEach((r) => { const g = ingredientGroup(r.category); m[g] = (m[g] ?? 0) + 1 })
    return m
  }, [live])

  const stats = {
    total: live.length,
    mine: mine.filter((r) => r.is_active !== false).length,
    protein: live.filter((r) => Number(r.protein_g) >= 15).length,
    lowGi: live.filter((r) => r.is_low_gi).length,
  }

  function open(row: IngredientRow | null) { setSelected(row); setSheetOpen(true) }

  function handleSaved(row: IngredientRow) {
    setRows((prev) => {
      const exists = prev.some((r) => r.id === row.id)
      const next = exists ? prev.map((r) => (r.id === row.id ? row : r)) : [...prev, row]
      return next.sort((a, b) => a.food_name.localeCompare(b.food_name))
    })
    setSheetOpen(false)
  }

  return (
    <div className="ps-page db">
      <DesignStyles />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Nutrition</div>
          <h1 className="db-title">Ingredients</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{stats.total}</strong> ingredients · <strong>{stats.mine}</strong> added by your gym, visible only to you</>}
          </p>
        </div>
        <div className="db-header-actions">
          {ctx && <button type="button" className="ps-btn ps-btn--primary" onClick={() => open(null)}><Plus size={16} strokeWidth={2.4} /><span>New ingredient</span></button>}
        </div>
      </header>

      <div className="db-card db-statbar">
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Database size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">In library</div><div className="db-stat-value">{loading ? "–" : stats.total}</div></div>
        </div>
        <div className="db-stat db-tone-purple">
          <span className="db-chip"><Carrot size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Your gym's</div><div className="db-stat-value">{loading ? "–" : stats.mine}</div></div>
        </div>
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Beef size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">15 g+ protein / 100 g</div><div className="db-stat-value">{loading ? "–" : stats.protein}</div></div>
        </div>
        <div className="db-stat db-tone-green">
          <span className="db-chip"><Leaf size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Low GI</div><div className="db-stat-value">{loading ? "–" : stats.lowGi}</div></div>
        </div>
      </div>

      <div className="db-card db-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="dz-tabs db-segtabs" role="tablist">
            {([["all", "All", stats.total], ["builtin", "Built-in", stats.total - stats.mine], ["mine", "Yours", mine.length]] as [Source, string, number][]).map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={source === k} className="dz-tab" onClick={() => setSource(k)}>{label} <span>{n}</span></button>
            ))}
          </div>
          <label className="db-search">
            <Search size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, e.g. paneer or anda" aria-label="Search ingredients" />
          </label>
        </div>
        <div className="db-presets" role="group" aria-label="Filter by group">
          <button type="button" className="db-preset" aria-pressed={!group} onClick={() => setGroup(null)}>All groups</button>
          {INGREDIENT_GROUPS.filter((g) => groupCounts[g.key]).map((g) => (
            <button key={g.key} type="button" className="db-preset" aria-pressed={group === g.key} onClick={() => setGroup(group === g.key ? null : g.key)}>
              {g.label} <span style={{ opacity: 0.55, marginLeft: 4, fontVariantNumeric: "tabular-nums" }}>{groupCounts[g.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="db-card db-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} w="100%" h={22} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <span className="db-empty-icon"><Carrot size={18} /></span>
            <div className="db-empty-title">{source === "mine" && mine.length === 0 ? "No ingredients of your own yet" : "No ingredients match"}</div>
            <div className="db-empty-text">
              {source === "mine" && mine.length === 0
                ? "Add ingredients your gym uses that aren't built in. Only your gym will see them."
                : "Try another name or group. Indian names like \u201canda\u201d or \u201cmurgh\u201d work too."}
            </div>
            {ctx && <button type="button" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }} onClick={() => open(null)}><Plus size={15} /><span>New ingredient</span></button>}
          </div>
        </div>
      ) : (
        <div className="db-card" style={{ overflow: "hidden" }}>
          <div className="db-table-head" style={{ gridTemplateColumns: COLS }}>
            <span>Ingredient</span><span>Group</span>
            <span style={{ textAlign: "right" }}>kcal</span><span style={{ textAlign: "right" }}>Protein</span>
            <span style={{ textAlign: "right" }}>Carbs</span><span style={{ textAlign: "right" }}>Fat</span><span />
          </div>
          {filtered.map((r) => (
            <button key={r.id} type="button" className="db-trow db-row-plain db-ing-row" style={{ gridTemplateColumns: COLS, opacity: r.is_active === false ? 0.55 : 1 }} onClick={() => open(r)}>
              <div style={{ minWidth: 0 }}>
                <div className="db-row-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.food_name}</span>
                  {r.org_id && <span className="db-pill db-pill--blue" style={{ padding: "1px 7px", fontSize: 11 }}>{r.is_active === false ? "Archived" : "Yours"}</span>}
                </div>
                {r.common_name && <div className="db-row-sub">{r.common_name}</div>}
                <div className="db-row-sub db-show-sm">{fmt(r.energy_kcal)} kcal · P {fmt(r.protein_g)} · C {fmt(r.carbs_g)} · F {fmt(r.fat_g)} per 100 g</div>
              </div>
              <span className="db-hide-sm"><span className="db-pill db-pill--muted">{groupLabel(ingredientGroup(r.category))}</span></span>
              <span className="db-num db-hide-sm">{fmt(r.energy_kcal)}</span>
              <span className="db-num db-hide-sm">{fmt(r.protein_g)}<small>g</small></span>
              <span className="db-num db-hide-sm">{fmt(r.carbs_g)}<small>g</small></span>
              <span className="db-num db-hide-sm">{fmt(r.fat_g)}<small>g</small></span>
              <ChevronRight size={16} style={{ color: "var(--text-tertiary)" }} />
            </button>
          ))}
        </div>
      )}

      {ctx && (
        <IngredientSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          orgId={ctx.orgId}
          userId={ctx.userId}
          ingredient={selected}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

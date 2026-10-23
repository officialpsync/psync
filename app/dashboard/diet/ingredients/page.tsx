"use client"
// app/dashboard/diet/ingredients/page.tsx
// Ingredient library: built-ins (read-only, shared) + this gym's own (private).
// Filters: source, group, suitability (high protein, low GI, low sodium, GERD safe, high fibre); sortable columns.

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Search, Carrot, Database, Beef, Leaf, ChevronRight, ChevronUp, ChevronDown, ChevronLeft, Download } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { DesignStyles } from "../../components/DesignSystem"
import { Skeleton } from "../../components/ui"
import { IngredientSheet } from "../components/IngredientSheet"
import { DietStyles, MacroSplit, MACRO_COLOR } from "../components/DietTheme"
import {
  INGREDIENT_GROUPS, ingredientGroup, groupLabel, normalizeName,
  type IngredientGroup, type IngredientRow,
} from "@/lib/nutrition/recipeMath"

const supabase = createClient()

type Source = "all" | "builtin" | "mine"
type SortKey = "food_name" | "energy_kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g"
type Flag = "protein" | "lowgi" | "lowsodium" | "gerd" | "fibre" | "lowcal"

const FLAGS: { key: Flag; label: string; test: (r: IngredientRow) => boolean }[] = [
  { key: "protein", label: "High protein (15 g+)", test: (r) => Number(r.protein_g) >= 15 },
  { key: "fibre", label: "High fibre (6 g+)", test: (r) => Number(r.fiber_g) >= 6 },
  { key: "lowcal", label: "Under 100 kcal", test: (r) => Number(r.energy_kcal) < 100 },
  { key: "lowgi", label: "Low GI", test: (r) => !!r.is_low_gi },
  { key: "lowsodium", label: "Low sodium", test: (r) => !!r.is_low_sodium },
  { key: "gerd", label: "GERD safe", test: (r) => !!r.is_gerd_safe },
]
const fmt = (v: number | null) => (v == null ? "–" : String(Math.round(Number(v) * 10) / 10))
const PAGE = 50

export default function IngredientsPage() {
  const [ctx, setCtx] = useState<{ orgId: string; userId: string } | null>(null)
  const [rows, setRows] = useState<IngredientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [source, setSource] = useState<Source>("all")
  const [group, setGroup] = useState<IngredientGroup | null>(null)
  const [flags, setFlags] = useState<Flag[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "food_name", dir: "asc" })
  const [page, setPage] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selected, setSelected] = useState<IngredientRow | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: role } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (role?.org_id) setCtx({ orgId: role.org_id, userId: user.id })
      const { data } = await supabase.from("ingredients").select("*").order("food_name").limit(5000)
      setRows((data as IngredientRow[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const live = useMemo(() => rows.filter((r) => r.is_active !== false), [rows])
  const mine = useMemo(() => rows.filter((r) => r.org_id), [rows])
  const archived = rows.length - live.length

  const filtered = useMemo(() => {
    const term = normalizeName(q)
    const base = source === "mine" ? (showArchived ? mine : mine.filter((r) => r.is_active !== false))
      : source === "builtin" ? live.filter((r) => !r.org_id) : (showArchived ? rows : live)
    const r = base.filter((x) =>
      (!group || ingredientGroup(x.category) === group) &&
      flags.every((f) => FLAGS.find((d) => d.key === f)!.test(x)) &&
      (!term || normalizeName(x.food_name).includes(term) || normalizeName(x.common_name).includes(term)))
    const dir = sort.dir === "asc" ? 1 : -1
    return [...r].sort((a, b) => sort.key === "food_name"
      ? a.food_name.localeCompare(b.food_name) * dir
      : ((Number(a[sort.key]) || 0) - (Number(b[sort.key]) || 0)) * dir)
  }, [rows, live, mine, q, source, group, flags, sort, showArchived])

  useEffect(() => { setPage(0) }, [q, source, group, flags, sort, showArchived])

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
  function toggleSort(key: SortKey) {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "food_name" ? "asc" : "desc" })
  }
  function exportCSV() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const head = ["Name", "Also called", "Group", "kcal", "Protein g", "Carbs g", "Fat g", "Fibre g", "Low GI", "Low sodium", "GERD safe", "Source"]
    const lines = [head.map(esc).join(","), ...filtered.map((r) => [r.food_name, r.common_name, groupLabel(ingredientGroup(r.category)), r.energy_kcal, r.protein_g, r.carbs_g, r.fat_g, r.fiber_g,
      r.is_low_gi ? "Yes" : "", r.is_low_sodium ? "Yes" : "", r.is_gerd_safe ? "Yes" : "", r.org_id ? "Gym" : "Built-in"].map(esc).join(","))]
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }))
    a.download = `ingredients-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  const anyFilter = !!q || source !== "all" || !!group || flags.length > 0
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const shown = filtered.slice(page * PAGE, (page + 1) * PAGE)
  const TH = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <button type="button" className="ig-th" data-right={right} data-on={sort.key === k} onClick={() => toggleSort(k)}>
      {label}{sort.key === k && (sort.dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </button>
  )

  return (
    <div className="ps-page db dt">
      <DesignStyles />
      <DietStyles />
      <style>{IG_CSS}</style>

      <div className="dt-crumbs"><Link href="/dashboard/diet"><ChevronLeft size={16} /> Diet plans</Link><span>/</span><b>Ingredients</b></div>

      <header className="dt-head">
        <div className="dt-title">
          <span className="dt-title-icon"><Carrot size={21} /></span>
          <div>
            <h1>Ingredients</h1>
            <p>{loading ? "\u00a0" : `${stats.total} ingredients · ${stats.mine} added by your gym, visible only to you`}</p>
          </div>
        </div>
        <div className="dt-kpis">
          <div className="dt-kpi"><span className="dt-kpi-icon"><Database size={15} /></span><div><small>In library</small><b>{loading ? "–" : stats.total}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Carrot size={15} /></span><div><small>Your gym&apos;s</small><b>{loading ? "–" : stats.mine}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Beef size={15} /></span><div><small>High protein</small><b>{loading ? "–" : stats.protein}</b></div></div>
          <div className="dt-kpi"><span className="dt-kpi-icon"><Leaf size={15} /></span><div><small>Low GI</small><b>{loading ? "–" : stats.lowGi}</b></div></div>
        </div>
        <div className="dt-actions">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={exportCSV} disabled={loading}><Download size={16} /><span>Export</span></button>
          {ctx && <button type="button" className="ps-btn ps-btn--primary" onClick={() => open(null)}><Plus size={16} strokeWidth={2.4} /><span>New ingredient</span></button>}
        </div>
      </header>

      <div className="dt-toolbar">
        <div className="dt-row">
          <div className="dt-seg" role="tablist">
            {([["all", "All", stats.total], ["builtin", "Built-in", stats.total - stats.mine], ["mine", "Yours", stats.mine]] as [Source, string, number][]).map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={source === k} onClick={() => setSource(k)}>{label} <span>{n}</span></button>
            ))}
          </div>
          <label className="dt-search"><Search size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, e.g. paneer or anda" aria-label="Search ingredients" />
          </label>
          <select className="dt-select" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, d] = e.target.value.split(":"); setSort({ key: k as SortKey, dir: d as "asc" | "desc" }) }} aria-label="Sort">
            <option value="food_name:asc">Name A–Z</option>
            <option value="protein_g:desc">Most protein</option>
            <option value="energy_kcal:asc">Fewest calories</option>
            <option value="energy_kcal:desc">Most calories</option>
            <option value="carbs_g:asc">Fewest carbs</option>
            <option value="fiber_g:desc">Most fibre</option>
          </select>
        </div>
        <div className="dt-chips" role="group" aria-label="Filter by group">
          <button type="button" className="dt-chip" aria-pressed={!group} onClick={() => setGroup(null)}>All groups <em>{stats.total}</em></button>
          {INGREDIENT_GROUPS.filter((g) => groupCounts[g.key]).map((g) => (
            <button key={g.key} type="button" className="dt-chip" aria-pressed={group === g.key} onClick={() => setGroup(group === g.key ? null : g.key)}>
              {g.label} <em>{groupCounts[g.key]}</em>
            </button>
          ))}
        </div>
        <div className="dt-chips" role="group" aria-label="Filter by nutrition">
          {FLAGS.map((f) => (
            <button key={f.key} type="button" className="dt-chip ig-flag" aria-pressed={flags.includes(f.key)}
              onClick={() => setFlags((p) => p.includes(f.key) ? p.filter((x) => x !== f.key) : [...p, f.key])}>{f.label}</button>
          ))}
          {anyFilter && <button type="button" className="dt-link" onClick={() => { setQ(""); setSource("all"); setGroup(null); setFlags([]) }}>Clear filters</button>}
          {archived > 0 && (
            <label className="ig-arch"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show {archived} archived</label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="ig-card" style={{ padding: 16, display: "grid", gap: 12 }}>{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} w="100%" h={22} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="dt-empty">
          <span className="dt-empty-icon"><Carrot size={20} /></span>
          <strong>{source === "mine" && stats.mine === 0 ? "No ingredients of your own yet" : "No ingredients match"}</strong>
          <p>{source === "mine" && stats.mine === 0 ? "Add ingredients your gym uses that aren't built in. Only your gym will see them." : "Try another name, group or filter. Indian names like \u201canda\u201d or \u201cmurgh\u201d work too."}</p>
          {ctx && <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => open(null)}><Plus size={14} /> New ingredient</button>}
        </div>
      ) : (
        <div className="ig-card">
          <div className="ig-tr ig-head">
            <TH k="food_name" label="Ingredient" />
            <span className="ig-hide">Group</span>
            <TH k="energy_kcal" label="kcal" right />
            <TH k="protein_g" label="Protein" right />
            <TH k="carbs_g" label="Carbs" right />
            <TH k="fat_g" label="Fat" right />
            <span className="ig-hide">Split</span>
            <span />
          </div>
          {shown.map((r) => {
            const p = Number(r.protein_g) || 0, c = Number(r.carbs_g) || 0, f = Number(r.fat_g) || 0
            return (
              <button key={r.id} type="button" className="ig-tr ig-row" data-off={r.is_active === false} onClick={() => open(r)}>
                <span className="ig-name">
                  <strong>{r.food_name}{r.org_id && <span className="ig-mine">{r.is_active === false ? "Archived" : "Yours"}</span>}</strong>
                  <small>
                    {r.common_name && <>{r.common_name} · </>}
                    <span className="ig-show">{fmt(r.energy_kcal)} kcal · P {fmt(r.protein_g)} · C {fmt(r.carbs_g)} · F {fmt(r.fat_g)}</span>
                    {r.is_low_gi && <span className="ig-tag">Low GI</span>}
                    {r.is_gerd_safe && <span className="ig-tag">GERD safe</span>}
                  </small>
                </span>
                <span className="ig-hide"><span className="ig-group">{groupLabel(ingredientGroup(r.category))}</span></span>
                <span className="ig-num ig-kcal">{fmt(r.energy_kcal)}</span>
                <span className="ig-num" style={{ color: Number(r.protein_g) >= 15 ? MACRO_COLOR.p : undefined }}>{fmt(r.protein_g)}<small>g</small></span>
                <span className="ig-num">{fmt(r.carbs_g)}<small>g</small></span>
                <span className="ig-num">{fmt(r.fat_g)}<small>g</small></span>
                <span className="ig-hide ig-splitcell"><MacroSplit p={p} c={c} f={f} /></span>
                <ChevronRight size={16} className="ig-chev" />
              </button>
            )
          })}
          <div className="ig-foot">
            <div className="dt-legend">
              <span><i style={{ background: MACRO_COLOR.p }} />Protein</span>
              <span><i style={{ background: MACRO_COLOR.c }} />Carbs</span>
              <span><i style={{ background: MACRO_COLOR.f }} />Fat</span>
              <span>Values per 100 g, raw</span>
            </div>
            <div className="ig-pager">
              <span>{page * PAGE + 1}–{Math.min((page + 1) * PAGE, filtered.length)} of {filtered.length}</span>
              <button type="button" className="ig-pbtn" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="Previous"><ChevronLeft size={16} /></button>
              <button type="button" className="ig-pbtn" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} aria-label="Next"><ChevronRight size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {ctx && (
        <IngredientSheet open={sheetOpen} onClose={() => setSheetOpen(false)} orgId={ctx.orgId} userId={ctx.userId} ingredient={selected} onSaved={handleSaved} />
      )}
    </div>
  )
}

// NOTE: no backticks inside this CSS.
const IG_CSS = `
.ig-arch { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
.ig-arch input { accent-color: var(--accent); }
.ig-card { background: #fff; border: 1px solid var(--dt-line); border-radius: 18px; overflow: hidden; }
.ig-tr { display: grid; grid-template-columns: minmax(220px, 2.4fr) 130px 80px 80px 80px 80px minmax(90px, 1fr) 20px; align-items: center; gap: 12px; width: 100%; padding: 0 16px; min-height: 56px; border: none; border-bottom: 1px solid #eef0f3; background: #fff; font: inherit; text-align: left; }
.ig-head { min-height: 40px; background: #f6f8fb; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-tertiary); }
.ig-th { display: inline-flex; align-items: center; gap: 3px; border: none; background: none; padding: 0; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; }
.ig-th[data-right="true"] { justify-content: flex-end; }
.ig-th[data-on="true"] { color: var(--accent); }
.ig-row { cursor: pointer; transition: background 120ms; }
.ig-row:hover { background: #f7faff; }
.ig-row[data-off="true"] { opacity: 0.55; }
.ig-name { display: flex; flex-direction: column; min-width: 0; }
.ig-name strong { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 650; color: var(--text-primary); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ig-name small { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12.5px; color: var(--text-tertiary); }
.ig-mine { flex-shrink: 0; height: 20px; padding: 0 8px; border-radius: 10px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; color: #fff; background: var(--accent); }
.ig-tag { height: 18px; padding: 0 7px; border-radius: 9px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 650; background: #e8f1ff; color: #0a66d6; }
.ig-group { padding: 3px 9px; border-radius: 8px; background: #f2f4f8; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); white-space: nowrap; }
.ig-num { text-align: right; font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text-primary); }
.ig-num small { font-size: 11px; color: var(--text-tertiary); margin-left: 1px; }
.ig-kcal { color: var(--accent); font-weight: 700; }
.ig-splitcell .dt-split { height: 6px; }
.ig-chev { color: var(--text-tertiary); }
.ig-show { display: none; }
.ig-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 16px; }
.ig-pager { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text-tertiary); }
.ig-pbtn { width: 30px; height: 30px; border: 1px solid var(--dt-line); border-radius: 8px; background: #fff; display: grid; place-items: center; cursor: pointer; color: var(--text-secondary); }
.ig-pbtn:disabled { opacity: 0.4; cursor: default; }
@media (max-width: 1000px) {
  .ig-tr { grid-template-columns: minmax(0, 1fr) 64px 64px 64px 64px 18px; }
  .ig-hide { display: none !important; }
}
@media (max-width: 640px) {
  .ig-tr { grid-template-columns: minmax(0, 1fr) 18px; padding: 10px 12px; }
  .ig-head { display: none; }
  .ig-num { display: none; }
  .ig-show { display: inline; }
}
`

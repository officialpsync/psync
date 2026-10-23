"use client"
// app/dashboard/workouts/exercises/page.tsx
// Exercise library: every built-in + gym exercise, with categories, media, and gym categories.

import { useEffect, useMemo, useState } from "react"
import type { Equipment } from "@/lib/workout/types"
import {
  Plus, Search, Dumbbell, Library, Tag, Tags, Video, Pencil, Copy, Archive, ArchiveRestore, Trash2, Check, Loader2,
  ImageIcon, LayoutGrid, Rows3, Sparkles,
} from "lucide-react"
import { WorkoutStyles, MUSCLE_COLOR } from "../components/WorkoutTheme"
import { DesignStyles } from "../../components/DesignSystem"
import { Sheet } from "../../components/Sheet"
import { Skeleton } from "../../components/ui"
import {
  MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS, MOVEMENT_LABELS,
  type MuscleGroup, type WorkoutExercise, type CategoryColor, type ExerciseCategoryRow,
} from "@/lib/workout/types"
import {
  useExerciseCategories, CategoryTags, ColorSwatches, categoryIcon, type CategoriesApi,
} from "../components/categories"
import { ExerciseSheet, type ExerciseSheetMode } from "../components/ExerciseSheet"
import { ExerciseImages } from "../components/ExerciseMedia"
import { exerciseImage, loadOrgContext, supabase } from "../components/shared"

type Source = "all" | "builtin" | "mine"

// ── Card ─────────────────────────────────────────────────────────────────────

function ExerciseCard({ ex, cats, onOpen }: { ex: WorkoutExercise; cats: CategoriesApi; onOpen: () => void }) {
  const [failed, setFailed] = useState(false)
  const src = exerciseImage(ex)
  const mc = MUSCLE_COLOR[ex.muscle_group] ?? "#8e8e93"
  return (
    <button type="button" className="xl-card" data-archived={ex.is_active === false} onClick={onOpen} style={{ ["--mc" as string]: mc } as React.CSSProperties}>
      <div className="xl-cover">
        {src && !failed
          ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
          : <span className="xl-noimg"><Dumbbell size={30} strokeWidth={1.8} /></span>}
        <span className="xl-shade" aria-hidden />
        <span className={`xl-flag${ex.org_id ? " xl-flag--mine" : ""}${ex.is_active === false ? " xl-flag--arch" : ""}`}>
          {ex.is_active === false ? "Archived" : ex.org_id ? "Yours" : "Built-in"}
        </span>
        {ex.video_url && <span className="xl-video" aria-label="Has video"><Video size={13} /></span>}
        <span className="xl-muscle"><i />{MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group}</span>
      </div>
      <div className="xl-body">
        <div className="xl-name">{ex.name}</div>
        <div className="xl-meta">{EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment} · {MOVEMENT_LABELS[ex.movement_type] ?? ex.movement_type}</div>
        <CategoryTags slugs={ex.category} cats={cats} max={2} />
      </div>
    </button>
  )
}

// ── Detail sheet ─────────────────────────────────────────────────────────────

function ExerciseDetail({ ex, open, onClose, cats, busy, onEdit, onCustomize, onToggleArchive }: {
  ex: WorkoutExercise | null; open: boolean; onClose: () => void; cats: CategoriesApi; busy: boolean
  onEdit: () => void; onCustomize: () => void; onToggleArchive: () => void
}) {
  const own = !!ex?.org_id
  const archived = ex?.is_active === false
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ex?.name ?? "Exercise"}
      description={ex ? (own ? "Your gym's exercise" : "Built-in exercise") : undefined}
      footer={ex ? (
        own ? (
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onToggleArchive} disabled={busy}>
              {busy ? <Loader2 size={15} className="ps-spin" /> : archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              <span>{archived ? "Restore" : "Archive"}</span>
            </button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={onEdit}><Pencil size={15} /><span>Edit</span></button>
          </>
        ) : (
          <>
            <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Close</button>
            <button type="button" className="ps-btn ps-btn--primary" onClick={onCustomize}><Copy size={15} /><span>Customize a copy</span></button>
          </>
        )
      ) : undefined}
    >
      {ex && (
        <div className="db">
          <div className="db-exdetail-media">
            <ExerciseImages name={ex.name} imageUrl={ex.image_url} videoUrl={ex.video_url} />
          </div>
          <div className="db-kv-grid">
            <div className="db-kv"><div className="db-kv-label">Muscle</div><div className="db-kv-value">{MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group}</div></div>
            <div className="db-kv"><div className="db-kv-label">Equipment</div><div className="db-kv-value">{EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}</div></div>
            <div className="db-kv"><div className="db-kv-label">Movement</div><div className="db-kv-value">{MOVEMENT_LABELS[ex.movement_type] ?? ex.movement_type}</div></div>
          </div>
          {(ex.category?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="db-fieldset-label">Categories</div>
              <CategoryTags slugs={ex.category} cats={cats} max={12} />
            </div>
          )}
          <div className="db-fieldset-label">Coaching cues</div>
          {ex.description
            ? <p className="db-prose">{ex.description}</p>
            : <p className="db-prose" style={{ color: "var(--text-tertiary)" }}>{own ? "No cues yet. Add them with Edit." : "No cues for this one. Customize a copy to add your own."}</p>}
          {archived && (
            <div className="db-callout db-tone-amber" style={{ marginTop: 16 }}>
              Archived: hidden when building plans. Plans that already use it are unchanged.
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}

// ── Category manager ─────────────────────────────────────────────────────────

function CategoryRow({ row, count, cats }: { row: ExerciseCategoryRow; count: number; cats: CategoriesApi }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(row.name)
  const [color, setColor] = useState<CategoryColor>(row.color)
  const [busy, setBusy] = useState(false)
  const Icon = categoryIcon(row.slug)

  async function save() {
    if (!name.trim()) return
    setBusy(true)
    try { await cats.update(row, { name: name.trim().slice(0, 30), color }); setEditing(false) }
    catch (e) { alert(e instanceof Error ? e.message : "Couldn't save") }
    finally { setBusy(false) }
  }

  async function remove() {
    const msg = count
      ? `Delete "${row.name}"? It will be removed from ${count} exercise${count === 1 ? "" : "s"}.`
      : `Delete "${row.name}"?`
    if (!confirm(msg)) return
    setBusy(true)
    try { await cats.remove(row) } catch (e) { alert(e instanceof Error ? e.message : "Couldn't delete"); setBusy(false) }
  }

  if (editing) {
    return (
      <div className="db-catnew" style={{ margin: "8px 0" }}>
        <input autoFocus className="ps-input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false) }} />
        <ColorSwatches value={color} onChange={setColor} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => { setEditing(false); setName(row.name); setColor(row.color) }}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={save} disabled={busy || !name.trim()}>
            {busy ? <Loader2 size={13} className="ps-spin" /> : <Check size={13} />} Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="db-catrow">
      <span className={`db-cat db-c-${row.color}`}><Icon size={11} strokeWidth={2.4} />{row.name}</span>
      <span className="db-catrow-name" />
      <span className="db-catrow-count">{count} exercise{count === 1 ? "" : "s"}</span>
      {row.org_id ? (
        <>
          <button type="button" className="db-icon-btn" aria-label={`Edit ${row.name}`} onClick={() => setEditing(true)}><Pencil size={15} /></button>
          <button type="button" className="db-icon-btn" aria-label={`Delete ${row.name}`} onClick={remove} disabled={busy}><Trash2 size={15} /></button>
        </>
      ) : (
        <span className="db-pill db-pill--muted">Built-in</span>
      )}
    </div>
  )
}

function CategoryManager({ open, onClose, cats, counts }: {
  open: boolean; onClose: () => void; cats: CategoriesApi; counts: Record<string, number>
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState<CategoryColor>("blue")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  async function add() {
    if (!name.trim()) return
    setBusy(true); setErr("")
    try { await cats.create(name, color); setName(""); setColor("blue") }
    catch (e) { setErr(e instanceof Error ? e.message : "Couldn't add the category") }
    finally { setBusy(false) }
  }

  const custom = cats.ordered.filter((r) => r.org_id)
  const builtin = cats.ordered.filter((r) => !r.org_id)

  return (
    <Sheet open={open} onClose={onClose} title="Categories" description="Group exercises by training style. Your categories show up everywhere exercises are picked.">
      <div className="db">
        <div className="db-catnew" style={{ marginTop: 0, marginBottom: 20 }}>
          <span className="db-fieldset-label" style={{ marginBottom: 0 }}>New category</span>
          <div className="db-catnew-row">
            <input className="ps-input" value={name} maxLength={30} placeholder="e.g. TRX, Zumba, Rehab"
              onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add() }} />
            <button type="button" className="ps-btn ps-btn--primary" onClick={add} disabled={busy || !name.trim()} style={{ flexShrink: 0 }}>
              {busy ? <Loader2 size={15} className="ps-spin" /> : <Plus size={15} />}<span>Add</span>
            </button>
          </div>
          <ColorSwatches value={color} onChange={setColor} />
          {err && <div className="ps-error">{err}</div>}
        </div>

        <div className="db-fieldset-label">Your categories</div>
        {custom.length === 0
          ? <p className="db-prose" style={{ color: "var(--text-tertiary)", marginBottom: 20 }}>None yet. Add one above.</p>
          : <div style={{ marginBottom: 20 }}>{custom.map((r) => <CategoryRow key={r.id} row={r} count={counts[r.slug] ?? 0} cats={cats} />)}</div>}

        <div className="db-fieldset-label">Built-in</div>
        <div>{builtin.map((r) => <CategoryRow key={r.id} row={r} count={counts[r.slug] ?? 0} cats={cats} />)}</div>
      </div>
    </Sheet>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const [ctx, setCtx] = useState<{ orgId: string; accessToken: string } | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [loading, setLoading] = useState(true)
  const cats = useExerciseCategories(ctx?.orgId ?? "")

  const [q, setQ] = useState("")
  const [source, setSource] = useState<Source>("all")
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all")
  const [category, setCategory] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [equipment, setEquipment] = useState<Equipment | "all">("all")
  const [mediaOnly, setMediaOnly] = useState(false)
  const [sort, setSort] = useState<"name" | "mine" | "recent">("name")
  const [dense, setDense] = useState(false)

  const [detail, setDetail] = useState<WorkoutExercise | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<ExerciseSheetMode>("create")
  const [formEx, setFormEx] = useState<WorkoutExercise | null>(null)
  const [catsOpen, setCatsOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function init() {
      const c = await loadOrgContext()
      if (c) setCtx({ orgId: c.orgId, accessToken: c.accessToken })
      const { data } = await supabase.from("workout_exercises").select("*").order("name")
      setExercises((data as WorkoutExercise[]) ?? [])
      setLoading(false)
    }
    init()
  }, [])

  const live = useMemo(() => exercises.filter((e) => e.is_active !== false), [exercises])
  const archivedCount = exercises.length - live.length

  const counts = useMemo(() => {
    const m: Record<string, number> = {}
    live.forEach((e) => (e.category ?? []).forEach((c) => { m[c] = (m[c] ?? 0) + 1 }))
    return m
  }, [live])

  const muscleCounts = useMemo(() => {
    const m: Record<string, number> = {}
    live.forEach((e) => { m[e.muscle_group] = (m[e.muscle_group] ?? 0) + 1 })
    return m
  }, [live])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    const r = (showArchived ? exercises : live).filter((ex) =>
      (!term || ex.name.toLowerCase().includes(term) || (ex.description ?? "").toLowerCase().includes(term)) &&
      (source === "all" || (source === "mine" ? !!ex.org_id : !ex.org_id)) &&
      (muscle === "all" || ex.muscle_group === muscle) &&
      (equipment === "all" || ex.equipment === equipment) &&
      (!mediaOnly || !!(ex.image_url || ex.video_url)) &&
      (!category || (ex.category ?? []).includes(category))
    )
    if (sort === "mine") return [...r].sort((a, b) => Number(!!b.org_id) - Number(!!a.org_id) || a.name.localeCompare(b.name))
    if (sort === "recent") return [...r].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return r
  }, [exercises, live, showArchived, q, source, muscle, equipment, mediaOnly, sort, category])

  const stats = {
    total: live.length,
    mine: live.filter((e) => e.org_id).length,
    categories: cats.ordered.length,
    media: live.filter((e) => e.image_url || e.video_url).length,
  }

  function openForm(mode: ExerciseSheetMode, ex: WorkoutExercise | null) {
    setFormMode(mode); setFormEx(ex); setDetailOpen(false); setFormOpen(true)
  }

  function handleSaved(ex: WorkoutExercise, mode: ExerciseSheetMode) {
    setExercises((prev) => mode === "edit" ? prev.map((e) => (e.id === ex.id ? ex : e)) : [...prev, ex].sort((a, b) => a.name.localeCompare(b.name)))
    setFormOpen(false)
    setDetail(ex); setDetailOpen(true)
  }

  async function toggleArchive() {
    if (!detail || !ctx) return
    const next = detail.is_active === false
    setBusy(true)
    const { error } = await supabase.from("workout_exercises").update({ is_active: next }).eq("id", detail.id).eq("org_id", ctx.orgId)
    setBusy(false)
    if (error) { alert("Couldn't update: " + error.message); return }
    const updated = { ...detail, is_active: next }
    setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    setDetail(updated)
  }

  const anyFilter = !!q || source !== "all" || muscle !== "all" || equipment !== "all" || mediaOnly || !!category

  return (
    <div className="ps-page db wk">
      <DesignStyles />
      <WorkoutStyles />
      <style>{XL_CSS}</style>

      <header className="wk-head">
        <div className="wk-title">
          <span className="wk-title-icon wk-title-icon--ex"><Library size={21} /></span>
          <div>
            <h1>Exercises</h1>
            <p>{loading ? "\u00a0" : `${stats.total} in your library · ${stats.mine} made by your gym`}</p>
          </div>
        </div>
        <div className="wk-kpis">
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-blue"><Library size={15} /></span><div><small>In library</small><b>{loading ? "–" : stats.total}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-purple"><Sparkles size={15} /></span><div><small>Your exercises</small><b>{loading ? "–" : stats.mine}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-green"><Tag size={15} /></span><div><small>Categories</small><b>{cats.loaded ? stats.categories : "–"}</b></div></div>
          <div className="wk-kpi"><span className="wk-kpi-icon wk-tone-amber"><Video size={15} /></span><div><small>With your media</small><b>{loading ? "–" : stats.media}</b></div></div>
        </div>
        <div className="wk-actions">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setCatsOpen(true)}><Tags size={16} /><span>Categories</span></button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => openForm("create", null)}><Plus size={16} strokeWidth={2.4} /><span>New exercise</span></button>
        </div>
      </header>

      <div className="wk-toolbar">
        <div className="wk-row">
          <div className="wk-seg" role="tablist">
            {([["all", "All", stats.total], ["builtin", "Built-in", stats.total - stats.mine], ["mine", "Yours", stats.mine]] as [Source, string, number][]).map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={source === k} onClick={() => setSource(k)}>{label} <span>{n}</span></button>
            ))}
          </div>
          <label className="wk-search"><Search size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names and coaching cues" aria-label="Search exercises" />
          </label>
          <select className="wk-select" value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment | "all")} aria-label="Equipment">
            <option value="all">All equipment</option>
            {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((k) => <option key={k} value={k}>{EQUIPMENT_LABELS[k]}</option>)}
          </select>
          <select className="wk-select" value={sort} onChange={(e) => setSort(e.target.value as "name" | "mine" | "recent")} aria-label="Sort">
            <option value="name">Name A–Z</option>
            <option value="mine">Yours first</option>
            <option value="recent">Recently added</option>
          </select>
          <button type="button" className="wk-chip" aria-pressed={mediaOnly} onClick={() => setMediaOnly((v) => !v)} style={{ ["--chip" as string]: "var(--accent)" } as React.CSSProperties}>
            <ImageIcon size={14} /> Has your media
          </button>
          <div className="wk-seg" aria-label="Card size">
            <button type="button" aria-pressed={!dense} onClick={() => setDense(false)} aria-label="Large cards"><LayoutGrid size={15} /></button>
            <button type="button" aria-pressed={dense} onClick={() => setDense(true)} aria-label="Compact cards"><Rows3 size={15} /></button>
          </div>
        </div>

        <div className="wk-chips" role="group" aria-label="Filter by muscle">
          <button type="button" className="wk-chip" aria-pressed={muscle === "all"} onClick={() => setMuscle("all")}>All muscles <em>{stats.total}</em></button>
          {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((m) => (
            <button key={m} type="button" className="wk-chip" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? "all" : m)}
              style={{ ["--chip" as string]: MUSCLE_COLOR[m] } as React.CSSProperties}>
              <i style={{ background: MUSCLE_COLOR[m] }} />{MUSCLE_GROUP_LABELS[m]} <em>{muscleCounts[m] ?? 0}</em>
            </button>
          ))}
        </div>

        <div className="db-catpick" role="group" aria-label="Filter by category">
          <button type="button" className="db-catopt db-c-blue" aria-pressed={!category} onClick={() => setCategory(null)}>All categories</button>
          {cats.ordered.map((c) => {
            const Icon = categoryIcon(c.slug)
            const on = category === c.slug
            return (
              <button key={c.slug} type="button" className={`db-catopt db-c-${c.color}`} aria-pressed={on} onClick={() => setCategory(on ? null : c.slug)}>
                <Icon size={14} />{c.name}<span style={{ opacity: 0.6, fontVariantNumeric: "tabular-nums" }}>{counts[c.slug] ?? 0}</span>
              </button>
            )
          })}
          <button type="button" className="db-catopt db-catopt--new" onClick={() => setCatsOpen(true)}><Plus size={14} strokeWidth={2.6} />New category</button>
        </div>

        <div className="xl-foot">
          <span>{loading ? "" : `Showing ${filtered.length} of ${showArchived ? exercises.length : stats.total}`}</span>
          {anyFilter && <button type="button" className="xl-clear" onClick={() => { setQ(""); setSource("all"); setMuscle("all"); setEquipment("all"); setMediaOnly(false); setCategory(null) }}>Clear filters</button>}
          {archivedCount > 0 && (
            <label className="db-plan-toggle" style={{ marginLeft: "auto" }}>
              <input type="checkbox" className="db-switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
              Show {archivedCount} archived
            </label>
          )}
        </div>
      </div>

      {loading ? (
        <div className="xl-grid" data-dense={dense}>{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} w="100%" h={dense ? 190 : 260} r={18} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="wk-empty">
          <span className="wk-empty-icon"><Dumbbell size={20} /></span>
          <strong>{source === "mine" && stats.mine === 0 ? "No exercises of your own yet" : "No exercises match"}</strong>
          <p>{source === "mine" && stats.mine === 0 ? "Create one, or customize a built-in exercise." : "Try another search, muscle or category."}</p>
          <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => openForm("create", null)}><Plus size={14} /> New exercise</button>
        </div>
      ) : (
        <div className="xl-grid" data-dense={dense}>
          {filtered.map((ex) => (
            <ExerciseCard key={ex.id} ex={ex} cats={cats} onOpen={() => { setDetail(ex); setDetailOpen(true) }} />
          ))}
        </div>
      )}

      <ExerciseDetail
        ex={detail} open={detailOpen} onClose={() => setDetailOpen(false)} cats={cats} busy={busy}
        onEdit={() => openForm("edit", detail)}
        onCustomize={() => openForm("duplicate", detail)}
        onToggleArchive={toggleArchive}
      />
      <ExerciseSheet
        open={formOpen} onClose={() => setFormOpen(false)} mode={formMode} exercise={formEx}
        orgId={ctx?.orgId ?? ""} accessToken={ctx?.accessToken ?? ""} cats={cats} onSaved={handleSaved}
      />
      <CategoryManager open={catsOpen} onClose={() => setCatsOpen(false)} cats={cats} counts={counts} />
    </div>
  )
}

// NOTE: no backticks inside this CSS.
const XL_CSS = `
.xl-foot { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-tertiary); flex-wrap: wrap; }
.xl-clear { border: none; background: none; font: inherit; font-size: 12.5px; font-weight: 650; color: var(--accent); cursor: pointer; padding: 0; }
.xl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
.xl-grid[data-dense="true"] { grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 10px; }
.xl-card { display: flex; flex-direction: column; padding: 0; border: 1px solid var(--wk-line); border-radius: 18px; background: #fff; overflow: hidden; font: inherit; text-align: left; cursor: pointer; transition: box-shadow 160ms, transform 160ms; }
.xl-card:hover { box-shadow: 0 14px 30px -16px rgba(15,23,42,0.4); transform: translateY(-2px); }
.xl-card[data-archived="true"] { opacity: 0.55; }
.xl-cover { position: relative; aspect-ratio: 4 / 3; background: #eef2f8; overflow: hidden; }
.xl-cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 300ms ease; }
.xl-card:hover .xl-cover img { transform: scale(1.04); }
.xl-noimg { position: absolute; inset: 0; display: grid; place-items: center; color: var(--mc); opacity: 0.6; }
.xl-shade { position: absolute; inset: auto 0 0 0; height: 55%; background: linear-gradient(180deg, transparent, rgba(0,0,0,0.55)); pointer-events: none; }
.xl-flag { position: absolute; top: 10px; left: 10px; height: 22px; padding: 0 9px; border-radius: 11px; display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; background: rgba(255,255,255,0.92); color: var(--text-secondary); backdrop-filter: blur(6px); }
.xl-flag--mine { background: var(--accent, #0a66d6); color: #fff; }
.xl-flag--arch { background: #1c1c1e; color: #fff; }
.xl-video { position: absolute; top: 10px; right: 10px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: rgba(0,0,0,0.55); color: #fff; }
.xl-muscle { position: absolute; left: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px; border-radius: 12px; font-size: 12px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.35); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.25); }
.xl-muscle i { width: 8px; height: 8px; border-radius: 50%; background: var(--mc); box-shadow: 0 0 0 2px rgba(255,255,255,0.6); }
.xl-body { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 14px; border-top: 3px solid var(--mc); }
.xl-name { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.xl-meta { font-size: 12.5px; color: var(--text-tertiary); }
.xl-grid[data-dense="true"] .xl-body { padding: 9px 11px 11px; gap: 4px; }
.xl-grid[data-dense="true"] .xl-name { font-size: 13.5px; }
.xl-grid[data-dense="true"] .db-cats { display: none; }
@media (max-width: 760px) {
  .xl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .xl-grid[data-dense="true"] { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .xl-grid[data-dense="true"] .xl-meta, .xl-grid[data-dense="true"] .xl-muscle { display: none; }
  .xl-body { padding: 10px 11px 12px; }
  .xl-name { font-size: 13.5px; }
  .db-catpick { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
}
`

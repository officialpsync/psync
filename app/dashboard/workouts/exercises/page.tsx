"use client"
// app/dashboard/workouts/exercises/page.tsx
// Exercise library: every built-in + gym exercise, with categories, media, and gym categories.

import { useEffect, useMemo, useState } from "react"
import {
  Plus, Search, Dumbbell, Library, Tag, Tags, Video, Pencil, Copy, Archive, ArchiveRestore, Trash2, Check, Loader2,
} from "lucide-react"
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
  return (
    <button type="button" className="db-card db-ex" data-archived={ex.is_active === false} onClick={onOpen}>
      <div className="db-ex-cover">
        {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : <Dumbbell size={30} strokeWidth={1.8} />}
        <span className={`db-ex-flag${ex.org_id ? " db-ex-flag--mine" : ""}`}>
          {ex.is_active === false ? "Archived" : ex.org_id ? "Yours" : "Built-in"}
        </span>
        {ex.video_url && <span className="db-ex-video" aria-label="Has video"><Video size={13} /></span>}
      </div>
      <div className="db-ex-body">
        <div className="db-ex-name">{ex.name}</div>
        <div className="db-ex-meta">{MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group} · {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}</div>
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

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (showArchived ? exercises : live).filter((ex) =>
      (!term || ex.name.toLowerCase().includes(term)) &&
      (source === "all" || (source === "mine" ? !!ex.org_id : !ex.org_id)) &&
      (muscle === "all" || ex.muscle_group === muscle) &&
      (!category || (ex.category ?? []).includes(category))
    )
  }, [exercises, live, showArchived, q, source, muscle, category])

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

  return (
    <div className="ps-page db">
      <DesignStyles />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Coaching</div>
          <h1 className="db-title">Exercises</h1>
          <p className="db-subtitle">
            {loading ? "\u00a0" : <><strong>{stats.total}</strong> in your library · <strong>{stats.mine}</strong> made by your gym</>}
          </p>
        </div>
        <div className="db-header-actions">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setCatsOpen(true)}><Tags size={16} /><span>Categories</span></button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => openForm("create", null)}><Plus size={16} strokeWidth={2.4} /><span>New exercise</span></button>
        </div>
      </header>

      <div className="db-card db-statbar">
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Library size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">In library</div><div className="db-stat-value">{loading ? "–" : stats.total}</div></div>
        </div>
        <div className="db-stat db-tone-purple">
          <span className="db-chip"><Dumbbell size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Your exercises</div><div className="db-stat-value">{loading ? "–" : stats.mine}</div></div>
        </div>
        <div className="db-stat db-tone-green">
          <span className="db-chip"><Tag size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">Categories</div><div className="db-stat-value">{cats.loaded ? stats.categories : "–"}</div></div>
        </div>
        <div className="db-stat db-tone-blue">
          <span className="db-chip"><Video size={16} /></span>
          <div style={{ minWidth: 0 }}><div className="db-stat-label">With demo media</div><div className="db-stat-value">{loading ? "–" : stats.media}</div></div>
        </div>
      </div>

      <div className="db-card db-toolbar" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div className="dz-tabs db-segtabs" role="tablist">
            {([["all", "All", stats.total], ["builtin", "Built-in", stats.total - stats.mine], ["mine", "Yours", stats.mine]] as [Source, string, number][]).map(([k, label, n]) => (
              <button key={k} type="button" role="tab" aria-selected={source === k} className="dz-tab" onClick={() => setSource(k)}>{label} <span>{n}</span></button>
            ))}
          </div>
          <div className="db-search">
            <Search size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
          </div>
          <select className="db-select" value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup | "all")} aria-label="Muscle group">
            <option value="all">All muscles</option>
            {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((m) => <option key={m} value={m}>{MUSCLE_GROUP_LABELS[m]}</option>)}
          </select>
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

        {archivedCount > 0 && (
          <label className="db-plan-toggle" style={{ alignSelf: "flex-start" }}>
            <input type="checkbox" className="db-switch" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show {archivedCount} archived
          </label>
        )}
      </div>

      {loading ? (
        <div className="db-exgrid">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} w="100%" h={250} r={20} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-icon"><Dumbbell size={18} /></div>
            <div className="db-empty-title">{source === "mine" && stats.mine === 0 ? "No exercises of your own yet" : "No exercises match"}</div>
            <div className="db-empty-text">{source === "mine" && stats.mine === 0 ? "Create one, or customize a built-in exercise." : "Try another search, muscle or category."}</div>
            <button type="button" className="ps-btn ps-btn--primary" style={{ marginTop: 14 }} onClick={() => openForm("create", null)}><Plus size={15} /><span>New exercise</span></button>
          </div>
        </div>
      ) : (
        <div className="db-exgrid">
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

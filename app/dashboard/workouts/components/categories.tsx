"use client"
// app/dashboard/workouts/components/categories.tsx
// Exercise categories: built-ins (org_id null) + each gym's own, from exercise_categories.
// workout_exercises.category stores slugs; this file turns slugs into names, colours and icons.

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Dumbbell, HeartPulse, Sparkles, Waves, Activity, Zap, PersonStanding, Trophy, Tag, Plus, Check, Loader2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { CATEGORY_COLORS, type CategoryColor, type ExerciseCategoryRow } from "@/lib/workout/types"
import { supabase } from "./shared"

const ICONS: Record<string, LucideIcon> = {
  strength: Dumbbell, cardio: HeartPulse, yoga: Sparkles, pilates: Waves,
  mobility: Activity, functional_hiit: Zap, bodyweight: PersonStanding, sports: Trophy,
}

export function categoryIcon(slug: string): LucideIcon { return ICONS[slug] ?? Tag }

export function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30)
}

function titleCase(slug: string) {
  return slug.split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")
}

// ── Data hook ────────────────────────────────────────────────────────────────

export function useExerciseCategories(orgId: string) {
  const [rows, setRows] = useState<ExerciseCategoryRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from("exercise_categories").select("*")
      .order("sort_order").order("name")
    setRows((data as ExerciseCategoryRow[]) ?? [])
    setLoaded(true)
  }, [])

  useEffect(() => { if (orgId) reload() }, [orgId, reload])

  /** Slug → row. If a gym row and a built-in share a slug, the gym's wins. */
  const bySlug = useMemo(() => {
    const m = new Map<string, ExerciseCategoryRow>()
    rows.forEach((r) => { if (!m.has(r.slug) || r.org_id) m.set(r.slug, r) })
    return m
  }, [rows])

  /** Built-ins first (in their set order), then the gym's own A→Z. */
  const ordered = useMemo(() => {
    const list = Array.from(bySlug.values())
    return [
      ...list.filter((r) => !r.org_id).sort((a, b) => a.sort_order - b.sort_order),
      ...list.filter((r) => r.org_id).sort((a, b) => a.name.localeCompare(b.name)),
    ]
  }, [bySlug])

  function meta(slug: string): { name: string; color: CategoryColor; custom: boolean } {
    const r = bySlug.get(slug)
    return { name: r?.name ?? titleCase(slug), color: r?.color ?? "gray", custom: !!r?.org_id }
  }

  /** Creates a gym category — or returns the existing one if the name/slug is already taken. */
  async function create(name: string, color: CategoryColor): Promise<ExerciseCategoryRow> {
    const clean = name.trim().slice(0, 30)
    const slug = slugify(clean)
    if (!slug) throw new Error("Use letters or numbers in the name")
    const existing = ordered.find((r) => r.slug === slug || r.name.toLowerCase() === clean.toLowerCase())
    if (existing) return existing
    const { data, error } = await supabase
      .from("exercise_categories")
      .insert({ org_id: orgId, slug, name: clean, color, sort_order: 100 })
      .select("*").single()
    if (error || !data) throw new Error(error?.message ?? "Couldn't add the category")
    setRows((p) => [...p, data as ExerciseCategoryRow])
    return data as ExerciseCategoryRow
  }

  async function update(row: ExerciseCategoryRow, patch: { name?: string; color?: CategoryColor }) {
    const { error } = await supabase.from("exercise_categories").update(patch).eq("id", row.id).eq("org_id", orgId)
    if (error) throw new Error(error.message)
    setRows((p) => p.map((r) => (r.id === row.id ? { ...r, ...patch } : r)))
  }

  /** Deletes a gym category and removes its tag from this gym's exercises. */
  async function remove(row: ExerciseCategoryRow) {
    const { data: tagged } = await supabase
      .from("workout_exercises").select("id, category")
      .eq("org_id", orgId).contains("category", [row.slug])
    for (const ex of (tagged as { id: string; category: string[] }[]) ?? []) {
      await supabase.from("workout_exercises")
        .update({ category: ex.category.filter((c) => c !== row.slug) })
        .eq("id", ex.id).eq("org_id", orgId)
    }
    const { error } = await supabase.from("exercise_categories").delete().eq("id", row.id).eq("org_id", orgId)
    if (error) throw new Error(error.message)
    setRows((p) => p.filter((r) => r.id !== row.id))
  }

  return { rows, ordered, bySlug, loaded, meta, create, update, remove, reload }
}

export type CategoriesApi = ReturnType<typeof useExerciseCategories>

// ── Read-only tags ───────────────────────────────────────────────────────────

export function CategoryTag({ slug, cats, icon = true }: { slug: string; cats: CategoriesApi; icon?: boolean }) {
  const m = cats.meta(slug)
  const Icon = categoryIcon(slug)
  return (
    <span className={`db-cat db-c-${m.color}`}>
      {icon && <Icon size={11} strokeWidth={2.4} />}
      {m.name}
    </span>
  )
}

export function CategoryTags({ slugs, cats, max = 3 }: { slugs: string[] | null | undefined; cats: CategoriesApi; max?: number }) {
  const list = slugs ?? []
  if (!list.length) return null
  return (
    <div className="db-cats">
      {list.slice(0, max).map((s) => <CategoryTag key={s} slug={s} cats={cats} />)}
      {list.length > max && <span className="db-cat db-cat--more">+{list.length - max}</span>}
    </div>
  )
}

// ── Colour swatches ──────────────────────────────────────────────────────────

export function ColorSwatches({ value, onChange }: { value: CategoryColor; onChange: (c: CategoryColor) => void }) {
  return (
    <div className="db-swatches" role="radiogroup" aria-label="Colour">
      {CATEGORY_COLORS.map((c) => (
        <button
          key={c} type="button" role="radio" aria-checked={value === c} aria-pressed={value === c} aria-label={c}
          className={`db-swatch db-c-${c}`} onClick={() => onChange(c)}
        >
          {value === c && <Check size={13} strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

// ── Multi-select picker with inline "new category" ──────────────────────────

export function CategoryPicker({ value, onChange, cats }: {
  value: string[]; onChange: (next: string[]) => void; cats: CategoriesApi
}) {
  const [composing, setComposing] = useState(false)
  const [name, setName] = useState("")
  const [color, setColor] = useState<CategoryColor>("blue")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  // Options = every known category, plus any slug on this exercise that has no row (old free-text tags)
  const options = useMemo(() => {
    const known = cats.ordered.map((r) => r.slug)
    return [...known, ...value.filter((s) => !known.includes(s))]
  }, [cats.ordered, value])

  function toggle(slug: string) {
    onChange(value.includes(slug) ? value.filter((s) => s !== slug) : [...value, slug])
  }

  async function add() {
    if (!name.trim()) return
    setBusy(true); setErr("")
    try {
      const row = await cats.create(name, color)
      if (!value.includes(row.slug)) onChange([...value, row.slug])
      setComposing(false); setName(""); setColor("blue")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add the category")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="db-catpick">
        {options.map((slug) => {
          const m = cats.meta(slug)
          const Icon = categoryIcon(slug)
          const on = value.includes(slug)
          return (
            <button key={slug} type="button" aria-pressed={on} className={`db-catopt db-c-${m.color}`} onClick={() => toggle(slug)}>
              {on ? <Check size={14} strokeWidth={2.6} /> : <Icon size={14} />}
              {m.name}
            </button>
          )
        })}
        {!composing && (
          <button type="button" className="db-catopt db-catopt--new" onClick={() => setComposing(true)}>
            <Plus size={14} strokeWidth={2.6} /> New category
          </button>
        )}
      </div>

      {composing && (
        <div className="db-catnew">
          <div className="db-catnew-row">
            <input
              autoFocus className="ps-input" value={name} maxLength={30} placeholder="e.g. TRX, Zumba, Rehab"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add() }
                if (e.key === "Escape") { setComposing(false); setName("") }
              }}
            />
          </div>
          <ColorSwatches value={color} onChange={setColor} />
          {err && <div className="ps-error">{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => { setComposing(false); setName(""); setErr("") }}>Cancel</button>
            <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={add} disabled={busy || !name.trim()}>
              {busy && <Loader2 size={13} className="ps-spin" />} Add category
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

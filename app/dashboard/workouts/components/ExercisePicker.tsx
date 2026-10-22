"use client"
// app/dashboard/workouts/components/ExercisePicker.tsx
// "Add exercise" sheet for the plan builder: search, filter by muscle / category / source.

import { useEffect, useMemo, useState } from "react"
import { Plus, Search, Dumbbell } from "lucide-react"
import { Sheet } from "../../components/Sheet"
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS, type MuscleGroup, type WorkoutExercise } from "@/lib/workout/types"
import { CategoryTags, type CategoriesApi } from "./categories"
import { ExerciseThumb } from "./shared"

type Source = "all" | "builtin" | "mine"

export function ExercisePicker({ open, onClose, exercises, cats, onSelect, onCreateNew }: {
  open: boolean
  onClose: () => void
  exercises: WorkoutExercise[]
  cats: CategoriesApi
  onSelect: (ex: WorkoutExercise) => void
  onCreateNew: () => void
}) {
  const [q, setQ] = useState("")
  const [muscle, setMuscle] = useState<MuscleGroup | "all">("all")
  const [category, setCategory] = useState("all")
  const [source, setSource] = useState<Source>("all")

  useEffect(() => { if (open) setQ("") }, [open])

  const active = useMemo(() => exercises.filter((e) => e.is_active !== false), [exercises])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return active.filter((ex) =>
      (!term || ex.name.toLowerCase().includes(term)) &&
      (muscle === "all" || ex.muscle_group === muscle) &&
      (category === "all" || (ex.category ?? []).includes(category)) &&
      (source === "all" || (source === "mine" ? !!ex.org_id : !ex.org_id))
    )
  }, [active, q, muscle, category, source])

  const counts = {
    all: active.length,
    builtin: active.filter((e) => !e.org_id).length,
    mine: active.filter((e) => !!e.org_id).length,
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise" description={`${filtered.length} of ${active.length} exercises`}>
      <div className="db">
        <div>
          <div className="db-search">
            <Search size={16} />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises" aria-label="Search exercises" />
          </div>

          <div className="db-pick-filters">
            <select className="db-select" value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup | "all")} aria-label="Muscle group">
              <option value="all">All muscles</option>
              {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((m) => <option key={m} value={m}>{MUSCLE_GROUP_LABELS[m]}</option>)}
            </select>
            <select className="db-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {cats.ordered.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>

          <div className="dz-tabs db-segtabs" role="tablist" style={{ marginTop: 10 }}>
            {([["all", "All"], ["builtin", "Built-in"], ["mine", "Yours"]] as [Source, string][]).map(([k, label]) => (
              <button key={k} type="button" role="tab" aria-selected={source === k} className="dz-tab" onClick={() => setSource(k)}>
                {label} <span>{counts[k]}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <button type="button" className="db-pick-create" onClick={onCreateNew}>
            <span className="db-exrow-thumb" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}><Plus size={18} /></span>
            <span style={{ minWidth: 0 }}>
              <span className="db-row-title" style={{ display: "block", color: "var(--accent)" }}>Create a new exercise</span>
              <span className="db-row-sub" style={{ display: "block" }}>With your own category, cues, image or video</span>
            </span>
          </button>

          {filtered.length === 0 ? (
            <div className="db-empty">
              <div className="db-empty-icon"><Dumbbell size={18} /></div>
              <div className="db-empty-title">No exercises match</div>
              <div className="db-empty-text">Try another search or filter, or create a new one.</div>
            </div>
          ) : (
            <div className="db-rows" style={{ margin: 0 }}>
              {filtered.map((ex) => (
                <button key={ex.id} type="button" className="db-row db-row-btn" onClick={() => onSelect(ex)}>
                  <ExerciseThumb ex={ex} />
                  <div className="db-row-text">
                    <div className="db-row-title">{ex.name}</div>
                    <div className="db-row-sub">
                      {MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group} · {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}
                      {ex.org_id ? " · Yours" : ""}
                    </div>
                    {(ex.category?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 6 }}><CategoryTags slugs={ex.category} cats={cats} max={2} /></div>
                    )}
                  </div>
                  <Plus size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

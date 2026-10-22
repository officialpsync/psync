"use client"
// app/dashboard/workouts/components/WorkoutDayTabs.tsx
// Read-only schedule: day switcher + one card of expandable exercise rows.

import { useState } from "react"
import { ChevronDown, Moon } from "lucide-react"
import { MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS, type WorkoutProgramDay, type WorkoutProgramItem } from "@/lib/workout/types"
import { ExerciseImages } from "./ExerciseMedia"
import { ExerciseThumb } from "./shared"
import { CategoryTags, type CategoriesApi } from "./categories"

function prescription(item: WorkoutProgramItem): string {
  const timed = item.exercise?.muscle_group === "cardio" || item.exercise?.movement_type === "cardio"
  const work = timed && item.duration_sec ? `${item.sets} × ${item.duration_sec}s` : `${item.sets} × ${item.reps}`
  return item.weight_kg ? `${work} @ ${item.weight_kg} kg` : work
}

function Row({ item, index, cats }: { item: WorkoutProgramItem; index: number; cats?: CategoriesApi }) {
  const [open, setOpen] = useState(false)
  const ex = item.exercise
  return (
    <div className="db-mealrow-wrap" data-open={open}>
      <button type="button" className="db-mealrow-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span className="db-exrow-num">{index + 1}</span>
          {ex && <ExerciseThumb ex={ex} />}
          <div style={{ minWidth: 0 }}>
            <div className="db-mealrow-name">{ex?.name ?? "Exercise removed"}</div>
            <div className="db-mealrow-sub">
              {ex ? `${MUSCLE_GROUP_LABELS[ex.muscle_group] ?? ex.muscle_group} · ${EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}` : ""}
              {item.rest_sec > 0 ? ` · ${item.rest_sec}s rest` : ""}
            </div>
          </div>
        </div>
        <div className="db-mealrow-kcal" style={{ fontSize: 15 }}>{prescription(item)}</div>
        <ChevronDown size={16} className="db-meal-chev" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms var(--db-ease)" }} />
      </button>

      {open && (
        <div className="db-meal-body">
          {ex && <ExerciseImages name={ex.name} imageUrl={ex.image_url} videoUrl={ex.video_url} />}
          {item.notes && <div className="db-callout db-tone-blue" style={{ marginBottom: 12 }}>{item.notes}</div>}
          {ex?.description && <p className="db-prose">{ex.description}</p>}
          {cats && ex && (ex.category?.length ?? 0) > 0 && (
            <div style={{ marginTop: 12 }}><CategoryTags slugs={ex.category} cats={cats} max={6} /></div>
          )}
          {!item.notes && !ex?.description && !(ex?.category?.length) && (
            <div className="db-card-sub" style={{ marginTop: 0 }}>No coaching cues for this exercise yet.</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function WorkoutDayTabs({ days, cats }: { days: WorkoutProgramDay[]; cats?: CategoriesApi }) {
  const [active, setActive] = useState(0)
  const day = days[active]
  const items = day?.items ?? []

  return (
    <div>
      <div className="db-day-tabs" role="group" aria-label="Choose a day">
        {days.map((d, i) => (
          <button key={d.id} type="button" className="db-day-tab" aria-pressed={i === active} onClick={() => setActive(i)}>
            <span className="db-day-tab-name">Day {d.day_number}{d.items?.length ? ` · ${d.items.length}` : ""}</span>
            <span className="db-day-tab-label">{d.day_name}</span>
          </button>
        ))}
      </div>

      <div className="db-section-head">
        <h2 className="db-section-title" style={{ margin: 0 }}>{day?.day_name}</h2>
        {day?.focus && <span className="db-card-sub">{day.focus}</span>}
      </div>

      {items.length === 0 ? (
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-icon"><Moon size={18} /></div>
            <div className="db-empty-title">Rest day</div>
            <div className="db-empty-text">No exercises scheduled for this day.</div>
          </div>
        </div>
      ) : (
        <div className="db-card db-meallist">
          {items.map((it, i) => <Row key={it.id} item={it} index={i} cats={cats} />)}
        </div>
      )}
    </div>
  )
}

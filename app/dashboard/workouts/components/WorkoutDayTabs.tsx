"use client"
// app/dashboard/workouts/components/WorkoutDayTabs.tsx

import { useState } from "react"
import { ChevronDown, ChevronUp, Clock } from "lucide-react"
import { WorkoutProgramDay, WorkoutProgramItem, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from "@/lib/workout/types"
import { ExerciseThumbnail, ExerciseImages } from "./ExerciseMedia"

// ─── ExerciseRow ──────────────────────────────────────────────────────────────

function ExerciseRow({ item }: { item: WorkoutProgramItem }) {
  const [open, setOpen] = useState(false)
  const ex = item.exercise
  const isCardio = ex?.muscle_group === "cardio"
  const setsLabel = isCardio && item.duration_sec
    ? `${item.sets} × ${item.duration_sec}s`
    : `${item.sets} × ${item.reps}`

  return (
    <div className="ps-card" style={{ overflow: "hidden" }}>
      <button
        type="button"
        className="ps-meal-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ minHeight: 60, padding: "12px 16px", gap: 12, cursor: "pointer" }}
      >
        <ExerciseThumbnail name={ex?.name} imageUrl={ex?.image_url} />

        <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
          <div className="ps-meal-name" style={{ fontSize: 14 }}>{ex?.name ?? "Unknown exercise"}</div>
          {ex && (
            <div className="ps-meal-type">
              {MUSCLE_GROUP_LABELS[ex.muscle_group]} · {EQUIPMENT_LABELS[ex.equipment]}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span className="ps-badge" style={{ fontVariantNumeric: "tabular-nums", fontSize: 13, fontWeight: 600 }}>
            {setsLabel}
          </span>
          {item.weight_kg && (
            <span className="ps-badge ps-badge--blue" style={{ fontSize: 12 }}>
              @ {item.weight_kg} kg
            </span>
          )}
          {item.rest_sec > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 12, color: "var(--text-tertiary)" }}>
              <Clock size={11} />{item.rest_sec}s
            </span>
          )}
          <span className="ps-meal-chevron">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </div>
      </button>

      {open && (
        <div className="ps-meal-body" style={{ padding: "4px 16px 14px" }}>
          <ExerciseImages name={ex?.name} imageUrl={ex?.image_url} videoUrl={ex?.video_url} />

          <div style={{
            display: "flex", gap: 16, flexWrap: "wrap",
            marginBottom: item.notes ? 10 : 0,
            fontSize: 13, color: "var(--text-secondary)",
          }}>
            <span><strong style={{ color: "var(--text-primary)" }}>{item.sets}</strong> sets</span>
            {!isCardio && <span><strong style={{ color: "var(--text-primary)" }}>{item.reps}</strong> reps</span>}
            {isCardio && item.duration_sec && (
              <span><strong style={{ color: "var(--text-primary)" }}>{item.duration_sec}s</strong> duration</span>
            )}
            {item.weight_kg && (
              <span><strong style={{ color: "var(--text-primary)" }}>{item.weight_kg} kg</strong> target</span>
            )}
            {item.rest_sec > 0 && (
              <span><strong style={{ color: "var(--text-primary)" }}>{item.rest_sec}s</strong> rest</span>
            )}
          </div>

          {item.notes && (
            <p style={{ fontSize: 13.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
              {item.notes}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── WorkoutDayTabs ───────────────────────────────────────────────────────────

export default function WorkoutDayTabs({ days }: { days: WorkoutProgramDay[] }) {
  const [active, setActive] = useState(0)
  const day = days[active]

  return (
    <div className="ps-card" style={{ overflow: "hidden" }}>
      <div style={{
        display: "flex", overflowX: "auto", scrollbarWidth: "none",
        borderBottom: "1px solid var(--separator)",
      }}>
        {days.map((d, i) => (
          <button key={d.id} type="button" onClick={() => setActive(i)}
            style={{
              padding: "10px 18px", border: "none",
              borderBottom: active === i ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1, background: "none", cursor: "pointer",
              fontSize: 13, fontWeight: active === i ? 600 : 500,
              color: active === i ? "var(--accent)" : "var(--text-secondary)",
              whiteSpace: "nowrap", fontFamily: "inherit",
            }}
          >
            {d.day_name}
            {d.items && d.items.length > 0 && (
              <span
                className={active === i ? "ps-badge ps-badge--blue" : "ps-badge"}
                style={{ height: 18, fontSize: 11, marginLeft: 6, padding: "0 6px" }}
              >
                {d.items.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
        {day.focus && (
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 14 }}>
            {day.focus}
          </p>
        )}
        {!day.items?.length ? (
          <div className="ps-empty" style={{ padding: "28px 16px" }}>
            <div className="ps-empty-title">Rest day</div>
            <div className="ps-empty-text">No exercises scheduled</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {day.items.map((item) => <ExerciseRow key={item.id} item={item} />)}
          </div>
        )}
      </div>
    </div>
  )
}

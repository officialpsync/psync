"use client"
// app/dashboard/workouts/components/ExerciseMedia.tsx
// Shared exercise images for the plan view (WorkoutDayTabs) and template preview.
// Supports both static exercise library images (exerciseImageUrl) and custom
// gym-uploaded images/videos stored in R2 (image_url / video_url on the exercise row).

import { useState } from "react"
import { Dumbbell, Play } from "lucide-react"
import { exerciseImageUrl } from "@/lib/workout/exerciseImages"

const frameStyle = {
  overflow: "hidden",
  background: "var(--fill)",
  border: "1px solid var(--border)",
} as const

const imgStyle = { width: "100%", height: "100%", objectFit: "cover", display: "block" } as const

/** 44×44 thumbnail. Prefers the gym-uploaded image_url, then falls back to the
 *  static exercise library image, then to the dumbbell icon tile. */
export function ExerciseThumbnail({
  name, size = 44, imageUrl,
}: { name?: string | null; size?: number; imageUrl?: string | null }) {
  const [failed, setFailed] = useState(false)
  // Gym-uploaded image takes priority over the static library image
  const src = (!failed && imageUrl) ? imageUrl : (!failed && exerciseImageUrl(name, 0)) ? exerciseImageUrl(name, 0) : null

  if (!src || failed) {
    return (
      <div className="ps-tile ps-tile--blue ps-tile--sm" style={{ flexShrink: 0 }}>
        <Dumbbell size={14} />
      </div>
    )
  }

  return (
    <div style={{ ...frameStyle, width: size, height: size, borderRadius: 10, flexShrink: 0 }}>
      <img src={src} alt={name ?? ""} loading="lazy" onError={() => setFailed(true)} style={imgStyle} />
    </div>
  )
}

/** Start + end position images shown when an exercise row is expanded.
 *  If the exercise has a gym-uploaded image or video, shows those instead of
 *  the static library frames. */
export function ExerciseImages({
  name, imageUrl, videoUrl,
}: { name?: string | null; imageUrl?: string | null; videoUrl?: string | null }) {
  const [failed, setFailed] = useState<[boolean, boolean]>([false, false])

  // ── Custom gym media ────────────────────────────────────────────────────
  if (videoUrl) {
    return (
      <div style={{ marginBottom: 12, borderRadius: 12, overflow: "hidden", border: "1px solid var(--separator)" }}>
        <video
          src={videoUrl}
          controls
          playsInline
          preload="metadata"
          style={{ width: "100%", maxHeight: 280, display: "block", background: "#000" }}
        />
      </div>
    )
  }

  if (imageUrl) {
    return (
      <div style={{ ...frameStyle, borderRadius: 12, marginBottom: 12, aspectRatio: "16/9" }}>
        <img src={imageUrl} alt={name ?? ""} loading="lazy" style={imgStyle} />
      </div>
    )
  }

  // ── Fall back to static library frames ──────────────────────────────────
  const frames = ([0, 1] as const)
    .map((f) => ({ f, src: exerciseImageUrl(name, f) }))
    .filter(({ f, src }) => src && !failed[f])

  if (!frames.length) return null

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      {frames.map(({ f, src }) => (
        <div key={f} style={{ ...frameStyle, flex: 1, borderRadius: 10, aspectRatio: "4/3" }}>
          <img
            src={src!}
            alt={`${name} ${f === 0 ? "start" : "end"}`}
            loading="lazy"
            onError={() => setFailed((p) => (f === 0 ? [true, p[1]] : [p[0], true]))}
            style={imgStyle}
          />
        </div>
      ))}
    </div>
  )
}

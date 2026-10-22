"use client"
// app/dashboard/workouts/components/ExerciseSheet.tsx
// One form for creating, editing and duplicating ("customize") an exercise.
// Used by the exercise library page and by the plan builder's picker.

import { useEffect, useRef, useState, type ChangeEvent } from "react"
import { ImagePlus, Video, X, Loader2 } from "lucide-react"
import { Sheet } from "../../components/Sheet"
import {
  MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS, MOVEMENT_LABELS,
  type WorkoutExercise, type MuscleGroup, type Equipment, type MovementType,
} from "@/lib/workout/types"
import { CategoryPicker, type CategoriesApi } from "./categories"
import { supabase, uploadToR2 } from "./shared"

export type ExerciseSheetMode = "create" | "edit" | "duplicate"

type Media = { file: File | null; url: string | null } // url = existing upload or a local preview

const EMPTY = {
  name: "", muscle_group: "chest" as MuscleGroup, equipment: "bodyweight" as Equipment,
  movement_type: "compound" as MovementType, category: [] as string[], description: "",
}

export function ExerciseSheet({ open, onClose, mode, exercise, orgId, accessToken, cats, onSaved }: {
  open: boolean
  onClose: () => void
  mode: ExerciseSheetMode
  exercise?: WorkoutExercise | null
  orgId: string
  accessToken: string
  cats: CategoriesApi
  onSaved: (ex: WorkoutExercise, mode: ExerciseSheetMode) => void
}) {
  const [form, setForm] = useState(EMPTY)
  const [image, setImage] = useState<Media>({ file: null, url: null })
  const [video, setVideo] = useState<Media>({ file: null, url: null })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const imageRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  // The Sheet stays mounted, so reset the form every time it opens.
  useEffect(() => {
    if (!open) return
    setError(""); setSaving(false)
    if (exercise && mode !== "create") {
      setForm({
        name: exercise.name,
        muscle_group: exercise.muscle_group,
        equipment: exercise.equipment,
        movement_type: exercise.movement_type,
        category: exercise.category ?? [],
        description: exercise.description ?? "",
      })
      setImage({ file: null, url: exercise.image_url })
      setVideo({ file: null, url: exercise.video_url })
    } else {
      setForm(EMPTY)
      setImage({ file: null, url: null })
      setVideo({ file: null, url: null })
    }
  }, [open, mode, exercise])

  function pick(e: ChangeEvent<HTMLInputElement>, kind: "image" | "video") {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const limit = kind === "image" ? 10 : 100
    if (file.size > limit * 1024 * 1024) { setError(`That ${kind} is over ${limit} MB`); return }
    const media = { file, url: URL.createObjectURL(file) }
    if (kind === "image") setImage(media); else setVideo(media)
  }

  async function save() {
    if (!form.name.trim()) { setError("Give the exercise a name"); return }
    setSaving(true); setError("")
    try {
      const image_url = image.file ? await uploadToR2(image.file, accessToken) : image.url
      const video_url = video.file ? await uploadToR2(video.file, accessToken) : video.url
      const payload = {
        name: form.name.trim(),
        muscle_group: form.muscle_group,
        equipment: form.equipment,
        movement_type: form.movement_type,
        category: form.category,
        description: form.description.trim() || null,
        image_url,
        video_url,
      }

      const query = mode === "edit" && exercise
        ? supabase.from("workout_exercises").update(payload).eq("id", exercise.id).eq("org_id", orgId)
        : supabase.from("workout_exercises").insert({ ...payload, org_id: orgId, is_active: true })

      const { data, error: err } = await query.select("*").single()
      if (err || !data) throw new Error(err?.message ?? "Couldn't save the exercise")
      onSaved(data as WorkoutExercise, mode)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const title = mode === "edit" ? "Edit exercise" : mode === "duplicate" ? "Customize exercise" : "New exercise"
  const description = mode === "duplicate"
    ? "Saves your own copy to the library. The built-in version stays unchanged."
    : undefined

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={save} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            <span>{saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save exercise"}</span>
          </button>
        </>
      }
    >
      <div className="db">
        {error && <div className="ps-error" style={{ marginBottom: 14 }}>{error}</div>}

        <div className="db-fieldset">
          <label className="db-fieldset-label" htmlFor="ex-name">Name</label>
          <input
            id="ex-name" className="ps-input" value={form.name} maxLength={80}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Bulgarian Split Squat"
          />
        </div>

        <div className="db-fieldset">
          <div className="ps-form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <div className="ps-field">
              <label className="ps-label" htmlFor="ex-muscle">Muscle group</label>
              <select id="ex-muscle" className="ps-input" value={form.muscle_group}
                onChange={(e) => setForm((f) => ({ ...f, muscle_group: e.target.value as MuscleGroup }))}>
                {(Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((m) => <option key={m} value={m}>{MUSCLE_GROUP_LABELS[m]}</option>)}
              </select>
            </div>
            <div className="ps-field">
              <label className="ps-label" htmlFor="ex-equip">Equipment</label>
              <select id="ex-equip" className="ps-input" value={form.equipment}
                onChange={(e) => setForm((f) => ({ ...f, equipment: e.target.value as Equipment }))}>
                {(Object.keys(EQUIPMENT_LABELS) as Equipment[]).map((q) => <option key={q} value={q}>{EQUIPMENT_LABELS[q]}</option>)}
              </select>
            </div>
            <div className="ps-field">
              <label className="ps-label" htmlFor="ex-move">Movement</label>
              <select id="ex-move" className="ps-input" value={form.movement_type}
                onChange={(e) => setForm((f) => ({ ...f, movement_type: e.target.value as MovementType }))}>
                {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map((m) => <option key={m} value={m}>{MOVEMENT_LABELS[m]}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="db-fieldset">
          <span className="db-fieldset-label">
            Categories
            {form.category.length > 0 && <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}> · {form.category.length} selected</span>}
          </span>
          <CategoryPicker value={form.category} onChange={(category) => setForm((f) => ({ ...f, category }))} cats={cats} />
        </div>

        <div className="db-fieldset">
          <label className="db-fieldset-label" htmlFor="ex-desc">Coaching cues <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>(optional)</span></label>
          <textarea
            id="ex-desc" className="ps-input" rows={3} value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Setup, tempo, what to feel, common mistakes…"
          />
        </div>

        <div className="db-fieldset">
          <span className="db-fieldset-label">Demo media <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>(optional)</span></span>
          <div className="db-media">
            {image.url ? (
              <div className="db-drop-preview">
                <img src={image.url} alt="" />
                <button type="button" className="db-drop-remove" aria-label="Remove image" onClick={() => setImage({ file: null, url: null })}><X size={14} /></button>
              </div>
            ) : (
              <button type="button" className="db-drop" onClick={() => imageRef.current?.click()}>
                <ImagePlus size={20} />
                <strong>Add image</strong>
                <span>JPG, PNG, WebP · 10 MB</span>
              </button>
            )}
            {video.url ? (
              <div className="db-drop-preview">
                <video src={video.url} muted playsInline controls />
                <button type="button" className="db-drop-remove" aria-label="Remove video" onClick={() => setVideo({ file: null, url: null })}><X size={14} /></button>
              </div>
            ) : (
              <button type="button" className="db-drop" onClick={() => videoRef.current?.click()}>
                <Video size={20} />
                <strong>Add video</strong>
                <span>MP4, WebM · 100 MB</span>
              </button>
            )}
          </div>
          <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => pick(e, "image")} />
          <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => pick(e, "video")} />
        </div>
      </div>
    </Sheet>
  )
}

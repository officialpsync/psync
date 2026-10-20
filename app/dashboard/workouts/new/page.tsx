"use client"
// app/dashboard/workouts/new/page.tsx

import React, { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Loader2, Plus, Search, Trash2, X, GripVertical, ChevronDown, ChevronUp, Image, Video, Upload, ArrowLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { WorkoutExercise, WorkoutGoal, Difficulty, MuscleGroup, GOAL_LABELS, DIFFICULTY_LABELS, MUSCLE_GROUP_LABELS, EQUIPMENT_LABELS } from "@/lib/workout/types"

interface DayDraft { day_number: number; day_name: string; focus: string; items: ItemDraft[] }
interface ItemDraft { uid: string; exercise: WorkoutExercise; sets: number; reps: string; weight_kg: string; duration_sec: string; rest_sec: number; notes: string }

const DEFAULT_DAY_NAMES: Record<number, string[]> = {
  2: ["Upper Body", "Lower Body"],
  3: ["Push Day", "Pull Day", "Leg Day"],
  4: ["Push Day", "Pull Day", "Leg Day", "Upper Body"],
  5: ["Push Day", "Pull Day", "Leg Day", "Upper Body", "Core & Cardio"],
  6: ["Push Day", "Pull Day", "Leg Day", "Push Day 2", "Pull Day 2", "Leg Day 2"],
}

function uid() { return Math.random().toString(36).slice(2) }

// ── R2 upload helper ────────────────────────────────────────────────────────
async function uploadToR2(
  file: File,
  folder: "exercises",
  accessToken: string,
): Promise<{ publicUrl: string }> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ contentType: file.type, size: file.size, folder }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Couldn't get upload URL")
  }
  const { uploadUrl, publicUrl } = await res.json()
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  })
  if (!put.ok) throw new Error("Upload to storage failed. Check your R2 bucket CORS settings.")
  return { publicUrl }
}

// ── Create custom exercise panel ─────────────────────────────────────────────
type NewExerciseDraft = {
  name: string; muscle_group: string; equipment: string; movement_type: string;
  description: string; imageFile: File | null; videoFile: File | null;
  imagePreview: string | null; videoPreview: string | null;
}

function CreateExercisePanel({ orgId, accessToken, onCreated, onBack }: {
  orgId: string; accessToken: string;
  onCreated: (ex: WorkoutExercise) => void; onBack: () => void;
}) {
  const [draft, setDraft] = useState<NewExerciseDraft>({
    name: "", muscle_group: "chest", equipment: "bodyweight", movement_type: "compound",
    description: "", imageFile: null, videoFile: null, imagePreview: null, videoPreview: null,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const imageRef = React.useRef<HTMLInputElement>(null)
  const videoRef = React.useRef<HTMLInputElement>(null)

  function pickFile(e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    if (type === "image") setDraft((d) => ({ ...d, imageFile: file, imagePreview: preview }))
    else setDraft((d) => ({ ...d, videoFile: file, videoPreview: preview }))
    e.target.value = ""
  }

  async function handleSave() {
    if (!draft.name.trim()) { setError("Exercise name is required"); return }
    setSaving(true); setError("")
    try {
      let image_url: string | null = null
      let video_url: string | null = null

      if (draft.imageFile) {
        const r = await uploadToR2(draft.imageFile, "exercises", accessToken)
        image_url = r.publicUrl
      }
      if (draft.videoFile) {
        const r = await uploadToR2(draft.videoFile, "exercises", accessToken)
        video_url = r.publicUrl
      }

      const { data, error: err } = await supabase
        .from("workout_exercises")
        .insert({
          org_id: orgId,
          name: draft.name.trim(),
          muscle_group: draft.muscle_group,
          equipment: draft.equipment,
          movement_type: draft.movement_type,
          description: draft.description.trim() || null,
          image_url,
          video_url,
        })
        .select("*")
        .single()

      if (err || !data) throw new Error(err?.message ?? "Couldn't save exercise")
      onCreated(data as WorkoutExercise)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const MUSCLES = ["chest","back","shoulders","arms","legs","core","cardio","full_body"]
  const EQUIP = ["bodyweight","barbell","dumbbell","machine","cable","kettlebell","resistance_band","other"]
  const MOVEMENT = ["compound","isolation","cardio"]

  return (
    <div style={{ padding: "0 0 20px" }}>
      <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" onClick={onBack} style={{ marginBottom: 10 }}>
        <ArrowLeft size={14} /> Back to exercise list
      </button>

      {error && <div className="ps-error" style={{ marginBottom: 14 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="ps-field">
          <label className="ps-label">Exercise name *</label>
          <input className="ps-input" autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Bulgarian Split Squat" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="ps-field">
            <label className="ps-label">Muscle group</label>
            <select className="ps-input" value={draft.muscle_group} onChange={(e) => setDraft((d) => ({ ...d, muscle_group: e.target.value }))}>
              {MUSCLES.map((m) => <option key={m} value={m}>{MUSCLE_GROUP_LABELS[m as MuscleGroup] ?? m}</option>)}
            </select>
          </div>
          <div className="ps-field">
            <label className="ps-label">Equipment</label>
            <select className="ps-input" value={draft.equipment} onChange={(e) => setDraft((d) => ({ ...d, equipment: e.target.value }))}>
              {EQUIP.map((eq) => <option key={eq} value={eq}>{EQUIPMENT_LABELS[eq] ?? eq}</option>)}
            </select>
          </div>
          <div className="ps-field">
            <label className="ps-label">Movement type</label>
            <select className="ps-input" value={draft.movement_type} onChange={(e) => setDraft((d) => ({ ...d, movement_type: e.target.value }))}>
              {MOVEMENT.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
        </div>

        <div className="ps-field">
          <label className="ps-label">Instructions (optional)</label>
          <textarea className="ps-input" rows={3} value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Step-by-step coaching cues…" />
        </div>

        {/* Media upload */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {/* Image */}
          <div>
            <div className="ps-label" style={{ marginBottom: 6 }}>Demo image (optional)</div>
            {draft.imagePreview ? (
              <div style={{ position: "relative" }}>
                <img src={draft.imagePreview} alt="Preview" style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10, display: "block" }} />
                <button type="button" className="ps-icon-btn" style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", color: "#fff", width: 24, height: 24 }}
                  onClick={() => setDraft((d) => ({ ...d, imageFile: null, imagePreview: null }))}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => imageRef.current?.click()}
                style={{ width: "100%", height: 100, borderRadius: 10, border: "1.5px dashed var(--separator)", background: "var(--fill)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--text-tertiary)" }}>
                <Image size={20} />
                <span style={{ fontSize: 12.5 }}>Upload image</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>JPG, PNG, WebP · max 10 MB</span>
              </button>
            )}
            <input ref={imageRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }} onChange={(e) => pickFile(e, "image")} />
          </div>

          {/* Video */}
          <div>
            <div className="ps-label" style={{ marginBottom: 6 }}>Demo video (optional)</div>
            {draft.videoPreview ? (
              <div style={{ position: "relative" }}>
                <video src={draft.videoPreview} controls muted style={{ width: "100%", height: 130, objectFit: "cover", borderRadius: 10, display: "block" }} />
                <button type="button" className="ps-icon-btn" style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.5)", color: "#fff", width: 24, height: 24 }}
                  onClick={() => setDraft((d) => ({ ...d, videoFile: null, videoPreview: null }))}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => videoRef.current?.click()}
                style={{ width: "100%", height: 100, borderRadius: 10, border: "1.5px dashed var(--separator)", background: "var(--fill)", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--text-tertiary)" }}>
                <Video size={20} />
                <span style={{ fontSize: 12.5 }}>Upload video</span>
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>MP4, WebM · max 100 MB</span>
              </button>
            )}
            <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" style={{ display: "none" }} onChange={(e) => pickFile(e, "video")} />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button type="button" className="ps-btn ps-btn--secondary" onClick={onBack} style={{ flex: 1 }}>Cancel</button>
        <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving} style={{ flex: 2 }}>
          {saving && <Loader2 size={14} className="ps-spin" />}
          {saving ? "Saving…" : "Save exercise"}
        </button>
      </div>
    </div>
  )
}

function ExercisePicker({ exercises, orgId, accessToken, onSelect, onCreated, onClose }: {
  exercises: WorkoutExercise[]
  orgId: string
  accessToken: string
  onSelect: (ex: WorkoutExercise) => void
  onCreated: (ex: WorkoutExercise) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("")
  const [group, setGroup] = useState<MuscleGroup | "all">("all")
  const [creating, setCreating] = useState(false)
  const [source, setSource] = useState<"all" | "custom">("all")

  const groups: (MuscleGroup | "all")[] = ["all","chest","back","shoulders","arms","legs","core","cardio","full_body"]
  const filtered = exercises.filter((ex) => {
    if (source === "custom" && !ex.org_id) return false
    return ex.name.toLowerCase().includes(q.toLowerCase()) && (group === "all" || ex.muscle_group === group)
  })

  const handleCreated = (ex: WorkoutExercise) => {
    onCreated(ex)
    setCreating(false)
    setSource("custom")
  }

  return (
    <div className="ps-sheet-root" data-open="true" onClick={onClose}>
      <div className="ps-sheet-backdrop" />
      <div className="ps-sheet" style={{ "--sheet-w": "500px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="ps-sheet-header" style={{ cursor: "default", touchAction: "auto" }}>
          <div className="ps-sheet-titlebar">
            <div className="ps-sheet-title">{creating ? "Create exercise" : "Add exercise"}</div>
            <button className="ps-icon-btn" onClick={onClose}><X size={18} /></button>
          </div>
          {!creating && (
            <>
              <div className="ps-input-wrap" style={{ marginTop: 14 }}>
                <span className="ps-input-icon"><Search size={16} /></span>
                <input autoFocus className="ps-input ps-input--icon" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises..." />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <div className="ps-chips" style={{ flex: 1, flexWrap: "nowrap", overflowX: "auto", paddingBottom: 2 }}>
                  {groups.map((g) => (
                    <button key={g} type="button" className="ps-chip" aria-pressed={group === g} onClick={() => setGroup(g)}>
                      {g === "all" ? "All" : MUSCLE_GROUP_LABELS[g as MuscleGroup]}
                    </button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button type="button" className={`ps-chip${source === "all" ? " ps-chip--active" : ""}`} onClick={() => setSource("all")}>All</button>
                  <button type="button" className={`ps-chip${source === "custom" ? " ps-chip--active" : ""}`} onClick={() => setSource("custom")}>Mine</button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="ps-sheet-body" style={{ padding: "8px 16px 20px" }}>
          {creating ? (
            <CreateExercisePanel
              orgId={orgId}
              accessToken={accessToken}
              onCreated={(ex) => { handleCreated(ex); onSelect(ex); }}
              onBack={() => setCreating(false)}
            />
          ) : (
            <>
              {/* "Create custom exercise" entry */}
              <button type="button" onClick={() => setCreating(true)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: "1.5px dashed var(--separator)", background: "none", cursor: "pointer", textAlign: "left", marginBottom: 8, color: "var(--accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-dim)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: "var(--accent-dim)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Plus size={16} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Create custom exercise</div>
                  <div style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginTop: 1 }}>Add name, cues, demo image or video</div>
                </div>
              </button>

              {filtered.length === 0 ? (
                <div className="ps-empty" style={{ padding: "24px 16px" }}>
                  <div className="ps-empty-title">{source === "custom" ? "No custom exercises yet" : "No exercises found"}</div>
                  {source === "custom" && <div className="ps-empty-text">Hit "Create custom exercise" above to add your first one.</div>}
                </div>
              ) : (
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}>
                  {filtered.map((ex) => {
                    const hasMedia = !!(ex.image_url || ex.video_url)
                    const isCustom = !!ex.org_id
                    return (
                      <li key={ex.id}>
                        <button type="button" onClick={() => onSelect(ex)}
                          style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, border: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--fill)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          {/* Thumbnail or placeholder */}
                          <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "var(--fill-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {ex.image_url ? (
                              <img src={ex.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            ) : ex.video_url ? (
                              <Video size={18} style={{ color: "var(--text-tertiary)" }} />
                            ) : (
                              <Image size={18} style={{ color: "var(--text-tertiary)", opacity: 0.4 }} />
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span className="ps-cell-title" style={{ fontSize: 14 }}>{ex.name}</span>
                              {isCustom && <span className="ps-badge ps-badge--blue" style={{ fontSize: 10, height: 16 }}>Mine</span>}
                              {hasMedia && !ex.image_url && <span className="ps-badge" style={{ fontSize: 10, height: 16 }}>Video</span>}
                            </div>
                            <div className="ps-cell-sub">{MUSCLE_GROUP_LABELS[ex.muscle_group as MuscleGroup] ?? ex.muscle_group} &middot; {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}</div>
                          </div>
                          <Plus size={16} style={{ color: "var(--accent)", flexShrink: 0 }} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ItemRow({ item, onUpdate, onRemove }: { item: ItemDraft; onUpdate: (u: ItemDraft) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false)
  const isCardio = item.exercise.muscle_group === "cardio"
  const isBodyweight = item.exercise.equipment === "bodyweight"
  const inputStyle: React.CSSProperties = { height: 32, padding: "0 6px", textAlign: "center", border: "1px solid var(--separator)", borderRadius: 8, fontSize: 13, fontWeight: 600, background: "var(--fill)", color: "var(--text-primary)", fontFamily: "inherit" }

  return (
    <div className="ps-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px" }}>
        <GripVertical size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0, cursor: "grab" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ps-cell-title" style={{ fontSize: 13.5 }}>{item.exercise.name}</div>
          <div className="ps-cell-sub">{MUSCLE_GROUP_LABELS[item.exercise.muscle_group]} &middot; {EQUIPMENT_LABELS[item.exercise.equipment]}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <input type="number" min={1} max={20} value={item.sets} onChange={(e) => onUpdate({ ...item, sets: parseInt(e.target.value) || 1 })} aria-label="Sets" style={{ ...inputStyle, width: 42 }} />
          <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>×</span>
          <input type="text" value={isCardio ? item.duration_sec : item.reps} onChange={(e) => isCardio ? onUpdate({ ...item, duration_sec: e.target.value }) : onUpdate({ ...item, reps: e.target.value })} placeholder={isCardio ? "sec" : "reps"} style={{ ...inputStyle, width: 54 }} />
          {!isBodyweight && !isCardio && (
            <>
              <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>@</span>
              <input type="text" value={item.weight_kg} onChange={(e) => onUpdate({ ...item, weight_kg: e.target.value })} placeholder="kg" style={{ ...inputStyle, width: 54 }} />
            </>
          )}
        </div>
        <button type="button" className="ps-icon-btn" style={{ width: 28, height: 28 }} onClick={() => setOpen((v) => !v)}>{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
        <button type="button" className="ps-icon-btn ps-icon-btn--danger" style={{ width: 28, height: 28 }} onClick={onRemove}><Trash2 size={13} /></button>
      </div>
      {open && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "12px 14px 14px", borderTop: "1px solid var(--separator)" }}>
          <div className="ps-field">
            <label className="ps-label">Rest (seconds)</label>
            <input type="number" min={0} max={600} value={item.rest_sec} onChange={(e) => onUpdate({ ...item, rest_sec: parseInt(e.target.value) || 60 })} className="ps-input" style={{ height: 38 }} />
          </div>
          <div className="ps-field">
            <label className="ps-label">Coaching note</label>
            <input type="text" value={item.notes} onChange={(e) => onUpdate({ ...item, notes: e.target.value })} placeholder="e.g. slow eccentric" className="ps-input" style={{ height: 38 }} />
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewWorkoutPlanPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [goal, setGoal] = useState<WorkoutGoal>("general_fitness")
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner")
  const [daysPerWeek, setDaysPerWeek] = useState(3)
  const [durationWeeks, setDurationWeeks] = useState(4)
  const [isTemplate, setIsTemplate] = useState(false)
  const [notes, setNotes] = useState("")
  const [days, setDays] = useState<DayDraft[]>([])
  const [activeDay, setActiveDay] = useState(0)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [orgId, setOrgId] = useState("")
  const [accessToken, setAccessToken] = useState("")
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    async function init() {
      const [{ data: { user } }, { data: { session } }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ])
      if (user) {
        const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
        if (roleData?.org_id) setOrgId(roleData.org_id)
      }
      if (session?.access_token) setAccessToken(session.access_token)
      const { data } = await supabase.from("workout_exercises").select("*").order("muscle_group").order("name")
      if (data) setExercises(data as WorkoutExercise[])
    }
    init()
  }, [])

  useEffect(() => {
    const names = DEFAULT_DAY_NAMES[daysPerWeek] ?? []
    setDays(Array.from({ length: daysPerWeek }, (_, i) => ({ day_number: i + 1, day_name: names[i] ?? `Day ${i + 1}`, focus: "", items: [] })))
    setActiveDay(0)
  }, [daysPerWeek])

  const updateDay = useCallback((i: number, patch: Partial<DayDraft>) => {
    setDays((prev) => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  }, [])

  const addExercise = useCallback((ex: WorkoutExercise) => {
    setDays((prev) => prev.map((d, i) => i === activeDay ? { ...d, items: [...d.items, { uid: uid(), exercise: ex, sets: 3, reps: "10", weight_kg: "", duration_sec: "60", rest_sec: 60, notes: "" }] } : d))
    setPickerOpen(false)
  }, [activeDay])

  const updateItem = useCallback((dayIdx: number, itemUid: string, updated: ItemDraft) => {
    setDays((prev) => prev.map((d, i) => i === dayIdx ? { ...d, items: d.items.map((it) => it.uid === itemUid ? updated : it) } : d))
  }, [])

  const removeItem = useCallback((dayIdx: number, itemUid: string) => {
    setDays((prev) => prev.map((d, i) => i === dayIdx ? { ...d, items: d.items.filter((it) => it.uid !== itemUid) } : d))
  }, [])

  async function handleSave() {
    if (!name.trim()) { setError("Plan name is required"); return }
    setSaving(true); setError("")
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) throw new Error("Could not resolve org")

      // Insert program
      const { data: prog, error: progErr } = await supabase
        .from("workout_programs")
        .insert({ org_id: roleData.org_id, created_by: user.id, name: name.trim(), goal, difficulty, days_per_week: daysPerWeek, duration_weeks: durationWeeks, is_template: isTemplate, notes: notes.trim() || null })
        .select("id").single()
      if (progErr || !prog) throw progErr ?? new Error("Insert failed")

      // Insert days + items
      for (const day of days) {
        const { data: dayRow, error: dayErr } = await supabase
          .from("workout_program_days")
          .insert({ program_id: prog.id, day_number: day.day_number, day_name: day.day_name, focus: day.focus || null })
          .select("id").single()
        if (dayErr || !dayRow) throw dayErr ?? new Error("Day insert failed")
        if (day.items.length > 0) {
          const { error: itemErr } = await supabase.from("workout_program_items").insert(
            day.items.map((it, idx) => ({
              day_id: dayRow.id,
              exercise_id: it.exercise.id,
              sort_order: idx,
              sets: it.sets,
              reps: it.reps,
              weight_kg: it.weight_kg ? parseFloat(it.weight_kg) : null,
              duration_sec: it.exercise.muscle_group === "cardio" ? parseInt(it.duration_sec) || null : null,
              rest_sec: it.rest_sec,
              notes: it.notes || null,
            }))
          )
          if (itemErr) throw itemErr
        }
      }
      router.push(`/dashboard/workouts/${prog.id}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const currentDay = days[activeDay]

  return (
    <div className="ps-page ps-page--narrow">
      <button type="button" className="ps-back" onClick={() => router.back()}><ChevronLeft size={20} />Workouts</button>
      <header className="ps-header" style={{ marginBottom: 24 }}>
        <div className="ps-header-text">
          <h1 className="ps-title">New plan</h1>
          <p className="ps-subtitle">Build a training program for your members</p>
        </div>
      </header>

      <div className="ps-stack">
        <div className="ps-card">
          <div className="ps-card-body">
            <div className="ps-card-title" style={{ marginBottom: 16 }}>Plan details</div>
            <div className="ps-form-grid">
              <div className="ps-field ps-span-2">
                <label className="ps-label" htmlFor="plan-name">Plan name</label>
                <input id="plan-name" className="ps-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Beginner Push Pull Legs" />
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-goal">Goal</label>
                <select id="plan-goal" className="ps-input" value={goal} onChange={(e) => setGoal(e.target.value as WorkoutGoal)}>
                  {(Object.entries(GOAL_LABELS) as [WorkoutGoal, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-diff">Difficulty</label>
                <select id="plan-diff" className="ps-input" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
                  {(Object.entries(DIFFICULTY_LABELS) as [Difficulty, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-dpw">Days per week</label>
                <select id="plan-dpw" className="ps-input" value={daysPerWeek} onChange={(e) => setDaysPerWeek(parseInt(e.target.value))}>
                  {[2,3,4,5,6].map((n) => <option key={n} value={n}>{n} days</option>)}
                </select>
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="plan-dur">Duration</label>
                <select id="plan-dur" className="ps-input" value={durationWeeks} onChange={(e) => setDurationWeeks(parseInt(e.target.value))}>
                  {[2,4,6,8,12,16].map((n) => <option key={n} value={n}>{n} weeks</option>)}
                </select>
              </div>
              <div className="ps-field ps-span-2">
                <label className="ps-label" htmlFor="plan-notes">Trainer notes (optional)</label>
                <textarea id="plan-notes" className="ps-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any special instructions..." rows={3} />
              </div>
              <div className="ps-field ps-span-2">
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <button type="button" className="ps-switch" role="switch" aria-checked={isTemplate} onClick={() => setIsTemplate((v) => !v)} />
                  <span style={{ fontSize: 14, color: "var(--text-primary)" }}>Save as reusable template</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {days.length > 0 && (
          <div className="ps-card" style={{ overflow: "hidden" }}>
            <div style={{ padding: "20px 24px 0" }}>
              <div className="ps-card-title" style={{ marginBottom: 14 }}>Training days</div>
              <div style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none", margin: "0 -24px", padding: "0 24px", borderBottom: "1px solid var(--separator)" }}>
                {days.map((day, i) => (
                  <button key={i} type="button" onClick={() => setActiveDay(i)}
                    style={{ padding: "8px 16px", border: "none", borderBottom: activeDay === i ? "2px solid var(--accent)" : "2px solid transparent", marginBottom: -1, background: "none", cursor: "pointer", fontSize: 13, fontWeight: activeDay === i ? 600 : 500, color: activeDay === i ? "var(--accent)" : "var(--text-secondary)", whiteSpace: "nowrap", fontFamily: "inherit" }}
                  >
                    Day {day.day_number}
                    {day.items.length > 0 && <span className={activeDay === i ? "ps-badge ps-badge--blue" : "ps-badge"} style={{ height: 18, fontSize: 11, marginLeft: 6, padding: "0 6px" }}>{day.items.length}</span>}
                  </button>
                ))}
              </div>
            </div>
            {currentDay && (
              <div style={{ padding: "18px 24px 24px" }}>
                <div className="ps-form-grid" style={{ marginBottom: 16 }}>
                  <div className="ps-field">
                    <label className="ps-label">Day name</label>
                    <input className="ps-input" value={currentDay.day_name} onChange={(e) => updateDay(activeDay, { day_name: e.target.value })} style={{ height: 38 }} />
                  </div>
                  <div className="ps-field">
                    <label className="ps-label">Muscle focus</label>
                    <input className="ps-input" value={currentDay.focus} onChange={(e) => updateDay(activeDay, { focus: e.target.value })} placeholder="e.g. Chest & Triceps" style={{ height: 38 }} />
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {currentDay.items.length === 0 && <p style={{ fontSize: 13.5, color: "var(--text-tertiary)", textAlign: "center", padding: "20px 0", margin: 0 }}>No exercises yet</p>}
                  {currentDay.items.map((item) => (
                    <ItemRow key={item.uid} item={item} onUpdate={(u) => updateItem(activeDay, item.uid, u)} onRemove={() => removeItem(activeDay, item.uid)} />
                  ))}
                </div>
                <button type="button" className="ps-btn ps-btn--secondary" onClick={() => setPickerOpen(true)}><Plus size={16} /> Add exercise</button>
              </div>
            )}
          </div>
        )}

        {error && <div className="ps-error">{error}</div>}

        <div className="ps-actionbar">
          <button type="button" className="ps-btn ps-btn--secondary" onClick={() => router.back()}>Cancel</button>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={15} className="ps-spin" />}
            {saving ? "Saving..." : "Save plan"}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <ExercisePicker
          exercises={exercises}
          orgId={orgId}
          accessToken={accessToken}
          onSelect={(ex) => { addExercise(ex); setPickerOpen(false) }}
          onCreated={(ex) => setExercises((prev) => [...prev, ex])}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}

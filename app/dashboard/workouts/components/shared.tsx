"use client"
// app/dashboard/workouts/components/shared.tsx
// Small helpers shared by the plan builder, the exercise picker and the exercise library.

import { useState } from "react"
import { Dumbbell } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { exerciseImageUrl } from "@/lib/workout/exerciseImages"
import type { WorkoutExercise } from "@/lib/workout/types"

export const supabase = createClient()

export function uid() { return Math.random().toString(36).slice(2) }

/** Org id + access token for the signed-in user. Token is needed for R2 uploads. */
export async function loadOrgContext(): Promise<{ orgId: string; accessToken: string; userId: string } | null> {
  const [{ data: { user } }, { data: { session } }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ])
  if (!user) return null
  const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
  if (!roleData?.org_id) return null
  return { orgId: roleData.org_id, accessToken: session?.access_token ?? "", userId: user.id }
}

/** Uploads a file to R2 through /api/upload-url and returns its public URL. */
export async function uploadToR2(file: File, accessToken: string): Promise<string> {
  const res = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ contentType: file.type, size: file.size, folder: "exercises" }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? "Couldn't get upload URL")
  }
  const { uploadUrl, publicUrl } = await res.json()
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file })
  if (!put.ok) throw new Error("Upload to storage failed. Check your R2 bucket CORS settings.")
  return publicUrl
}

/** Best image for an exercise: the gym's upload first, then the built-in library frame. */
export function exerciseImage(ex: Pick<WorkoutExercise, "name" | "image_url">): string | null {
  return ex.image_url || exerciseImageUrl(ex.name, 0) || null
}

/** Square thumbnail that falls back to an icon when there's no image or it fails to load. */
export function ExerciseThumb({ ex, className = "db-exrow-thumb" }: {
  ex: Pick<WorkoutExercise, "name" | "image_url">; className?: string
}) {
  const [failed, setFailed] = useState(false)
  const src = exerciseImage(ex)
  return (
    <span className={className}>
      {src && !failed
        ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <Dumbbell size={18} />}
    </span>
  )
}

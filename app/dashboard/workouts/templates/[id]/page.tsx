"use client"
// app/dashboard/workouts/templates/[id]/page.tsx
// Built-in templates now open in the shared plan view (/dashboard/workouts/[id]),
// which has the same "Use this template" action plus the week overview and muscle split.
// This route stays so old links keep working.

import { useEffect } from "react"
import { useParams, useRouter } from "next/navigation"

export default function TemplateRedirect() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  useEffect(() => { router.replace(`/dashboard/workouts/${id}`) }, [id, router])
  return null
}

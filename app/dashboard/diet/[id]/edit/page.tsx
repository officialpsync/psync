"use client"
// app/dashboard/diet/[id]/edit/page.tsx

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, ChevronLeft, Salad } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BackLink, Segmented, Skeleton } from "../../../components/ui"
import { DesignStyles } from "../../../components/DesignSystem"

type PlanRow = {
  id: string; member_id: string; status: string; plan_mode: string; plan_days: number
  start_date: string; target_kcal: number; target_protein_g: number
  target_carbs_g: number; target_fat_g: number; coach_notes: string | null
  version_number: number
  members: { full_name: string } | null
}

const MODE_LABELS: Record<string, string> = {
  recipe: "Standard", protein_heavy: "Protein heavy", ingredient: "Simple foods",
}

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
]

export default function EditDietPlanPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [plan, setPlan] = useState<PlanRow | null>(null)

  // Editable fields
  const [coachNotes, setCoachNotes] = useState("")
  const [startDate, setStartDate] = useState("")
  const [status, setStatus] = useState("active")
  const [targetKcal, setTargetKcal] = useState("")
  const [targetProtein, setTargetProtein] = useState("")
  const [targetCarbs, setTargetCarbs] = useState("")
  const [targetFat, setTargetFat] = useState("")

  const [error, setError] = useState("")

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("member_diet_plans")
        .select("*, members(full_name)")
        .eq("id", id)
        .single()
      if (err || !data) { setNotFound(true); setLoading(false); return }
      const p = data as PlanRow
      setPlan(p)
      setCoachNotes(p.coach_notes ?? "")
      setStartDate(p.start_date ?? "")
      setStatus(p.status ?? "active")
      setTargetKcal(String(p.target_kcal ?? ""))
      setTargetProtein(String(p.target_protein_g ?? ""))
      setTargetCarbs(String(p.target_carbs_g ?? ""))
      setTargetFat(String(p.target_fat_g ?? ""))
      setLoading(false)
    }
    load()
  }, [id])

  async function handleSave() {
    if (!plan) return
    setSaving(true); setError("")
    const { error: updateErr } = await supabase
      .from("member_diet_plans")
      .update({
        coach_notes: coachNotes.trim() || null,
        start_date: startDate || null,
        status,
        target_kcal: parseInt(targetKcal) || plan.target_kcal,
        target_protein_g: parseFloat(targetProtein) || plan.target_protein_g,
        target_carbs_g: parseFloat(targetCarbs) || plan.target_carbs_g,
        target_fat_g: parseFloat(targetFat) || plan.target_fat_g,
      })
      .eq("id", id)
    if (updateErr) { setError(updateErr.message); setSaving(false); return }
    router.push(`/dashboard/diet/${id}`)
  }

  if (loading) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Skeleton w={90} h={16} />
        <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton w="100%" h={200} r={16} />
          <Skeleton w="100%" h={160} r={16} />
        </div>
      </div>
    )
  }

  if (notFound || !plan) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <BackLink href="/dashboard/diet" label="Diet plans" />
        <div className="ps-card ps-empty">
          <div className="ps-empty-title">Plan not found</div>
        </div>
      </div>
    )
  }

  const memberName = plan.members?.full_name ?? "Member"
  const planLabel = `${MODE_LABELS[plan.plan_mode] ?? plan.plan_mode}, v${plan.version_number}`

  return (
    <div className="ps-page ps-page--narrow db">
      <DesignStyles />
      <button type="button" className="ps-back" onClick={() => router.push(`/dashboard/diet/${id}`)}>
        <ChevronLeft size={20} />Back to plan
      </button>

      <header className="db-header" style={{ marginBottom: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">{memberName}</div>
          <h1 className="db-title">Edit plan</h1>
          <p className="db-subtitle">{planLabel} · {plan.plan_days} days</p>
        </div>
        <span className="db-chip db-chip--lg db-tone-green" style={{ width: 44, height: 44, borderRadius: 14 }}>
          <Salad size={20} />
        </span>
      </header>

      {error && <div className="ps-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="ps-stack">
        {/* Targets */}
        <section className="db-card db-pad">
          <div className="db-card-title" style={{ marginBottom: 16 }}>Nutrition targets</div>
          <p className="ps-card-sub" style={{ marginBottom: 16, fontSize: 13, color: "var(--text-secondary)" }}>
            Adjusting targets changes what the plan aims for but does not regenerate meals.
            To rebuild meals, generate a new version from the member profile.
          </p>
          <div className="ps-form-grid">
            <div className="ps-field">
              <label className="ps-label" htmlFor="target-kcal">Daily calories (kcal)</label>
              <input
                id="target-kcal"
                className="ps-input ps-num"
                type="text"
                inputMode="numeric"
                value={targetKcal}
                onChange={(e) => setTargetKcal(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="ps-field">
              <label className="ps-label" htmlFor="target-protein">Protein (g)</label>
              <input
                id="target-protein"
                className="ps-input ps-num"
                type="text"
                inputMode="decimal"
                value={targetProtein}
                onChange={(e) => setTargetProtein(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <div className="ps-field">
              <label className="ps-label" htmlFor="target-carbs">Carbs (g)</label>
              <input
                id="target-carbs"
                className="ps-input ps-num"
                type="text"
                inputMode="decimal"
                value={targetCarbs}
                onChange={(e) => setTargetCarbs(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
            <div className="ps-field">
              <label className="ps-label" htmlFor="target-fat">Fat (g)</label>
              <input
                id="target-fat"
                className="ps-input ps-num"
                type="text"
                inputMode="decimal"
                value={targetFat}
                onChange={(e) => setTargetFat(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
          </div>
        </section>

        {/* Plan settings */}
        <section className="db-card db-pad">
          <div className="db-card-title" style={{ marginBottom: 16 }}>Plan settings</div>
          <div className="ps-form-grid">
            <div className="ps-field">
              <label className="ps-label" htmlFor="start-date">Start date</label>
              <input
                id="start-date"
                className="ps-input"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ height: 42, colorScheme: "light" }}
              />
            </div>
            <div className="ps-field">
              <span className="ps-label">Plan status</span>
              <Segmented<string>
                block
                label="Plan status"
                value={status}
                onChange={setStatus}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
        </section>

        {/* Coach notes */}
        <section className="db-card db-pad">
          <div className="db-card-title" style={{ marginBottom: 6 }}>Trainer notes</div>
          <p className="ps-card-sub" style={{ marginBottom: 14, fontSize: 13, color: "var(--text-secondary)" }}>
            Shown at the bottom of the plan. Use for specific instructions, restrictions, or context for this member.
          </p>
          <label className="ps-field">
            <span className="ps-label">Notes</span>
            <textarea
              className="ps-input"
              value={coachNotes}
              onChange={(e) => setCoachNotes(e.target.value)}
              rows={5}
              placeholder={`e.g. Avoid raw vegetables for first 2 weeks. Increase protein after Week 3. ${memberName} prefers no spicy food for breakfast.`}
            />
          </label>
        </section>
      </div>

      <div className="ps-actionbar">
        <button
          type="button"
          className="ps-btn ps-btn--secondary"
          onClick={() => router.push(`/dashboard/diet/${id}`)}
        >
          Cancel
        </button>
        <button
          type="button"
          className="ps-btn ps-btn--primary"
          onClick={handleSave}
          disabled={saving}
          style={{ minWidth: 140 }}
        >
          {saving && <Loader2 size={15} className="ps-spin" />}
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  )
}

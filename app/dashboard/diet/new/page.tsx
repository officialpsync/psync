"use client"
// app/dashboard/diet/new/page.tsx

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChefHat, Dumbbell, Salad, Search, Check, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Avatar, BackLink, Segmented } from "../../components/ui"
import { DesignStyles } from "../../components/DesignSystem"
import { DietStyles } from "../components/DietTheme"

type PlanMode = "protein_heavy" | "ingredient" | "manual"

interface Member {
  id: string
  org_id: string
  full_name: string
  weight_kg: number | null
  height_cm: number | null
  sex: string | null
  primary_goal: string | null
  diet_type: string | null
  job_activity: string | null
  exercise_days_per_week: number | null
  medical_conditions: string[] | null
}

const PLAN_MODES: { id: PlanMode; label: string; desc: string; icon: React.ElementType }[] = [
  { id: "protein_heavy", label: "Protein heavy", desc: "2.4 g protein per kg, from high-protein recipes.", icon: Dumbbell },
  { id: "ingredient", label: "Simple foods", desc: "Home-style meals from basic ingredients. Best for Jain diets.", icon: Salad },
  { id: "manual", label: "Manual", desc: "Build the plan yourself by picking meals from your food library.", icon: ChefHat },
]

const MODE_TONE: Record<PlanMode, string> = { protein_heavy: "purple", ingredient: "green", manual: "blue" }

const DURATIONS = ["1", "3", "5", "7", "10", "14"] as const
type Duration = (typeof DURATIONS)[number]

const GOAL_LABELS: Record<string, string> = { fat_loss: "Fat loss", muscle_gain: "Muscle gain", weight_gain: "Weight gain", maintenance: "Maintenance", healthy_eating: "Healthy eating" }
const DIET_LABELS: Record<string, string> = { non_vegetarian: "Non-veg", eggetarian: "Eggetarian", vegetarian: "Veg", vegan: "Vegan", jain: "Jain" }

function memberSummary(m: Member) {
  return [
    m.weight_kg ? `${m.weight_kg} kg` : null,
    m.diet_type ? DIET_LABELS[m.diet_type] : null,
    m.primary_goal ? GOAL_LABELS[m.primary_goal] : null,
  ].filter(Boolean).join(", ")
}

/* ── Member picker ────────────────────────────────────────────────────────── */
function MemberPicker({ members, selected, onSelect, loading }: {
  members: Member[]
  selected: Member | null
  onSelect: (m: Member | null) => void
  loading: boolean
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [])

  const q = query.trim().toLowerCase()
  const matches = members.filter((m) => !q || m.full_name.toLowerCase().includes(q)).slice(0, 8)

  if (selected) {
    const conditions = selected.medical_conditions ?? []
    return (
      <div className="db-picked-member">
        <Avatar name={selected.full_name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="db-row-title" style={{ fontSize: 16 }}>{selected.full_name}</div>
          <div className="db-row-sub" style={{ fontSize: 13 }}>{memberSummary(selected) || "No health details yet"}</div>
          {conditions.length > 0 && (
            <div className="ps-tags ps-tags--start" style={{ marginTop: 8 }}>
              {conditions.slice(0, 4).map((c) => <span key={c} className="db-pill db-pill--amber">{c}</span>)}
              {conditions.length > 4 && <span className="db-pill db-pill--muted">+{conditions.length - 4} more</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          className="ps-btn ps-btn--secondary ps-btn--sm"
          onClick={() => { onSelect(null); requestAnimationFrame(() => inputRef.current?.focus()) }}
        >
          Change
        </button>
      </div>
    )
  }

  return (
    <div ref={ref} className="ps-combo">
      <div className="ps-input-wrap">
        <span className="ps-input-icon"><Search size={16} /></span>
        <input
          ref={inputRef}
          className="ps-input ps-input--icon"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false)
            if (e.key === "Enter" && matches[0]) { onSelect(matches[0]); setQuery(""); setOpen(false) }
          }}
          placeholder={loading ? "Loading members…" : "Search members by name"}
          disabled={loading}
          role="combobox"
          aria-expanded={open}
          aria-controls="member-options"
          aria-autocomplete="list"
          enterKeyHint="search"
        />
      </div>

      {open && !loading && (
        <div className="ps-combo-menu" id="member-options" role="listbox">
          {matches.length === 0 ? (
            <div className="ps-cell" style={{ padding: 16, color: "var(--text-tertiary)" }}>
              {members.length === 0 ? "No active members yet." : `No members match "${query.trim()}".`}
            </div>
          ) : (
            matches.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={false}
                className="db-row db-row--link"
                style={{ width: "100%", textAlign: "left", border: "none", font: "inherit", cursor: "pointer", background: "none", padding: "8px 10px" }}
                onClick={() => { onSelect(m); setQuery(""); setOpen(false) }}
              >
                <Avatar name={m.full_name} size={32} />
                <div className="db-row-text">
                  <div className="db-row-title">{m.full_name}</div>
                  <div className="db-row-sub">{memberSummary(m) || "No health details yet"}</div>
                </div>
                {m.medical_conditions && m.medical_conditions.length > 0 && (
                  <span className="db-pill db-pill--amber" style={{ flexShrink: 0 }}>
                    {m.medical_conditions.length} condition{m.medical_conditions.length > 1 ? "s" : ""}
                  </span>
                )}
              </button>
            ))
          )}
          {members.length > 8 && matches.length === 8 && (
            <div className="ps-combo-foot">Showing 8 of {members.length}. Keep typing to narrow it down.</div>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function GeneratePlanPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [members, setMembers] = useState<Member[]>([])
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [orgId, setOrgId] = useState("")
  const [planMode, setPlanMode] = useState<PlanMode>("protein_heavy")
  const [planDays, setPlanDays] = useState<Duration>("7")
  const [startDate, setStartDate] = useState("")
  const [overrideKcal, setOverrideKcal] = useState("")
  const [coachNotes, setCoachNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [membersLoading, setMembersLoading] = useState(true)

  useEffect(() => {
    setStartDate(new Date().toISOString().split("T")[0])
    async function loadMembers() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      if (!roleData) return
      setOrgId(roleData.org_id)

      const { data } = await supabase
        .from("members")
        .select("id, org_id, full_name, weight_kg, height_cm, sex, primary_goal, diet_type, job_activity, exercise_days_per_week, medical_conditions")
        .eq("org_id", roleData.org_id)
        .eq("status", "active")
        .order("full_name")

      const all = (data as Member[]) || []
      setMembers(all)
      setMembersLoading(false)

      const memberId = searchParams.get("member_id")
      if (memberId) {
        const found = all.find((m) => m.id === memberId)
        if (found) setSelectedMember(found)
      }
    }
    loadMembers()
  }, [searchParams])

  const kcalNum = overrideKcal ? parseInt(overrideKcal) : undefined
  const kcalInvalid = kcalNum !== undefined && (isNaN(kcalNum) || kcalNum < 800 || kcalNum > 5000)
  const isManual = planMode === "manual"

  async function handleSubmit() {
    if (!selectedMember) { setError("Choose a member to build the plan for."); return }
    if (!orgId) { setError("Your session has expired. Refresh the page and try again."); return }

    // Manual mode — create a blank plan record then open the builder
    if (isManual) {
      setLoading(true)
      setError("")
      try {
        const { data, error: insertErr } = await supabase
          .from("member_diet_plans")
          .insert({
            member_id: selectedMember.id,
            org_id: orgId,
            plan_mode: "manual",
            start_date: startDate,
            plan_days: parseInt(planDays),
            coach_notes: coachNotes || null,
            status: "draft",
            version_number: 1,
            target_kcal: 0,
            target_protein_g: 0,
            target_carbs_g: 0,
            target_fat_g: 0,
          })
          .select("id")
          .single()

        if (insertErr || !data) { setError("Couldn't create the plan. Try again."); return }
        router.push(`/dashboard/diet/${data.id}/build`)
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.")
      } finally {
        setLoading(false)
      }
      return
    }

    // AI-generated modes
    if (kcalInvalid) { setError("Calorie target must be between 800 and 5,000 kcal."); return }
    setError("")
    setLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          member_id: selectedMember.id,
          org_id: orgId,
          plan_mode: planMode,
          plan_days: parseInt(planDays),
          start_date: startDate,
          override_kcal: kcalNum,
          coach_notes: coachNotes || undefined,
        }),
      })

      const json = await res.json()
      if (!res.ok) { setError(json.error ?? "The plan couldn't be generated. Try again."); return }
      if (!json.plan_id) { setError("The plan was saved but no ID came back. Find it in Diet plans."); return }
      router.push(`/dashboard/diet/${json.plan_id}`)
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ps-page db dt">
      <DesignStyles /><DietStyles />
      <BackLink onClick={() => router.back()} label="Back" />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Diet plans</div>
          <h1 className="db-title">New diet plan</h1>
          <p className="db-subtitle">
            {isManual
              ? "Pick meals from your food library to build a custom plan."
              : "Built from the member's health profile and clinical conditions."}
          </p>
        </div>
      </header>

      <div className="ps-stack">
        <section className="db-card db-pad">
          <h2 className="db-card-title" style={{ marginBottom: 14 }}>Member</h2>
          <MemberPicker members={members} selected={selectedMember} onSelect={setSelectedMember} loading={membersLoading} />
        </section>

        <section className="db-card db-pad">
          <h2 className="db-card-title" style={{ marginBottom: 4 }}>Plan type</h2>
          <div className="db-card-sub" style={{ marginBottom: 14 }}>Choose how this plan should be built.</div>
          <div className="db-mode-grid" role="radiogroup" aria-label="Plan type">
            {PLAN_MODES.map((m) => {
              const active = planMode === m.id
              const tone = MODE_TONE[m.id]
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`db-mode-option db-tone-${tone}`}
                  data-active={active}
                  onClick={() => setPlanMode(m.id)}
                >
                  <span className="db-chip db-chip--lg"><m.icon size={18} strokeWidth={2.2} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="db-mode-title">{m.label}</div>
                    <div className="db-mode-desc">{m.desc}</div>
                  </div>
                  <span className="db-mode-check" aria-hidden>{active && <Check size={12} strokeWidth={3} />}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="db-card db-pad">
          <div className="ps-form-grid">
            <div className="ps-field ps-span-2">
              <span className="ps-label">Length in days</span>
              <Segmented<Duration>
                block
                label="Plan length in days"
                value={planDays}
                onChange={setPlanDays}
                options={DURATIONS.map((d) => ({ value: d, label: d }))}
              />
            </div>
            <label className="ps-field">
              <span className="ps-label">Starts on</span>
              <input className="ps-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>

            {/* Calorie override only relevant for AI modes */}
            {!isManual && (
              <label className="ps-field">
                <span className="ps-label">Daily calories <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></span>
                <input
                  className="ps-input ps-num"
                  type="text"
                  inputMode="numeric"
                  placeholder="Calculated automatically"
                  value={overrideKcal}
                  onChange={(e) => setOverrideKcal(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  aria-invalid={kcalInvalid}
                  style={kcalInvalid ? { borderColor: "var(--red)" } : undefined}
                />
                <span className="ps-hint" style={kcalInvalid ? { color: "var(--red)" } : undefined}>
                  Between 800 and 5,000 kcal. Leave blank to use the calculated target.
                </span>
              </label>
            )}

            <label className={`ps-field ${isManual ? "ps-span-2" : ""}`} style={isManual ? {} : undefined}>
              <span className="ps-label">Notes for the member <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></span>
              <textarea
                className="ps-input"
                rows={3}
                placeholder="Drink 3 litres of water a day, eat dinner before 8 pm…"
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
              />
            </label>
          </div>
        </section>

        {error && <div className="ps-error" role="alert">{error}</div>}
      </div>

      <div className="db-actionbar-spacer" />

      <div className="ps-actionbar">
        <button type="button" className="ps-btn ps-btn--secondary ps-hide-sm" onClick={() => router.back()}>Cancel</button>
        <button
          type="button"
          className="ps-btn ps-btn--primary"
          onClick={handleSubmit}
          disabled={loading || !selectedMember}
          style={{ minWidth: 180 }}
        >
          {loading
            ? <><Loader2 size={16} className="ps-spin" /> {isManual ? "Creating…" : "Generating…"}</>
            : isManual ? "Create plan" : "Generate plan"}
        </button>
      </div>
    </div>
  )
}

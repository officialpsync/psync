"use client"
// app/dashboard/diet/[id]/build/page.tsx
// Manual diet plan builder — gym owner assembles meals from recipe library day by day

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Beef, Check, ChevronDown, ChevronUp, Droplet, Flame, Loader2, Plus, Search, Trash2, Wheat, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BackLink, formatDate, Skeleton, useToast } from "../../../components/ui"
import { Sheet } from "../../../components/Sheet"
import { DesignStyles } from "../../../components/DesignSystem"

// ── Types ──────────────────────────────────────────────────────────────────

interface Recipe {
  recipe_id: string
  recipe_name: string
  meal_type: string[]
  calories_kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  serving_size_description: string | null
  ingredients: { name?: string; ingredient_name?: string; quantity_grams: number; is_optional?: boolean }[] | null
  cuisine: string | null
  prep_time_minutes: number | null
  is_high_protein: boolean
  is_low_gi: boolean
  is_diabetic_friendly: boolean
  is_gerd_safe: boolean
  is_gym: boolean   // true if this recipe belongs to the gym's own library (not global)
}

interface MealSlot {
  id: string           // uuid generated client side
  meal_type: string
  recipe_id: string
  recipe_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  serving_size_description: string | null
  notes: string
}

interface DayPlan {
  slots: MealSlot[]
}

interface PlanMeta {
  id: string
  member_id: string
  start_date: string
  plan_days: number
  coach_notes: string | null
  status: string
  members: { full_name: string } | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const MEAL_TYPES = ["early_morning", "breakfast", "lunch", "snack", "dinner", "post_workout"]
const MEAL_LABELS: Record<string, string> = {
  early_morning: "Early morning",
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  post_workout: "Post workout",
}
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function uuid() {
  return crypto.randomUUID()
}

const r1 = (n: number) => Math.round((n || 0) * 10) / 10
const macroLine = (p: number, c: number, f: number) => `P ${r1(p)}g   C ${r1(c)}g   F ${r1(f)}g`

// ── Recipe picker sheet ────────────────────────────────────────────────────

function RecipePickerSheet({
  open,
  onClose,
  recipes,
  activeMealType,
  onPick,
}: {
  open: boolean
  onClose: () => void
  recipes: Recipe[]
  activeMealType: string | null
  onPick: (r: Recipe) => void
}) {
  const [query, setQuery] = useState("")
  const [filterMeal, setFilterMeal] = useState<string | null>(null)
  const [libraryFilter, setLibraryFilter] = useState<"all" | "mine">("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // When the sheet opens, pre-filter to the meal type being added
  useEffect(() => {
    if (open) {
      setFilterMeal(activeMealType)
      setQuery("")
      setExpandedId(null)
      setLibraryFilter("all")
    }
  }, [open, activeMealType])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recipes.filter((r) => {
      const matchesQuery = !q || r.recipe_name.toLowerCase().includes(q)
      const matchesMeal = !filterMeal || (Array.isArray(r.meal_type) && r.meal_type.includes(filterMeal))
      const matchesLibrary = libraryFilter === "all" || r.is_gym
      return matchesQuery && matchesMeal && matchesLibrary
    })
  }, [recipes, query, filterMeal, libraryFilter])

  const gymCount = recipes.filter((r) => r.is_gym).length

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pick a recipe"
      description={activeMealType ? `Adding to ${MEAL_LABELS[activeMealType] ?? activeMealType}` : undefined}
    >
      <label className="db-search" style={{ display: "block", marginBottom: 12 }}>
        <Search size={16} />
        <input
          placeholder="Search recipes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="db-presets" style={{ marginBottom: 12 }}>
        <button
          type="button"
          className="db-preset"
          aria-pressed={libraryFilter === "all"}
          onClick={() => setLibraryFilter("all")}
        >
          All recipes
        </button>
        <button
          type="button"
          className="db-preset"
          aria-pressed={libraryFilter === "mine"}
          onClick={() => setLibraryFilter("mine")}
        >
          My library{gymCount > 0 ? ` (${gymCount})` : ""}
        </button>
      </div>

      <div className="db-presets" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="db-preset"
          aria-pressed={!filterMeal}
          onClick={() => setFilterMeal(null)}
        >
          All meals
        </button>
        {MEAL_TYPES.map((mt) => (
          <button
            key={mt}
            type="button"
            className="db-preset"
            aria-pressed={filterMeal === mt}
            onClick={() => setFilterMeal(filterMeal === mt ? null : mt)}
          >
            {MEAL_LABELS[mt]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="db-empty">
          <span className="db-empty-icon"><Search size={18} /></span>
          <div className="db-empty-title">No recipes match</div>
          <div className="db-empty-text">
            {libraryFilter === "mine" && gymCount === 0
              ? "You haven't added any recipes to your gym's library yet. Add one from the Recipe library page."
              : recipes.length === 0
              ? "Add recipes to your library first from the Recipe library page."
              : "Try a different name or meal type filter."}
          </div>
        </div>
      ) : (
        <div className="db-rows">
          {filtered.map((r) => {
            const isExpanded = expandedId === r.recipe_id
            return (
              <div key={r.recipe_id}>
                <div className="db-row" style={{ alignItems: "flex-start" }}>
                  <div className="db-row-text">
                    <div className="db-row-title" style={{ whiteSpace: "normal" }}>{r.recipe_name}</div>
                    <div className="db-row-sub" style={{ whiteSpace: "normal" }}>
                      {r.calories_kcal ? `${Math.round(r.calories_kcal)} kcal` : "—"}
                      {r.protein_g ? `  ·  P ${r1(r.protein_g)} g` : ""}
                      {r.serving_size_description ? `  ·  ${r.serving_size_description}` : ""}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {r.is_gym && <span className="db-pill db-pill--green">My recipe</span>}
                      {(r.meal_type ?? []).map((mt) => (
                        <span key={mt} className="db-pill db-pill--muted">{MEAL_LABELS[mt] ?? mt}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="db-icon-btn"
                      onClick={() => setExpandedId(isExpanded ? null : r.recipe_id)}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button
                      type="button"
                      className="ps-btn ps-btn--primary ps-btn--sm"
                      onClick={() => onPick(r)}
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>

                {isExpanded && r.ingredients && r.ingredients.length > 0 && (
                  <div style={{ padding: "0 8px 14px" }}>
                    <div className="db-meal-swap-label">Ingredients</div>
                    {r.ingredients.map((ing, i) => (
                      <div key={i} className="db-meal-item">
                        <span className="db-row-title" style={{ fontWeight: 500 }}>{ing.ingredient_name || ing.name || "Ingredient"}</span>
                        <span className="db-meal-macro">{ing.quantity_grams} g</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Sheet>
  )
}

// ── Meal row (inside a meal-type section) ───────────────────────────────────

function MealSlotRow({
  slot,
  onRemove,
  onNotesChange,
}: {
  slot: MealSlot
  onRemove: () => void
  onNotesChange: (notes: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div>
      <div className="db-row">
        <div className="db-row-text">
          <div className="db-row-title">{slot.recipe_name}</div>
          <div className="db-row-sub" style={{ whiteSpace: "pre" }}>
            {Math.round(slot.calories)} kcal   {macroLine(slot.protein_g, slot.carbs_g, slot.fat_g)}
          </div>
          {slot.serving_size_description && <div className="db-row-sub">{slot.serving_size_description}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            className="db-icon-btn"
            onClick={() => setExpanded((e) => !e)}
            aria-label="Add note"
          >
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button
            type="button"
            className="db-icon-btn"
            style={{ color: "var(--red)" }}
            onClick={onRemove}
            aria-label="Remove meal"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "0 8px 14px" }}>
          <label className="ps-field" style={{ gap: 6 }}>
            <span className="ps-label" style={{ fontSize: 12 }}>Note for member (optional)</span>
            <input
              className="ps-input"
              style={{ fontSize: 13 }}
              placeholder="e.g. Use skimmed milk, avoid sugar"
              value={slot.notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  )
}

// ── Day totals strip ─────────────────────────────────────────────────────────

function DayTotalsBar({ slots }: { slots: MealSlot[] }) {
  const totals = slots.reduce(
    (t, s) => ({
      calories: t.calories + s.calories,
      protein_g: t.protein_g + s.protein_g,
      carbs_g: t.carbs_g + s.carbs_g,
      fat_g: t.fat_g + s.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  if (slots.length === 0) return null

  const stats = [
    { label: "Calories", value: Math.round(totals.calories), unit: "kcal", tone: "amber", icon: <Flame size={15} /> },
    { label: "Protein", value: r1(totals.protein_g), unit: "g", tone: "blue", icon: <Beef size={15} /> },
    { label: "Carbs", value: r1(totals.carbs_g), unit: "g", tone: "green", icon: <Wheat size={15} /> },
    { label: "Fat", value: r1(totals.fat_g), unit: "g", tone: "purple", icon: <Droplet size={15} /> },
  ]

  return (
    <div className="db-card db-statbar">
      {stats.map((s) => (
        <div key={s.label} className={`db-stat db-tone-${s.tone}`}>
          <span className="db-chip">{s.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div className="db-stat-label">{s.label}</div>
            <div className="db-stat-value">{s.value}<span className="db-stat-note">{s.unit}</span></div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ManualPlanBuilderPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const { toast, show } = useToast()

  const [meta, setMeta] = useState<PlanMeta | null>(null)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [days, setDays] = useState<DayPlan[]>([])
  const [dayIdx, setDayIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Sheet state
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMealType, setPickerMealType] = useState<string | null>(null)

  // ── Load plan meta + recipes ─────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: planData } = await supabase
        .from("member_diet_plans")
        .select("id, member_id, start_date, plan_days, coach_notes, status, plan_json, members(full_name), org_id")
        .eq("id", id)
        .single()

      if (!planData) { setLoading(false); return }
      setMeta(planData as unknown as PlanMeta)

      // Fetch both global recipes (org_id null) and gym recipes
      const orgId = (planData as unknown as { org_id?: string }).org_id
        || (planData.members as unknown as { org_id?: string } | null)?.org_id

      const globalQuery = supabase
        .from("recipes")
        .select("recipe_id, recipe_name, meal_type, calories_kcal, protein_g, carbs_g, fat_g, fiber_g, serving_size_description, ingredients, cuisine, prep_time_minutes, is_high_protein, is_low_gi, is_diabetic_friendly, is_gerd_safe, is_simple")
        .is("org_id", null)
        .eq("is_active", true)
        .order("recipe_name")

      const gymQuery = orgId
        ? supabase
            .from("recipes")
            .select("recipe_id, recipe_name, meal_type, calories_kcal, protein_g, carbs_g, fat_g, fiber_g, serving_size_description, ingredients, cuisine, prep_time_minutes, is_high_protein, is_low_gi, is_diabetic_friendly, is_gerd_safe, is_simple")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .order("recipe_name")
        : null

      const [globalRes, gymRes] = await Promise.all([globalQuery, gymQuery ?? Promise.resolve({ data: [] as Recipe[] })])
      const globalRecipes = ((globalRes.data as Recipe[]) ?? []).map((r) => ({ ...r, is_gym: false }))
      const gymRecipes = ((gymRes.data as Recipe[]) ?? []).map((r) => ({ ...r, is_gym: true }))

      // Deduplicate by recipe_id — gym recipe wins if same id exists in both
      const seen = new Map<string, Recipe>()
      for (const r of globalRecipes) seen.set(r.recipe_id, r)
      for (const r of gymRecipes) seen.set(r.recipe_id, r)
      setRecipes([...seen.values()].sort((a, b) => a.recipe_name.localeCompare(b.recipe_name)))

      // Restore existing plan_json if plan was partially saved
      const existing = (planData as unknown as { plan_json?: { manual_days?: DayPlan[] } }).plan_json
      const duration = planData.plan_days ?? 7
      if (existing?.manual_days && existing.manual_days.length === duration) {
        setDays(existing.manual_days)
      } else {
        setDays(Array.from({ length: duration }, () => ({ slots: [] })))
      }

      setLoading(false)
    }
    load()
  }, [id])

  // ── Day navigation helpers ────────────────────────────────────────────────

  function dayInfo(i: number) {
    if (!meta) return { short: `Day ${i + 1}`, num: i + 1, long: `Day ${i + 1}` }
    const d = new Date(meta.start_date + "T00:00:00")
    d.setDate(d.getDate() + i)
    return {
      short: DAY_NAMES[d.getDay()],
      num: d.getDate(),
      long: d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
    }
  }

  // ── Slot mutation helpers ─────────────────────────────────────────────────

  function addSlot(recipe: Recipe, mealType: string) {
    const slot: MealSlot = {
      id: uuid(),
      meal_type: mealType,
      recipe_id: recipe.recipe_id,
      recipe_name: recipe.recipe_name,
      calories: recipe.calories_kcal ?? 0,
      protein_g: recipe.protein_g ?? 0,
      carbs_g: recipe.carbs_g ?? 0,
      fat_g: recipe.fat_g ?? 0,
      serving_size_description: recipe.serving_size_description,
      notes: "",
    }
    setDays((prev) => prev.map((day, i) =>
      i === dayIdx ? { ...day, slots: [...day.slots, slot] } : day
    ))
  }

  function removeSlot(slotId: string) {
    setDays((prev) => prev.map((day, i) =>
      i === dayIdx ? { ...day, slots: day.slots.filter((s) => s.id !== slotId) } : day
    ))
  }

  function updateSlotNotes(slotId: string, notes: string) {
    setDays((prev) => prev.map((day, i) =>
      i === dayIdx
        ? { ...day, slots: day.slots.map((s) => s.id === slotId ? { ...s, notes } : s) }
        : day
    ))
  }

  // ── Copy previous day ─────────────────────────────────────────────────────

  function copyPrevDay() {
    if (dayIdx === 0) return
    const prev = days[dayIdx - 1]
    if (!prev || prev.slots.length === 0) return
    const copied = prev.slots.map((s) => ({ ...s, id: uuid() }))
    setDays((d) => d.map((day, i) => i === dayIdx ? { ...day, slots: copied } : day))
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = useCallback(async (publish: boolean) => {
    if (!meta) return
    setSaving(true)
    try {
      const planJson = { manual_days: days, engine_version: "manual" }
      const { error } = await supabase
        .from("member_diet_plans")
        .update({
          plan_json: planJson,
          status: publish ? "active" : "draft",
        })
        .eq("id", id)

      if (error) { show("Could not save the plan. Try again.", "error"); return }
      if (publish) {
        show("Plan published", "success")
        router.push(`/dashboard/diet/${id}`)
      } else {
        show("Draft saved", "success")
      }
    } finally {
      setSaving(false)
    }
  }, [meta, days, id, router, show])

  // ── Grouped slots for current day ─────────────────────────────────────────

  const currentDay = days[dayIdx] ?? { slots: [] }
  const groupedSlots = useMemo(() => {
    const groups: Record<string, MealSlot[]> = {}
    for (const mt of MEAL_TYPES) groups[mt] = []
    for (const s of currentDay.slots) {
      if (!groups[s.meal_type]) groups[s.meal_type] = []
      groups[s.meal_type].push(s)
    }
    return groups
  }, [currentDay])

  const totalSlots = days.reduce((t, d) => t + d.slots.length, 0)

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Skeleton w={60} h={16} />
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton w={280} h={32} r={8} />
          <Skeleton w={200} h={14} />
        </div>
        <div style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={64} r={12} />)}
        </div>
      </div>
    )
  }

  if (!meta) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <BackLink onClick={() => router.back()} label="Back" />
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-title">Plan not found</div>
          </div>
        </div>
      </div>
    )
  }

  const memberName = meta.members?.full_name ?? "Member"

  return (
    <div className="ps-page ps-page--narrow db">
      <DesignStyles />
      <BackLink onClick={() => router.back()} label="Back" />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="db-title">{memberName}</h1>
            <span className="db-pill db-pill--purple">Manual</span>
            {meta.status === "draft" && <span className="db-pill db-pill--muted">Draft</span>}
          </div>
          <div className="db-plan-meta">
            <span>{meta.plan_days}-day plan from {formatDate(meta.start_date)}</span>
            <span className="db-plan-meta-dim">
              {totalSlots} meal{totalSlots !== 1 ? "s" : ""} added across all days
            </span>
          </div>
        </div>
      </header>

      {/* Day picker */}
      <div className="db-day-tabs" role="group" aria-label="Choose a day">
        {days.map((day, i) => {
          const info = dayInfo(i)
          return (
            <button
              key={i}
              type="button"
              className="db-day-tab"
              aria-pressed={i === dayIdx}
              aria-label={info.long}
              onClick={() => setDayIdx(i)}
            >
              <span className="db-day-tab-name">{info.short}</span>
              <span className="db-day-tab-num">{info.num}</span>
              {day.slots.length > 0 && i !== dayIdx && <span className="db-day-tab-flag" style={{ background: "var(--green-fill)" }} />}
            </button>
          )
        })}
      </div>

      {/* Day totals */}
      <div style={{ marginBottom: currentDay.slots.length > 0 ? 20 : 0 }}>
        <DayTotalsBar slots={currentDay.slots} />
      </div>

      {/* Copy from previous day */}
      {dayIdx > 0 && currentDay.slots.length === 0 && days[dayIdx - 1]?.slots.length > 0 && (
        <button
          type="button"
          className="ps-btn ps-btn--secondary"
          style={{ marginBottom: 20, width: "100%" }}
          onClick={copyPrevDay}
        >
          Copy meals from {dayInfo(dayIdx - 1).long}
        </button>
      )}

      {/* Meal type sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {MEAL_TYPES.map((mt) => {
          const slots = groupedSlots[mt] ?? []
          return (
            <section key={mt} className="db-card db-pad">
              <div className="db-card-head">
                <div style={{ minWidth: 0 }}>
                  <h2 className="db-card-title">{MEAL_LABELS[mt]}</h2>
                  {slots.length > 0 && <div className="db-card-sub">{slots.length} meal{slots.length !== 1 ? "s" : ""}</div>}
                </div>
                <button
                  type="button"
                  className="ps-btn ps-btn--secondary ps-btn--sm"
                  onClick={() => { setPickerMealType(mt); setPickerOpen(true) }}
                >
                  <Plus size={14} /> Add
                </button>
              </div>

              {slots.length === 0 ? (
                <div className="db-empty" style={{ padding: "16px 8px 6px" }}>
                  <div className="db-empty-text">No {MEAL_LABELS[mt].toLowerCase()} added yet</div>
                </div>
              ) : (
                <div className="db-rows">
                  {slots.map((slot) => (
                    <MealSlotRow
                      key={slot.id}
                      slot={slot}
                      onRemove={() => removeSlot(slot.id)}
                      onNotesChange={(notes) => updateSlotNotes(slot.id, notes)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      {/* Recipe picker sheet */}
      <RecipePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recipes={recipes}
        activeMealType={pickerMealType}
        onPick={(r) => {
          addSlot(r, pickerMealType ?? "breakfast")
          setPickerOpen(false)
        }}
      />

      {/* Action bar */}
      <div className="db-actionbar-spacer" />
      <div className="ps-actionbar">
        <button
          type="button"
          className="ps-btn ps-btn--secondary ps-hide-sm"
          onClick={() => handleSave(false)}
          disabled={saving}
        >
          {saving ? <Loader2 size={15} className="ps-spin" /> : null}
          Save draft
        </button>
        <button
          type="button"
          className="ps-btn ps-btn--primary"
          onClick={() => handleSave(true)}
          disabled={saving || totalSlots === 0}
          style={{ minWidth: 160 }}
        >
          {saving
            ? <><Loader2 size={15} className="ps-spin" /> Saving…</>
            : <><Check size={15} /> Publish plan</>
          }
        </button>
      </div>

      {toast}
    </div>
  )
}

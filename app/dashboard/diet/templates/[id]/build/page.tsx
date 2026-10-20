"use client"
// app/dashboard/diet/templates/[id]/build/page.tsx
// Condition-based diet plan template builder — reuses the member plan builder's recipe picker

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Check, ChevronDown, ChevronUp, Copy, Info, Loader2, Plus, Search, StickyNote, Trash2, UtensilsCrossed,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BackLink, Skeleton, useToast } from "../../../../components/ui"
import { Sheet } from "../../../../components/Sheet"
import { DesignStyles } from "../../../../components/DesignSystem"

// ── Types ──────────────────────────────────────────────────────────────────

interface Recipe {
  recipe_id: string
  recipe_name: string
  meal_type: string[]
  calories_kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  serving_size_description: string | null
  ingredients: { name?: string; ingredient_name?: string; quantity_grams: number; is_optional?: boolean }[] | null
  is_gym: boolean
}

interface MealSlot {
  id: string
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

interface DayPlan { slots: MealSlot[] }

interface TemplateMeta {
  id: string
  org_id: string | null
  name: string
  conditions: string[]
  description: string | null
  duration_days: number
}

const MEAL_TYPES = ["early_morning", "breakfast", "lunch", "snack", "dinner", "post_workout"]
const MEAL_LABELS: Record<string, string> = {
  early_morning: "Early morning", breakfast: "Breakfast", lunch: "Lunch",
  snack: "Snack", dinner: "Dinner", post_workout: "Post workout",
}
const CONDITIONS = ["Diabetes", "PCOS", "Hypertension", "Thyroid", "Weight Loss", "GERD"]
const DAY_LABELS = ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7", "Day 8", "Day 9", "Day 10", "Day 11", "Day 12", "Day 13", "Day 14"]

function uuid() { return crypto.randomUUID() }
const r1 = (n: number) => Math.round((n || 0) * 10) / 10

// ── Recipe picker sheet (same pattern as the member plan builder) ──────────

function RecipePickerSheet({ open, onClose, recipes, activeMealType, onPick }: {
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

  useEffect(() => {
    if (open) {
      setFilterMeal(activeMealType)
      setQuery("")
      setExpandedId(null)
      setLibraryFilter("all")
    }
  }, [open, activeMealType])

  const gymCount = recipes.filter((r) => r.is_gym).length

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return recipes.filter((r) => {
      const matchesQuery = !q || r.recipe_name.toLowerCase().includes(q)
      const matchesMeal = !filterMeal || (Array.isArray(r.meal_type) && r.meal_type.includes(filterMeal))
      const matchesLibrary = libraryFilter === "all" || r.is_gym
      return matchesQuery && matchesMeal && matchesLibrary
    })
  }, [recipes, query, filterMeal, libraryFilter])

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
          autoFocus
        />
      </label>

      <div className="db-presets" style={{ marginBottom: 8 }} role="group" aria-label="Recipe library">
        <button type="button" className="db-preset" aria-pressed={libraryFilter === "all"} onClick={() => setLibraryFilter("all")}>
          All recipes
        </button>
        <button type="button" className="db-preset" aria-pressed={libraryFilter === "mine"} onClick={() => setLibraryFilter("mine")}>
          My library{gymCount > 0 ? ` (${gymCount})` : ""}
        </button>
      </div>

      <div className="db-presets" style={{ marginBottom: 14 }} role="group" aria-label="Meal type">
        <button type="button" className="db-preset" aria-pressed={!filterMeal} onClick={() => setFilterMeal(null)}>All meals</button>
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
              ? "You haven't added any recipes to your gym's library yet."
              : "Try a different name or meal type."}
          </div>
        </div>
      ) : (
        <div className="db-rows" style={{ borderTop: "1px solid var(--db-border)" }}>
          {filtered.map((r) => {
            const isExpanded = expandedId === r.recipe_id
            return (
              <div key={r.recipe_id} style={{ borderBottom: "1px solid var(--db-border)" }}>
                <div className="db-row" style={{ padding: "12px 8px" }}>
                  <div className="db-row-text">
                    <div className="db-row-title">{r.recipe_name}</div>
                    <div className="db-row-sub">
                      {r.calories_kcal ? `${Math.round(r.calories_kcal)} kcal` : "No calories set"}
                      {r.protein_g ? ` · P ${r1(r.protein_g)}g` : ""}
                      {r.serving_size_description ? ` · ${r.serving_size_description}` : ""}
                    </div>
                    {(r.is_gym || (r.meal_type ?? []).length > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {r.is_gym && <span className="db-pill db-pill--green">My recipe</span>}
                        {(r.meal_type ?? []).map((mt) => (
                          <span key={mt} className="db-pill db-pill--muted">{MEAL_LABELS[mt] ?? mt}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="db-icon-btn"
                      aria-label={isExpanded ? "Hide ingredients" : "Show ingredients"}
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedId(isExpanded ? null : r.recipe_id)}
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                    <button type="button" className="ps-btn ps-btn--primary ps-btn--sm" onClick={() => onPick(r)}>
                      <Plus size={14} /> <span>Add</span>
                    </button>
                  </div>
                </div>
                {isExpanded && r.ingredients && r.ingredients.length > 0 && (
                  <div style={{ padding: "0 8px 14px" }}>
                    {r.ingredients.map((ing, i) => (
                      <div key={i} className="db-row-sub" style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", whiteSpace: "normal" }}>
                        <span>{ing.ingredient_name || ing.name || "Ingredient"}</span>
                        <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{ing.quantity_grams} g</span>
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

// ── One recipe inside a meal row ────────────────────────────────────────────

function SlotItem({ slot, first, onRemove, onNotesChange }: {
  slot: MealSlot; first: boolean; onRemove: () => void; onNotesChange: (notes: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const macros = [
    slot.protein_g ? `P ${r1(slot.protein_g)}g` : null,
    slot.carbs_g ? `C ${r1(slot.carbs_g)}g` : null,
    slot.fat_g ? `F ${r1(slot.fat_g)}g` : null,
  ].filter(Boolean).join(" · ")

  return (
    <div style={first ? undefined : { borderTop: "1px solid var(--db-border)", marginTop: 12, paddingTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="db-mealrow-name">{slot.recipe_name}</div>
          {macros && <div className="db-mealrow-sub">{macros}</div>}
        </div>
        <div className="db-mealrow-kcal">{Math.round(slot.calories)}<span>kcal</span></div>
        <button
          type="button"
          className="db-icon-btn"
          aria-label="Add a note"
          aria-pressed={editing}
          title="Note"
          onClick={() => setEditing((e) => !e)}
          style={slot.notes ? { color: "var(--accent)" } : undefined}
        >
          <StickyNote size={15} />
        </button>
        <button
          type="button"
          className="db-icon-btn"
          aria-label={`Remove ${slot.recipe_name}`}
          title="Remove"
          onClick={onRemove}
          style={{ color: "var(--red)" }}
        >
          <Trash2 size={15} />
        </button>
      </div>
      {editing ? (
        <input
          className="ps-input"
          style={{ marginTop: 8 }}
          placeholder="Note for the member (optional)"
          value={slot.notes}
          onChange={(e) => onNotesChange(e.target.value)}
          autoFocus
        />
      ) : slot.notes ? (
        <div className="db-mealrow-note">{slot.notes}</div>
      ) : null}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function TemplateBuilderPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const { toast, show } = useToast()

  const [meta, setMeta] = useState<TemplateMeta | null>(null)
  const [orgId, setOrgId] = useState("")
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [days, setDays] = useState<DayPlan[]>([])
  const [dayIdx, setDayIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState("")
  const [conditions, setConditions] = useState<string[]>([])
  const [description, setDescription] = useState("")

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMealType, setPickerMealType] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single()
      const myOrg = roleData?.org_id ?? ""
      setOrgId(myOrg)

      const { data: t } = await supabase
        .from("diet_plan_templates")
        .select("id, org_id, name, conditions, description, duration_days, template_json")
        .eq("id", id)
        .single()

      if (!t) { setLoading(false); return }
      setMeta(t as TemplateMeta)
      setName(t.name)
      setConditions(t.conditions ?? [])
      setDescription(t.description ?? "")

      const globalQuery = supabase
        .from("recipes")
        .select("recipe_id, recipe_name, meal_type, calories_kcal, protein_g, carbs_g, fat_g, serving_size_description, ingredients")
        .is("org_id", null)
        .eq("is_active", true)
        .order("recipe_name")
      const gymQuery = myOrg
        ? supabase
            .from("recipes")
            .select("recipe_id, recipe_name, meal_type, calories_kcal, protein_g, carbs_g, fat_g, serving_size_description, ingredients")
            .eq("org_id", myOrg)
            .eq("is_active", true)
            .order("recipe_name")
        : null

      const [globalRes, gymRes] = await Promise.all([globalQuery, gymQuery ?? Promise.resolve({ data: [] as Recipe[] })])
      const globalRecipes = ((globalRes.data as Recipe[]) ?? []).map((r) => ({ ...r, is_gym: false }))
      const gymRecipes = ((gymRes.data as Recipe[]) ?? []).map((r) => ({ ...r, is_gym: true }))
      const seen = new Map<string, Recipe>()
      for (const r of globalRecipes) seen.set(r.recipe_id, r)
      for (const r of gymRecipes) seen.set(r.recipe_id, r)
      setRecipes([...seen.values()].sort((a, b) => a.recipe_name.localeCompare(b.recipe_name)))

      const duration = t.duration_days ?? 7
      const existingDays = (t.template_json as { manual_days?: DayPlan[] } | null)?.manual_days
      if (existingDays && existingDays.length === duration) {
        setDays(existingDays)
      } else {
        setDays(Array.from({ length: duration }, () => ({ slots: [] })))
      }

      setLoading(false)
    }
    load()
  }, [id])

  function addSlot(recipe: Recipe, mealType: string) {
    const slot: MealSlot = {
      id: uuid(), meal_type: mealType, recipe_id: recipe.recipe_id, recipe_name: recipe.recipe_name,
      calories: recipe.calories_kcal ?? 0, protein_g: recipe.protein_g ?? 0, carbs_g: recipe.carbs_g ?? 0, fat_g: recipe.fat_g ?? 0,
      serving_size_description: recipe.serving_size_description, notes: "",
    }
    setDays((prev) => prev.map((day, i) => i === dayIdx ? { ...day, slots: [...day.slots, slot] } : day))
  }

  function removeSlot(slotId: string) {
    setDays((prev) => prev.map((day, i) => i === dayIdx ? { ...day, slots: day.slots.filter((s) => s.id !== slotId) } : day))
  }

  function updateSlotNotes(slotId: string, notes: string) {
    setDays((prev) => prev.map((day, i) => i === dayIdx ? { ...day, slots: day.slots.map((s) => s.id === slotId ? { ...s, notes } : s) } : day))
  }

  function copyPrevDay() {
    if (dayIdx === 0) return
    const prev = days[dayIdx - 1]
    if (!prev || prev.slots.length === 0) return
    const copied = prev.slots.map((s) => ({ ...s, id: uuid() }))
    setDays((d) => d.map((day, i) => i === dayIdx ? { ...day, slots: copied } : day))
  }

  function toggleCondition(c: string) {
    setConditions((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c])
  }

  const isGlobal = meta?.org_id === null

  const handleSave = useCallback(async () => {
    if (!meta || !orgId) return
    if (!name.trim()) { show("Give the template a name first", "error"); return }
    setSaving(true)
    try {
      const templateJson = { manual_days: days, engine_version: "manual" }

      if (isGlobal) {
        // First edit of a shared preset — fork into a copy only this gym can see and edit.
        // The original preset row is untouched and still available to every other gym.
        const { data, error } = await supabase
          .from("diet_plan_templates")
          .insert({
            org_id: orgId,
            name: name.trim(),
            conditions,
            description: description.trim() || null,
            duration_days: meta.duration_days,
            template_json: templateJson,
          })
          .select("id")
          .single()
        if (error || !data) { show("Couldn't save your copy. Try again.", "error"); return }
        show("Saved as your gym's own template")
        router.push(`/dashboard/diet/templates/${data.id}/build`)
      } else {
        const { error } = await supabase
          .from("diet_plan_templates")
          .update({
            name: name.trim(),
            conditions,
            description: description.trim() || null,
            template_json: templateJson,
          })
          .eq("id", meta.id)
        if (error) { show("Couldn't save. Try again.", "error"); return }
        show("Template saved")
      }
    } finally {
      setSaving(false)
    }
  }, [meta, orgId, name, conditions, description, days, isGlobal, router, show])

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

  const totalMeals = useMemo(() => days.reduce((n, d) => n + d.slots.length, 0), [days])
  const anyMeals = totalMeals > 0

  const dayTotals = useMemo(() => {
    const t = currentDay.slots.reduce(
      (a, s) => ({ kcal: a.kcal + (s.calories || 0), p: a.p + (s.protein_g || 0), c: a.c + (s.carbs_g || 0), f: a.f + (s.fat_g || 0) }),
      { kcal: 0, p: 0, c: 0, f: 0 },
    )
    const pK = t.p * 4, cK = t.c * 4, fK = t.f * 9
    const macroK = pK + cK + fK
    const share = (k: number) => (macroK > 0 ? k / macroK : 0)
    return { ...t, shares: { p: share(pK), c: share(cK), f: share(fK) } }
  }, [currentDay])

  const macroRows = [
    { key: "p", cls: "db-mx-p", label: "Protein", grams: dayTotals.p, share: dayTotals.shares.p },
    { key: "c", cls: "db-mx-c", label: "Carbs", grams: dayTotals.c, share: dayTotals.shares.c },
    { key: "f", cls: "db-mx-f", label: "Fat", grams: dayTotals.f, share: dayTotals.shares.f },
  ]
  const canCopyPrev = dayIdx > 0 && currentDay.slots.length === 0 && (days[dayIdx - 1]?.slots.length ?? 0) > 0

  if (loading) {
    return (
      <div className="ps-page ps-page--narrow db">
        <DesignStyles />
        <Skeleton w={80} h={16} />
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton w={300} h={36} r={10} />
          <Skeleton w="100%" h={230} r={20} />
          <Skeleton w="100%" h={64} r={14} />
          <Skeleton w="100%" h={320} r={20} />
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
            <span className="db-empty-icon"><UtensilsCrossed size={18} /></span>
            <div className="db-empty-title">Template not found</div>
            <div className="db-empty-text">It may have been deleted. Head back to the library to pick another.</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="ps-page ps-page--narrow db">
      <DesignStyles />
      <BackLink onClick={() => router.push("/dashboard/diet/templates")} label="Templates" />

      <header className="db-header">
        <div style={{ minWidth: 0 }}>
          <div className="db-kicker">Diet templates</div>
          <h1 className="db-title">{name.trim() || "Untitled template"}</h1>
          <p className="db-subtitle">
            <span className={`db-pill ${isGlobal ? "db-pill--muted" : "db-pill--blue"}`} style={{ marginRight: 8 }}>
              {isGlobal ? "Preset" : "Yours"}
            </span>
            <strong>{meta.duration_days}</strong> days · <strong>{totalMeals}</strong> meal{totalMeals !== 1 ? "s" : ""} set
          </p>
        </div>
      </header>

      {isGlobal && (
        <div className="db-callout db-tone-blue" style={{ marginBottom: 16 }}>
          <Info size={16} />
          <span>This is a shared preset. Saving creates a copy that only your gym can see and edit.</span>
        </div>
      )}

      {/* Details */}
      <section className="db-card db-pad" style={{ marginBottom: 24 }}>
        <div className="db-card-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="db-card-title">Details</h2>
            <div className="db-card-sub">What members will see when you assign this</div>
          </div>
        </div>

        <label className="ps-field" style={{ marginBottom: 16 }}>
          <span className="ps-label">Name</span>
          <input
            className="ps-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Diabetes starter plan"
          />
        </label>

        <div className="ps-field" style={{ marginBottom: 16 }}>
          <span className="ps-label" style={{ display: "block", marginBottom: 8 }}>Conditions</span>
          <div className="db-presets" role="group" aria-label="Conditions this template is for">
            {CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                className="db-preset"
                aria-pressed={conditions.includes(c)}
                onClick={() => toggleCondition(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="ps-field">
          <span className="ps-label">Description <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(optional)</span></span>
          <textarea
            className="ps-input"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this template is built for"
          />
        </label>
      </section>

      {/* Day picker */}
      <div className="db-section-head">
        <h2 className="db-section-title" style={{ margin: 0 }}>Meal plan</h2>
        <span className="db-card-sub">Pick a day, then add recipes to each meal</span>
      </div>

      <div className="db-day-tabs" role="group" aria-label="Choose a day">
        {days.map((day, i) => (
          <button
            key={i}
            type="button"
            className="db-day-tab"
            aria-pressed={i === dayIdx}
            aria-label={DAY_LABELS[i] ?? `Day ${i + 1}`}
            onClick={() => setDayIdx(i)}
          >
            <span className="db-day-tab-name">Day</span>
            <span className="db-day-tab-num">{i + 1}</span>
            {anyMeals && day.slots.length === 0 && <span className="db-day-tab-flag" title="No meals yet" />}
          </button>
        ))}
      </div>

      {/* Day summary */}
      {currentDay.slots.length > 0 && (
        <section className="db-card db-daysum" style={{ marginBottom: 16 }}>
          <div className="db-daysum-main">
            <div className="db-daysum-label">{DAY_LABELS[dayIdx] ?? `Day ${dayIdx + 1}`} total</div>
            <div className="db-daysum-value">{Math.round(dayTotals.kcal).toLocaleString("en-IN")}<span>kcal</span></div>
            <div className="db-daysum-sub">
              {currentDay.slots.length} recipe{currentDay.slots.length !== 1 ? "s" : ""}
            </div>
            <div className="db-splitbar" aria-hidden="true">
              {macroRows.map((m) => (
                <span key={m.key} className={m.cls} style={{ flexGrow: Math.max(m.share, 0.001) }} />
              ))}
            </div>
            <div className="db-splitlegend">
              {macroRows.map((m) => (
                <span key={m.key} className={m.cls}><i />{m.label} {Math.round(m.share * 100)}%</span>
              ))}
            </div>
          </div>
          <div className="db-daysum-macros">
            {macroRows.map((m) => (
              <div key={m.key} className={m.cls}>
                <div className="db-mxrow-top">
                  <span className="db-mxrow-name"><i />{m.label}</span>
                  <span className="db-mxrow-val">{r1(m.grams)}<small>g</small></span>
                </div>
                <div className="db-mxrow-track"><span style={{ transform: `scaleX(${m.share})` }} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {canCopyPrev && (
        <div className="db-callout db-tone-blue" style={{ marginBottom: 16, alignItems: "center" }}>
          <Copy size={16} />
          <span style={{ flex: 1, minWidth: 0 }}>{DAY_LABELS[dayIdx - 1]} already has meals. Reuse them as a starting point?</span>
          <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={copyPrevDay}>
            <span>Copy meals</span>
          </button>
        </div>
      )}

      {/* Meals for the day: one card, one row per meal type */}
      <section className="db-card db-meallist">
        {MEAL_TYPES.map((mt) => {
          const slots = groupedSlots[mt] ?? []
          return (
            <div key={mt} className="db-mealrow" style={{ alignItems: "start" }}>
              <div className="db-mealrow-type">{MEAL_LABELS[mt]}</div>
              <div style={{ minWidth: 0 }}>
                <div className="db-mealrow-eyebrow db-show-sm">{MEAL_LABELS[mt]}</div>
                {slots.length === 0 ? (
                  <div className="db-mealrow-sub" style={{ marginTop: 0, padding: "7px 0" }}>Nothing added yet</div>
                ) : (
                  slots.map((slot, idx) => (
                    <SlotItem
                      key={slot.id}
                      slot={slot}
                      first={idx === 0}
                      onRemove={() => removeSlot(slot.id)}
                      onNotesChange={(notes) => updateSlotNotes(slot.id, notes)}
                    />
                  ))
                )}
              </div>
              <button
                type="button"
                className="ps-btn ps-btn--secondary ps-btn--sm"
                onClick={() => { setPickerMealType(mt); setPickerOpen(true) }}
                aria-label={`Add to ${MEAL_LABELS[mt]}`}
              >
                <Plus size={14} /> <span>Add</span>
              </button>
            </div>
          )
        })}
      </section>

      <RecipePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        recipes={recipes}
        activeMealType={pickerMealType}
        onPick={(r) => { addSlot(r, pickerMealType ?? "breakfast"); setPickerOpen(false) }}
      />

      <div className="db-actionbar-spacer" />
      <div className="ps-actionbar">
        <button type="button" className="ps-btn ps-btn--secondary ps-hide-sm" onClick={() => router.push("/dashboard/diet/templates")}>
          <span>Cancel</span>
        </button>
        <button type="button" className="ps-btn ps-btn--primary" onClick={handleSave} disabled={saving} style={{ minWidth: 180 }}>
          {saving
            ? <><Loader2 size={15} className="ps-spin" /> <span>Saving…</span></>
            : <><Check size={15} strokeWidth={2.4} /> <span>{isGlobal ? "Save as my template" : "Save template"}</span></>}
        </button>
      </div>

      {toast}
    </div>
  )
}

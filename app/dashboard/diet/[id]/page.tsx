"use client"
// app/dashboard/diet/[id]/page.tsx

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ChevronRight, Check, Info, AlertTriangle, RefreshCw, Pencil, Loader2, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { BackLink, formatDate, Skeleton } from "../../components/ui"
import { DesignStyles } from "../../components/DesignSystem"
import { DietStyles } from "../components/DietTheme"

// ── Types (shape produced by app/api/generate-plan) ─────────────────────────
interface Macros { calories: number; protein_g: number; carbs_g: number; fat_g: number }
interface RecipeIngredient { ingredient_name?: string; quantity_grams?: number; is_optional?: boolean }
interface FoodItem { ingredient_id: number; food_name: string; quantity_grams: number; natural_quantity?: string; role?: string; calories: number }
interface Alternate {
  recipe_id?: string; recipe_name?: string; meal_label?: string; portion?: string
  serving_size_description?: string | null
  calories: number; protein_g: number; carbs_g: number; fat_g: number
  ingredients?: RecipeIngredient[]; food_items?: FoodItem[]
}
interface Meal extends Macros {
  meal_type: string; time?: string | null
  recipe_id?: string | null; recipe_name?: string | null; meal_label?: string
  portion?: string; serving_size_description?: string | null
  ingredients?: RecipeIngredient[]; food_items?: FoodItem[]
  carb_side?: { name: string; portion: string; calories: number } | null
  alternates?: Alternate[]
}
type ShownMeal = Meal & { swapped?: boolean }
interface DayPlan { meals: Meal[]; day_total: Macros; validation?: { status: string; message: string } }
interface PlanRow {
  id: string; member_id: string; plan_mode: string; plan_days: number; start_date: string
  status: string; version_number: number; target_kcal: number; target_protein_g: number
  target_carbs_g: number; target_fat_g: number; coach_notes: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plan_json: any
  members: { full_name: string; org_id?: string } | null
}

interface GymRecipe {
  recipe_id: string; recipe_name: string; meal_type: string[]
  calories_kcal: number | null; protein_g: number | null
  carbs_g: number | null; fat_g: number | null
  serving_size_description: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ingredients: any[] | null
}

// ── Display helpers ─────────────────────────────────────────────────────────
const MEAL_LABELS: Record<string, string> = {
  early_morning: "Early morning", breakfast: "Breakfast", lunch: "Lunch",
  snack: "Snack", dinner: "Dinner", post_workout: "Post workout",
}
const MODE_LABEL: Record<string, string> = { recipe: "Standard", protein_heavy: "Protein heavy", ingredient: "Simple foods", manual: "Manual" }
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function cleanName(name?: string | null) {
  return (name || "").replace(/\s*recipe$/i, "").replace(/^recipe\s*[-–]\s*/i, "").trim()
}

// Same bands as Nayamai: protein judged loosely and never red,
// fat 80–120% on target (red only over 130%), calories and carbs 90–110%.
type Band = "on" | "over" | "under"
function band(macro: "calories" | "protein" | "carbs" | "fat", pct: number): Band {
  if (macro === "protein") return pct >= 85 ? "on" : "under"
  if (macro === "fat") return pct > 130 ? "over" : pct >= 80 && pct <= 120 ? "on" : "under"
  return pct > 110 ? "over" : pct >= 90 ? "on" : "under"
}
const BAND_TEXT: Record<Band, string> = { on: "var(--green)", over: "var(--red)", under: "var(--amber)" }
const BAND_FILL: Record<Band, string> = { on: "var(--green-fill)", over: "var(--red-fill)", under: "var(--amber-fill)" }

const r1 = (n: number) => Math.round((n || 0) * 10) / 10
const macroLine = (m: Macros) => `P ${r1(m.protein_g)}g   C ${r1(m.carbs_g)}g   F ${r1(m.fat_g)}g`

// ── Day summary: calories + macro split in one panel ─────────────────────────
type MacroKey = "protein" | "carbs" | "fat"
const MACRO_META: Record<MacroKey, { label: string; field: "protein_g" | "carbs_g" | "fat_g"; kcalPerG: number; cls: string }> = {
  protein: { label: "Protein", field: "protein_g", kcalPerG: 4, cls: "db-mx-p" },
  carbs:   { label: "Carbs",   field: "carbs_g",   kcalPerG: 4, cls: "db-mx-c" },
  fat:     { label: "Fat",     field: "fat_g",     kcalPerG: 9, cls: "db-mx-f" },
}

function DaySummary({ totals, targets }: { totals: Macros; targets?: Macros }) {
  const energy = (["protein", "carbs", "fat"] as MacroKey[]).map((k) => totals[MACRO_META[k].field] * MACRO_META[k].kcalPerG)
  const energySum = energy.reduce((a, b) => a + b, 0) || 1
  const kcalPct = targets && targets.calories > 0 ? Math.round((totals.calories / targets.calories) * 100) : null
  const kcalBand = kcalPct !== null ? band("calories", kcalPct) : null

  return (
    <section className="db-card db-daysum" aria-label="Day totals">
      <div className="db-daysum-main">
        <div className="db-daysum-label">Calories</div>
        <div className="db-daysum-value">
          {Math.round(totals.calories).toLocaleString("en-IN")}
          <span>kcal</span>
        </div>
        <div className="db-daysum-sub">
          {kcalPct !== null && kcalBand ? (
            <>
              of {targets!.calories.toLocaleString("en-IN")} kcal target
              <span className="db-daysum-pct" data-band={kcalBand}>{kcalPct}%</span>
            </>
          ) : "Total for the day"}
        </div>
        <div className="db-splitbar" role="img" aria-label="Calories from protein, carbs and fat">
          {(["protein", "carbs", "fat"] as MacroKey[]).map((k, i) => (
            <span key={k} className={MACRO_META[k].cls} style={{ flexGrow: energy[i] / energySum }} />
          ))}
        </div>
        <div className="db-splitlegend">
          {(["protein", "carbs", "fat"] as MacroKey[]).map((k, i) => (
            <span key={k}><i className={MACRO_META[k].cls} />{MACRO_META[k].label} {Math.round((energy[i] / energySum) * 100)}%</span>
          ))}
        </div>
      </div>

      <div className="db-daysum-macros">
        {(["protein", "carbs", "fat"] as MacroKey[]).map((k) => {
          const value = totals[MACRO_META[k].field]
          const target = targets ? targets[MACRO_META[k].field] : 0
          const pct = target > 0 ? Math.round((value / target) * 100) : null
          const b = pct !== null ? band(k, pct) : null
          return (
            <div key={k} className="db-mxrow">
              <div className="db-mxrow-top">
                <span className="db-mxrow-name"><i className={MACRO_META[k].cls} />{MACRO_META[k].label}</span>
                <span className="db-mxrow-val">
                  {Math.round(value)}<small>g</small>
                  {pct !== null && <em>/ {Math.round(target)}g</em>}
                </span>
              </div>
              {pct !== null && b ? (
                <div className="db-mxrow-track">
                  <span className={MACRO_META[k].cls} data-band={b} style={{ transform: `scaleX(${Math.min(pct, 100) / 100})` }} />
                </div>
              ) : (
                <div className="db-mxrow-track">
                  <span className={MACRO_META[k].cls} style={{ transform: `scaleX(${Math.min(1, (value * MACRO_META[k].kcalPerG) / energySum)})` }} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function DietPlanViewPage() {
  const router = useRouter()
  const { id } = useParams() as { id: string }
  const [plan, setPlan] = useState<PlanRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [dayIdx, setDayIdx] = useState(0)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [swaps, setSwaps] = useState<Record<string, number>>({})
  // gym recipe swaps: meal key -> recipe_id
  const [gymSwaps, setGymSwaps] = useState<Record<string, string>>({})
  const [gymRecipes, setGymRecipes] = useState<GymRecipe[]>([])


  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("member_diet_plans")
        .select("*, members(full_name, org_id)")
        .eq("id", id).single()
      if (data) {
        setPlan(data as PlanRow)
        // Fetch this gym's custom recipes for live swap options
        const orgId = (data as PlanRow & { org_id?: string }).org_id
          || (data.members as { org_id?: string } | null)?.org_id
        if (orgId) {
          const { data: gr } = await supabase
            .from("recipes")
            .select("recipe_id, recipe_name, meal_type, calories_kcal, protein_g, carbs_g, fat_g, serving_size_description, ingredients")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .order("recipe_name")
          setGymRecipes((gr as GymRecipe[]) || [])
        }
      }
      setLoading(false)
    }
    load()
  }, [id])

  const days: { key: string; data: DayPlan }[] = useMemo(() => {
    const wp = plan?.plan_json?.weekly_plan
    if (!wp || Array.isArray(wp)) return []
    return Object.entries(wp)
      .map(([key, data]) => ({ key, data: data as DayPlan }))
      .sort((a, b) => parseInt(a.key.replace("day_", "")) - parseInt(b.key.replace("day_", "")))
  }, [plan])

  const [converting, setConverting] = useState(false)

  // Flattens an AI-generated plan (weekly_plan + any active swaps) into the
  // manual builder's shape, then hands editing over to the builder entirely.
  const handleConvertToManual = useCallback(async () => {
    if (!plan) return
    const ok = window.confirm(
      "Switch this plan to manual editing? You'll be able to add, remove and swap any meal freely, but it will no longer auto-update from the diet engine."
    )
    if (!ok) return

    setConverting(true)
    try {
      const wp = plan.plan_json?.weekly_plan
      const dayEntries = wp && !Array.isArray(wp)
        ? Object.entries(wp).sort(
            (a, b) => parseInt(a[0].replace("day_", "")) - parseInt(b[0].replace("day_", ""))
          )
        : []

      const manualDays = dayEntries.map(([dayKey, dayData]) => {
        const dp = dayData as DayPlan
        const slots = (dp.meals ?? []).map((m, i) => {
          const mk = `${dayKey}-${i}`
          const idx = swaps[mk]
          const alt = idx !== undefined ? m.alternates?.[idx] : undefined
          const gymRecipeId = gymSwaps[mk]
          const gr = gymRecipeId ? gymRecipes.find((r) => r.recipe_id === gymRecipeId) : undefined

          const resolved = alt
            ? { name: alt.meal_label || cleanName(alt.recipe_name) || "Meal", cal: alt.calories, p: alt.protein_g, c: alt.carbs_g, f: alt.fat_g, serving: alt.serving_size_description ?? null }
            : gr
            ? { name: gr.recipe_name, cal: gr.calories_kcal ?? m.calories, p: gr.protein_g ?? m.protein_g, c: gr.carbs_g ?? m.carbs_g, f: gr.fat_g ?? m.fat_g, serving: gr.serving_size_description }
            : { name: m.meal_label || cleanName(m.recipe_name) || "Meal", cal: m.calories, p: m.protein_g, c: m.carbs_g, f: m.fat_g, serving: m.serving_size_description ?? null }

          return {
            id: crypto.randomUUID(),
            meal_type: m.meal_type,
            recipe_id: m.recipe_id ?? "",
            recipe_name: resolved.name,
            calories: resolved.cal,
            protein_g: resolved.p,
            carbs_g: resolved.c,
            fat_g: resolved.f,
            serving_size_description: resolved.serving,
            notes: "",
          }
        })
        return { slots }
      })

      // Pad or trim to plan_days in case the engine data is short
      while (manualDays.length < plan.plan_days) manualDays.push({ slots: [] })

      const newPlanJson = { manual_days: manualDays.slice(0, plan.plan_days), engine_version: "manual" }

      const { error } = await supabase
        .from("member_diet_plans")
        .update({ plan_mode: "manual", plan_json: newPlanJson })
        .eq("id", plan.id)

      if (error) { alert("Couldn't convert the plan: " + error.message); setConverting(false); return }

      router.push(`/dashboard/diet/${plan.id}/build`)
    } catch {
      alert("Something went wrong converting the plan. Try again.")
      setConverting(false)
    }
  }, [plan, swaps, gymSwaps, gymRecipes, router])

  // ── Loading / missing ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="ps-page db dt">
        <DesignStyles /><DietStyles />
        <Skeleton w={60} h={16} />
        <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton w={260} h={34} r={8} />
          <Skeleton w={340} h={14} />
        </div>
        <div className="ps-stats ps-section" style={{ marginTop: 28 }}>
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} w="100%" h={120} r={16} />)}
        </div>
      </div>
    )
  }
  if (!plan) {
    return (
      <div className="ps-page db dt">
        <DesignStyles /><DietStyles />
        <BackLink href="/dashboard/diet" label="Diet plans" />
        <div className="db-card db-pad">
          <div className="db-empty">
            <div className="db-empty-title">Plan not found</div>
            <div className="db-empty-text">It may have been deleted, or the link is incorrect.</div>
          </div>
        </div>
      </div>
    )
  }

  const pj = plan.plan_json || {}
  const isManual = plan.plan_mode === "manual"
  const isLegacy = !isManual && (!pj.engine_version || Array.isArray(pj.weekly_plan))
  const memberName = plan.members?.full_name ?? "Member"
  const regenerateHref = `/dashboard/diet/new?member_id=${plan.member_id}`

  // Manual plans use a different plan_json shape (manual_days) and don't have
  // the AI engine's weekly_plan/alternates/clinical-rules structure.
  if (isManual) {
    const manualDays: { slots: { id: string; meal_type: string; recipe_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; serving_size_description: string | null; notes: string }[] }[] =
      pj.manual_days ?? []
    const mDay = manualDays[dayIdx]

    function manualDayInfo(i: number) {
      const d = new Date(plan!.start_date + "T00:00:00")
      d.setDate(d.getDate() + i)
      return {
        short: DAY_NAMES[d.getDay()],
        num: d.getDate(),
        long: d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
      }
    }

    const dayTotals = (mDay?.slots ?? []).reduce(
      (t, s) => ({
        calories: t.calories + s.calories, protein_g: t.protein_g + s.protein_g,
        carbs_g: t.carbs_g + s.carbs_g, fat_g: t.fat_g + s.fat_g,
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    )

    return (
      <div className="ps-page db dt">
        <DesignStyles /><DietStyles />
        <BackLink onClick={() => router.back()} label="Back" />

        <header className="db-header" style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h1 className="db-title">{memberName}</h1>
              <span className="db-pill db-pill--purple">Manual</span>
              {plan.status !== "active" && <span className="db-pill db-pill--muted">Older version</span>}
            </div>
            <div className="db-plan-meta">
              <span>{plan.plan_days}-day plan from {formatDate(plan.start_date)}</span>
              <span className="db-plan-meta-dim">Version {plan.version_number}</span>
            </div>
          </div>
          <div className="db-header-actions db-hide-sm">
            <Link href={`/dashboard/members/${plan.member_id}`} className="ps-btn ps-btn--secondary">View member</Link>
            <Link href={`/dashboard/diet/${plan.id}/build`} className="ps-btn ps-btn--primary">
              <Pencil size={15} /> Edit plan
            </Link>
          </div>
        </header>

        {/* Day picker */}
        <div className="db-day-tabs" role="group" aria-label="Choose a day">
          {manualDays.map((_, i) => {
            const info = manualDayInfo(i)
            return (
              <button key={i} type="button" className="db-day-tab" aria-pressed={i === dayIdx} aria-label={info.long} onClick={() => setDayIdx(i)}>
                <span className="db-day-tab-name">{info.short}</span>
                <span className="db-day-tab-num">{info.num}</span>
              </button>
            )
          })}
        </div>

        {/* Day totals */}
        {mDay && mDay.slots.length > 0 && <DaySummary totals={dayTotals} />}

        {/* Meals */}
        <div className="db-section-head" style={{ marginTop: 24 }}>
          <h2 className="db-section-title" style={{ margin: 0 }}>{manualDays[dayIdx] ? manualDayInfo(dayIdx).long : "Meals"}</h2>
          <span className="db-card-sub" style={{ marginTop: 0 }}>{mDay?.slots.length ?? 0} meal{(mDay?.slots.length ?? 0) === 1 ? "" : "s"}</span>
        </div>

        {(!mDay || mDay.slots.length === 0) ? (
          <div className="db-card db-pad"><div className="db-empty"><div className="db-empty-title">No meals added for this day</div></div></div>
        ) : (
          <div className="db-card db-meallist">
            {Object.keys(MEAL_LABELS).flatMap((mt) =>
              mDay.slots.filter((sl) => sl.meal_type === mt).map((sl, j) => (
                <div key={sl.id} className="db-mealrow">
                  <div className="db-mealrow-type">{j === 0 ? MEAL_LABELS[mt] : ""}</div>
                  <div className="db-mealrow-main">
                    <div className="db-mealrow-name">{sl.recipe_name}</div>
                    <div className="db-mealrow-sub">
                      <span className="db-show-sm">{MEAL_LABELS[mt]} · </span>
                      P {r1(sl.protein_g)}g · C {r1(sl.carbs_g)}g · F {r1(sl.fat_g)}g
                      {sl.serving_size_description ? ` · ${sl.serving_size_description}` : ""}
                    </div>
                    {sl.notes && <div className="db-mealrow-note">{sl.notes}</div>}
                  </div>
                  <div className="db-mealrow-kcal">{Math.round(sl.calories)}<span>kcal</span></div>
                </div>
              ))
            )}
          </div>
        )}

        {plan.coach_notes && (
          <section className="db-card db-pad" style={{ marginTop: 20 }}>
            <h2 className="db-card-title" style={{ marginBottom: 10 }}>Trainer notes</h2>
            <div style={{ fontSize: 14.5, color: "var(--text-secondary)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{plan.coach_notes}</div>
          </section>
        )}

        <div className="db-actionbar-spacer" />
        <div className="ps-actionbar ps-actionbar--phone">
          <Link href={`/dashboard/members/${plan.member_id}`} className="ps-btn ps-btn--secondary">View member</Link>
          <Link href={`/dashboard/diet/${plan.id}/build`} className="ps-btn ps-btn--primary">Edit plan</Link>
        </div>
      </div>
    )
  }

  if (isLegacy) {
    return (
      <div className="ps-page db dt">
        <DesignStyles /><DietStyles />
        <BackLink onClick={() => router.back()} label="Back" />
        <div className="db-card db-pad">
          <div className="db-empty">
            <span className="db-empty-icon"><RefreshCw size={18} /></span>
            <div className="db-empty-title">This plan was made with the old diet engine</div>
            <div className="db-empty-text">Generate a new plan for {memberName} to see meals, swaps and clinical rules here.</div>
            <Link href={regenerateHref} className="ps-btn ps-btn--primary" style={{ marginTop: 14 }}>Generate new plan</Link>
          </div>
        </div>
      </div>
    )
  }

  function dayInfo(i: number) {
    const d = new Date(plan!.start_date + "T00:00:00")
    d.setDate(d.getDate() + i)
    return {
      short: DAY_NAMES[d.getDay()],
      num: d.getDate(),
      long: d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }),
    }
  }

  const day = days[dayIdx]?.data
  const dayKey = days[dayIdx]?.key

  // Meals for the selected day, with any swaps applied
  const meals: ShownMeal[] = (day?.meals ?? []).map((m, i) => {
    const mk = `${dayKey}-${i}`
    // Engine alternate swap
    const idx = swaps[mk]
    const alt = idx !== undefined ? m.alternates?.[idx] : undefined
    if (alt) {
      return {
        ...m, ...alt,
        portion: alt.portion, serving_size_description: alt.serving_size_description ?? null,
        ingredients: alt.ingredients ?? [], food_items: alt.food_items ?? [], carb_side: null,
        swapped: true,
      }
    }
    // Gym recipe swap
    const gymRecipeId = gymSwaps[mk]
    if (gymRecipeId) {
      const gr = gymRecipes.find((r) => r.recipe_id === gymRecipeId)
      if (gr) {
        return {
          ...m,
          recipe_name: gr.recipe_name, meal_label: gr.recipe_name,
          calories: gr.calories_kcal ?? m.calories,
          protein_g: gr.protein_g ?? m.protein_g,
          carbs_g: gr.carbs_g ?? m.carbs_g,
          fat_g: gr.fat_g ?? m.fat_g,
          serving_size_description: gr.serving_size_description,
          ingredients: (gr.ingredients ?? []).map((ing) => ({
            ingredient_name: ing.ingredient_name || ing.name,
            quantity_grams: ing.quantity_grams,
            is_optional: ing.is_optional,
          })),
          food_items: [], carb_side: null, swapped: true,
        }
      }
    }
    return m
  })
  const totals = meals.reduce(
    (t, m) => ({
      calories: t.calories + (m.calories || 0), protein_g: t.protein_g + (m.protein_g || 0),
      carbs_g: t.carbs_g + (m.carbs_g || 0), fat_g: t.fat_g + (m.fat_g || 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  const macroCards = [
    { key: "calories" as const, label: "Calories", unit: "kcal", value: totals.calories,  target: plan.target_kcal },
    { key: "protein"  as const, label: "Protein",  unit: "g",    value: totals.protein_g, target: plan.target_protein_g },
    { key: "carbs"    as const, label: "Carbs",    unit: "g",    value: totals.carbs_g,   target: plan.target_carbs_g },
    { key: "fat"      as const, label: "Fat",      unit: "g",    value: totals.fat_g,     target: plan.target_fat_g },
  ]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const foodsToAvoid: any[] = Array.isArray(pj.foods_to_avoid) ? pj.foods_to_avoid : []
  const guidelines: string[] = Array.isArray(pj.general_guidelines) ? pj.general_guidelines : []
  const conditions: string[] = Array.isArray(pj.conditions_applied) ? pj.conditions_applied : []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewWarnings: any[] = (pj.calc?.warnings ?? []).filter((w: any) => w.severity === "review")

  function toggleSwap(mk: string, k: number) {
    setSwaps((s) => {
      const n = { ...s }
      if (n[mk] === k) delete n[mk]
      else n[mk] = k
      return n
    })
  }
  function restore(mk: string) {
    setSwaps((s) => { const n = { ...s }; delete n[mk]; return n })
    setGymSwaps((s) => { const n = { ...s }; delete n[mk]; return n })
  }

  function toggleGymSwap(mk: string, recipeId: string) {
    // Clear engine swap if active
    setSwaps((s) => { const n = { ...s }; delete n[mk]; return n })
    setGymSwaps((s) => {
      const n = { ...s }
      if (n[mk] === recipeId) delete n[mk]
      else n[mk] = recipeId
      return n
    })
  }

  return (
    <div className="ps-page db dt">
      <DesignStyles /><DietStyles />
      <BackLink onClick={() => router.back()} label="Back" />

      {/* Header */}
      <header className="db-header" style={{ alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 className="db-title">{memberName}</h1>
            <span className="db-pill db-pill--blue">{MODE_LABEL[plan.plan_mode] ?? plan.plan_mode}</span>
            {plan.status !== "active" && <span className="db-pill db-pill--muted">Older version</span>}
          </div>
          <div className="db-plan-meta">
            <span>{plan.plan_days}-day plan from {formatDate(plan.start_date)}</span>
            <span>
              <strong className="db-plan-meta-num">{plan.target_kcal.toLocaleString("en-IN")} kcal</strong> and{" "}
              <strong className="db-plan-meta-num">{plan.target_protein_g} g protein</strong> a day
              {pj.calc?.protein_g_per_kg ? ` (${pj.calc.protein_g_per_kg} g/kg)` : ""}
            </span>
            <span className="db-plan-meta-dim">Version {plan.version_number}</span>
          </div>
        </div>
        <div className="db-header-actions db-hide-sm">
          <Link href={`/dashboard/members/${plan.member_id}`} className="ps-btn ps-btn--secondary">View member</Link>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={handleConvertToManual} disabled={converting}>
            {converting ? <Loader2 size={15} className="ps-spin" /> : <Pencil size={15} />}
            {converting ? "Converting…" : "Edit plan"}
          </button>
          <Link href={regenerateHref} className="ps-btn ps-btn--primary">New version</Link>
        </div>
      </header>

      {/* Calculator notes */}
      {(pj.protein_ref_note || reviewWarnings.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {pj.protein_ref_note && (
            <div className="db-callout db-tone-blue"><Info size={16} />{pj.protein_ref_note}</div>
          )}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {reviewWarnings.map((w: any, i: number) => (
            <div key={i} className="db-callout db-tone-amber"><AlertTriangle size={16} />{w.message}</div>
          ))}
        </div>
      )}

      {/* Day picker */}
      <div className="db-day-tabs" role="group" aria-label="Choose a day">
        {days.map((d, i) => {
          const info = dayInfo(i)
          return (
            <button key={d.key} type="button" className="db-day-tab" aria-pressed={i === dayIdx} aria-label={info.long} onClick={() => setDayIdx(i)}>
              <span className="db-day-tab-name">{info.short}</span>
              <span className="db-day-tab-num">{info.num}</span>
              {d.data.validation?.status === "amber" && <span className="db-day-tab-flag" aria-label="Needs review" />}
            </button>
          )
        })}
      </div>

      {/* Day totals vs targets */}
      <DaySummary
        totals={totals}
        targets={{ calories: plan.target_kcal, protein_g: plan.target_protein_g, carbs_g: plan.target_carbs_g, fat_g: plan.target_fat_g }}
      />

      {day?.validation?.status === "amber" && (
        <div className="db-callout db-tone-amber" style={{ marginTop: 16 }}>
          <AlertTriangle size={16} />{day.validation.message}
        </div>
      )}

      {/* Meals */}
      <div className="db-section-head" style={{ marginTop: 20 }}>
        <h2 className="db-section-title" style={{ margin: 0 }}>{dayKey ? dayInfo(dayIdx).long : "Meals"}</h2>
        <span className="db-card-sub" style={{ marginTop: 0 }}>{meals.length} meals</span>
      </div>

      <div className="db-card db-meallist">
          {meals.map((meal, i) => {
            const mk = `${dayKey}-${i}`
            const isOpen = !!open[mk]
            const original = day!.meals[i]
            const name = meal.meal_label || cleanName(meal.recipe_name) || "Meal"
            const portion = [meal.portion, meal.serving_size_description].filter(Boolean).join(", ")
            const hasFoods = Array.isArray(meal.food_items) && meal.food_items.length > 0
            const hasIngredients = Array.isArray(meal.ingredients) && meal.ingredients.length > 0
            const alternates = original.alternates ?? []

            return (
              <div key={mk} className="db-mealrow-wrap" data-open={isOpen}>
                <button
                  type="button"
                  className="db-mealrow-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((o) => ({ ...o, [mk]: !o[mk] }))}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="db-mealrow-eyebrow">
                      {MEAL_LABELS[meal.meal_type] ?? meal.meal_type}
                      {meal.time ? `, ${meal.time}` : ""}
                    </div>
                    <div className="db-mealrow-name">
                      {name}
                      {meal.swapped && <span className="db-pill db-pill--blue" style={{ marginLeft: 8 }}>Swapped</span>}
                    </div>
                    <div className="db-mealrow-sub">
                      P {r1(meal.protein_g)}g · C {r1(meal.carbs_g)}g · F {r1(meal.fat_g)}g{portion ? ` · ${portion}` : ""}
                    </div>
                  </div>
                  <div className="db-mealrow-kcal">{Math.round(meal.calories)}<span>kcal</span></div>
                  <ChevronRight size={18} className="db-meal-chev" style={{ transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 180ms var(--db-ease)" }} />
                </button>

                {isOpen && (
                  <div className="db-meal-body">

                    {hasFoods && (
                      <div>
                        <div className="db-meal-swap-label">What to eat</div>
                        {meal.food_items!.map((f, k) => (
                          <div key={k} className="db-meal-item">
                            <span className="db-row-title" style={{ fontWeight: 500 }}>{f.food_name}</span>
                            <span className="db-meal-macro">
                              {f.natural_quantity ? `${f.natural_quantity} (${Math.round(f.quantity_grams)} g)` : `${Math.round(f.quantity_grams)} g`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {hasIngredients && (
                      <div>
                        <div className="db-meal-swap-label">Ingredients</div>
                        {meal.ingredients!.map((ing, k) => (
                          <div key={k} className="db-meal-item" style={ing.is_optional ? { opacity: 0.6 } : undefined}>
                            <span className="db-row-title" style={{ fontWeight: 500 }}>{ing.ingredient_name ?? "Ingredient"}{ing.is_optional ? " (optional)" : ""}</span>
                            <span className="db-meal-macro">{ing.quantity_grams ? `${ing.quantity_grams} g` : ""}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {meal.carb_side && (
                      <div>
                        <div className="db-meal-swap-label">On the side</div>
                        <div className="db-meal-item">
                          <span className="db-row-title" style={{ fontWeight: 500 }}>{meal.carb_side.name} ({meal.carb_side.portion})</span>
                          <span className="db-meal-kcal">{Math.round(meal.carb_side.calories)} kcal</span>
                        </div>
                      </div>
                    )}

                    {/* Engine alternates */}
                    {alternates.length > 0 && (
                      <div>
                        <div className="db-meal-swap-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span>Swap for</span>
                          {meal.swapped && (
                            <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 24 }} onClick={() => restore(mk)}>
                              Restore original
                            </button>
                          )}
                        </div>
                        {alternates.map((alt, k) => {
                          const applied = swaps[mk] === k
                          return (
                            <div key={k} className="db-swap-row" data-applied={applied}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="db-row-title" style={{ fontSize: 14 }}>{alt.meal_label || cleanName(alt.recipe_name)}</div>
                                <div className="db-row-sub" style={{ whiteSpace: "pre" }}>
                                  {Math.round(alt.calories)} kcal   {macroLine(alt)}
                                </div>
                              </div>
                              <button
                                type="button"
                                className={`ps-btn ps-btn--sm ${applied ? "ps-btn--primary" : "ps-btn--secondary"}`}
                                onClick={() => toggleSwap(mk, k)}
                                aria-pressed={applied}
                              >
                                {applied ? <><Check size={14} /> Using</> : "Use"}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Gym library swaps — searchable dropdown */}
                    {(() => {
                      const gymOptions = gymRecipes.filter((gr) =>
                        Array.isArray(gr.meal_type) && gr.meal_type.includes(meal.meal_type)
                      )
                      if (gymOptions.length === 0) return null
                      const activeRecipe = gymSwaps[mk] ? gymOptions.find((gr) => gr.recipe_id === gymSwaps[mk]) : null
                      return (
                        <div style={{ marginTop: alternates.length > 0 ? 14 : 0 }}>
                          <div className="db-meal-swap-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <RefreshCw size={12} />
                              Swap from your library
                              <span className="db-pill db-pill--muted">{gymOptions.length}</span>
                            </span>
                            {gymSwaps[mk] && (
                              <button type="button" className="ps-btn ps-btn--plain ps-btn--sm" style={{ height: 24 }} onClick={() => restore(mk)}>
                                Restore original
                              </button>
                            )}
                          </div>

                          {/* Active selection card */}
                          {activeRecipe && (() => {
                            const macros: Macros = {
                              calories: activeRecipe.calories_kcal ?? 0,
                              protein_g: activeRecipe.protein_g ?? 0,
                              carbs_g: activeRecipe.carbs_g ?? 0,
                              fat_g: activeRecipe.fat_g ?? 0,
                            }
                            return (
                              <div style={{ background: "var(--accent-dim)", border: "1.5px solid var(--accent)", borderRadius: 14, padding: "10px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--accent)" }}>{activeRecipe.recipe_name}</span>
                                    <span className="db-pill db-pill--green">Using</span>
                                  </div>
                                  <div className="db-row-sub" style={{ fontSize: 12, marginTop: 2 }}>
                                    {Math.round(macros.calories)} kcal · {macroLine(macros)}
                                  </div>
                                </div>
                                <button type="button" className="ps-btn ps-btn--secondary ps-btn--sm" onClick={() => restore(mk)}>
                                  <X size={13} /> Remove
                                </button>
                              </div>
                            )
                          })()}

                          {/* Searchable select */}
                          <div style={{ position: "relative" }}>
                            <select
                              className="ps-input"
                              style={{ height: 42, fontSize: 13.5, paddingRight: 32, borderRadius: 12 }}
                              value={gymSwaps[mk] ?? ""}
                              onChange={(e) => {
                                if (!e.target.value) { restore(mk); return }
                                toggleGymSwap(mk, e.target.value)
                              }}
                            >
                              <option value="">Choose a recipe from your library…</option>
                              {gymOptions.map((gr) => (
                                <option key={gr.recipe_id} value={gr.recipe_id}>
                                  {gr.recipe_name}
                                  {gr.calories_kcal ? ` — ${Math.round(gr.calories_kcal)} kcal` : ""}
                                  {gr.serving_size_description ? ` (${gr.serving_size_description})` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>

      {/* Clinical rules */}
      {(foodsToAvoid.length > 0 || guidelines.length > 0) && (
        <section style={{ marginTop: 24 }}>
          <div className="db-section-head">
            <h2 className="db-section-title" style={{ margin: 0 }}>Clinical rules</h2>
            <span className="db-card-sub" style={{ marginTop: 0 }}>
              {conditions.length > 0 ? `Built for ${conditions.join(", ")}` : "No medical conditions on file"}
            </span>
          </div>
          <div className={foodsToAvoid.length > 0 && guidelines.length > 0 ? "db-grid" : undefined}>
            {guidelines.length > 0 && (
              <div className={`db-card db-pad${foodsToAvoid.length > 0 ? " db-span-6" : ""}`}>
                <h3 className="db-card-title" style={{ marginBottom: 14 }}>Guidelines</h3>
                <ul className="db-guidelines">
                  {guidelines.map((g, i) => (
                    <li key={i}><Check size={15} className="db-guidelines-check" />{g}</li>
                  ))}
                </ul>
              </div>
            )}
            {foodsToAvoid.length > 0 && (
              <div className={`db-card db-pad${guidelines.length > 0 ? " db-span-6" : ""}`}>
                <h3 className="db-card-title" style={{ marginBottom: 6 }}>Foods to avoid</h3>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {foodsToAvoid.map((r: any, i: number) => (
                  <div key={i} style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--db-border)" : undefined }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{r.category}</div>
                    {r.reason && <div className="db-row-sub" style={{ whiteSpace: "normal", marginBottom: 8, marginTop: 2 }}>{r.reason}</div>}
                    <div className="ps-tags ps-tags--start">
                      {(r.examples ?? []).map((ex: string, j: number) => (
                        <span key={j} className="db-pill db-pill--red">{ex}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {plan.coach_notes && (
        <section className="db-card db-pad" style={{ marginTop: 20 }}>
          <h2 className="db-card-title" style={{ marginBottom: 10 }}>Trainer notes</h2>
          <div style={{ fontSize: 14.5, color: "var(--text-secondary)", whiteSpace: "pre-line", lineHeight: 1.55 }}>{plan.coach_notes}</div>
        </section>
      )}

      {/* Phone actions */}
      <div className="db-actionbar-spacer" />
      <div className="ps-actionbar ps-actionbar--phone">
        <Link href={`/dashboard/members/${plan.member_id}`} className="ps-btn ps-btn--secondary">View member</Link>
        <button type="button" className="ps-btn ps-btn--secondary" onClick={handleConvertToManual} disabled={converting}>
          {converting ? <Loader2 size={15} className="ps-spin" /> : <Pencil size={15} />}
          {converting ? "Converting…" : "Edit plan"}
        </button>
        <Link href={regenerateHref} className="ps-btn ps-btn--primary">New version</Link>
      </div>
    </div>
  )
}

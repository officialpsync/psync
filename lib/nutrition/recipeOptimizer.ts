// src/lib/nutrition/recipeOptimizer.ts
// Selects the best recipe and portion multiplier to hit a meal's macro targets.
// Multi-objective scoring: calorie proximity + protein match.
// Deterministic — no randomness, no AI.

import type { MealTarget } from './mealTargets'
import type { ClinicalFilters } from './clinicalFilters'

export interface RecipeSelection {
  recipe_id: string
  recipe_name: string
  portion: string
  portion_multiplier: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  serving_size_description: string | null
  ingredients: any[]
  carb_side: CarbSide | null
  alternates: RecipeAlternate[]
  score: number
}

export interface CarbSide {
  name: string
  portion: string
  grams: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface RecipeAlternate {
  recipe_id: string
  recipe_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  serving_size_description: string | null
}

// Verified carb sides — IFCT/NIN values per standard portion
const CARB_SIDES: Record<string, CarbSide> = {
  rice: {
    name: 'Brown Rice, cooked',
    portion: '1 small bowl',
    grams: 150,
    calories: 165,
    protein_g: 3.6,
    carbs_g: 34.2,
    fat_g: 1.4,
  },
  roti: {
    name: 'Whole Wheat Roti',
    portion: '2 rotis',
    grams: 120,
    calories: 264,
    protein_g: 8.4,
    carbs_g: 50.4,
    fat_g: 3.6,
  },
}

function pickCarbSide(cuisinePreference: string[]): CarbSide {
  const riceFirst = ['south_indian', 'andhra', 'tamil', 'kerala', 'bengali', 'odia']
  const useRice = cuisinePreference.some(c => riceFirst.includes(c.toLowerCase()))
  return useRice ? CARB_SIDES.rice : CARB_SIDES.roti
}

function scoreCandidate(
  scaledCal: number,
  scaledProt: number,
  scaledFat: number,
  mealTarget: MealTarget
): number {
  // Asymmetric calorie penalty — overshoot costs 2x more than undershoot.
  const calDelta = scaledCal - mealTarget.cal_target
  const calError = mealTarget.cal_target > 0
    ? (calDelta > 0
        ? (calDelta / mealTarget.cal_target) * 2.0
        : Math.abs(calDelta) / mealTarget.cal_target)
    : 0

  const protError = mealTarget.protein_target > 0
    ? Math.abs(scaledProt - mealTarget.protein_target) / mealTarget.protein_target
    : 0

  // Fat overshoot penalty — soft signal. Only penalises excess (not deficit)
  // so low-fat recipes are not disadvantaged.
  // Weight 1.5 ensures a meaningful preference for lower-fat recipes when
  // calorie and protein scores are similar, without overriding them entirely.
  const fatError = mealTarget.fat_target > 0 && scaledFat > mealTarget.fat_target
    ? ((scaledFat - mealTarget.fat_target) / mealTarget.fat_target) * 1.5
    : 0

  return (calError * 1.0) + (protError * 1.5) + fatError
}

const PORTION_OPTIONS_STANDARD = [
  { m: 1,   label: '1x serving' },
  { m: 1.5, label: '1.5x serving' },
  { m: 2,   label: '2x serving' },
  { m: 2.5, label: '2.5x serving' },
]

// Snack recipes are base 150-200 kcal. Cap at 2x (300-400 kcal max).
const PORTION_OPTIONS_SNACK = [
  { m: 1,   label: '1x serving' },
  { m: 1.5, label: '1.5x serving' },
  { m: 2,   label: '2x serving' },
]

// ─── INTERNAL HELPER ────────────────────────────────────────────────────────
// Scores a single candidate against a meal target and returns the best
// (multiplier, score, scaled macros) tuple, or null if no multiplier fits.
function evalCandidate(
  candidate: any,
  mealTarget: MealTarget,
  portionOptions: typeof PORTION_OPTIONS_STANDARD,
  mealProtCap: number,
  CAL_OVERAGE_CAP: number,
  FAT_OVERAGE_CAP: number,
): {
  score: number
  label: string
  m: number
  cal: number
  prot: number
  carbs: number
  fat: number
} | null {
  const base     = candidate.calories_kcal || 0
  const baseProt = candidate.protein_g || 0
  const baseFat  = candidate.fat_g || 0

  let best: ReturnType<typeof evalCandidate> = null

  for (const { m, label } of portionOptions) {
    const scaledCal  = Math.round(base * m)
    const scaledProt = baseProt * m
    const scaledFat  = baseFat * m

    if (scaledProt > mealProtCap)                                            continue
    if (scaledCal > mealTarget.cal_target * CAL_OVERAGE_CAP)                continue
    // Hard fat cap — skip multipliers that blow fat more than 60% over slot target.
    // This prevents high-fat fallback recipes (paneer, egg-heavy, nut-dense)
    // from passing purely on calorie score when the preferred protein pool is
    // exhausted late in the week.
    if (
      mealTarget.fat_target > 0 &&
      scaledFat > mealTarget.fat_target * FAT_OVERAGE_CAP
    ) continue
    const score = scoreCandidate(scaledCal, scaledProt, scaledFat, mealTarget)

    if (best === null || score < best.score) {
      best = {
        score,
        label,
        m,
        cal:   scaledCal,
        prot:  Math.round(scaledProt * 10) / 10,
        carbs: Math.round(candidate.carbs_g * m * 10) / 10,
        fat:   Math.round(candidate.fat_g * m * 10) / 10,
      }
    }
  }

  return best
}

// ─── PUBLIC API ─────────────────────────────────────────────────────────────

/**
 * selectBestRecipe
 *
 * Original single-pick interface — unchanged for backward compatibility.
 *
 * @param remainingDayCalories  Optional. Calories still available in the day
 *   budget after meals already committed. When provided, the carb side is
 *   suppressed if adding it would exceed the remaining budget.
 *   Pass undefined to use the old unconstrained behaviour (not recommended).
 */
export function selectBestRecipe(
  candidates: any[],
  mealTarget: MealTarget,
  cuisinePreference: string[],
  filters: ClinicalFilters,
  recipeUseCount: Record<string, number>,
  lastUsedOnDay: Record<string, number>,
  currentDay: number,
  remainingDayCalories?: number,   // NEW — day budget context
): RecipeSelection | null {
  const results = selectTopNRecipes(
    candidates,
    mealTarget,
    cuisinePreference,
    filters,
    recipeUseCount,
    lastUsedOnDay,
    currentDay,
    1,
    remainingDayCalories,
  )
  return results[0] ?? null
}

/**
 * selectTopNRecipes
 *
 * Returns up to N ranked RecipeSelection objects for a meal slot.
 * Used by the week-level resolver to have fallback options when a first-pick
 * causes a day-total overage that needs to be corrected without a full
 * regeneration.
 *
 * @param n                     Number of candidates to return (1–5).
 * @param remainingDayCalories  Calories still available in the day budget.
 *   When the best pick + carb side would exceed this, the carb side is
 *   suppressed. When even the best pick without carb side would exceed this,
 *   the next ranked candidate is tried instead.
 */
export function selectTopNRecipes(
  candidates: any[],
  mealTarget: MealTarget,
  cuisinePreference: string[],
  filters: ClinicalFilters,
  recipeUseCount: Record<string, number>,
  lastUsedOnDay: Record<string, number>,
  currentDay: number,
  n: number = 1,
  remainingDayCalories?: number,
): RecipeSelection[] {
  if (!candidates || candidates.length === 0) return []

  const isMainMeal  = ['lunch', 'dinner'].includes(mealTarget.meal_type)
  const isSnackSlot = mealTarget.meal_type === 'snack'
  const portionOptions = isSnackSlot ? PORTION_OPTIONS_SNACK : PORTION_OPTIONS_STANDARD

  const mealProtCap    = Math.round(mealTarget.protein_target * 2.5)
  const CAL_OVERAGE_CAP = 1.15
  // Hard fat cap per slot — blocks any multiplier that would put fat more than
  // 60% over the slot target. Mirrors the calorie cap logic. Loose enough (1.6x)
  // not to starve the optimizer of candidates, but tight enough to prevent the
  // paneer/egg/nut-heavy fallback that causes day-7 fat blowouts when protein
  // source caps exhaust the preferred pool.
  const FAT_OVERAGE_CAP = 1.60

  // Score every candidate
  type Scored = {
    candidate: any
    score: number
    label: string
    m: number
    cal: number
    prot: number
    carbs: number
    fat: number
  }

  const scored: Scored[] = []

  for (const candidate of candidates.slice(0, 20)) {   // widen to 20 to give topN more room
    const result = evalCandidate(candidate, mealTarget, portionOptions, mealProtCap, CAL_OVERAGE_CAP, FAT_OVERAGE_CAP)
    if (!result) continue
    scored.push({ candidate, ...result })
  }

  // Sort ascending by score (lower = better)
  scored.sort((a, b) => a.score - b.score)

  const output: RecipeSelection[] = []
  const usedRecipeIds = new Set<string>()

  for (const pick of scored) {
    if (output.length >= n) break
    if (usedRecipeIds.has(pick.candidate.recipe_id)) continue

    let finalCal   = pick.cal
    let finalProt  = pick.prot
    let finalCarbs = pick.carbs
    let finalFat   = pick.fat
    let carbSide: CarbSide | null = null

    // Carb side logic — gated by remaining day budget
    if (isMainMeal && finalCarbs < mealTarget.carbs_target * 0.6) {
      const side      = pickCarbSide(cuisinePreference)
      const afterSide = finalCal + side.calories

      // Only add carb side if:
      // (a) it stays within 115% of the meal slot target, AND
      // (b) the day budget (if provided) can absorb it
      const withinSlot = afterSide <= mealTarget.cal_target * CAL_OVERAGE_CAP
      const withinDay  = remainingDayCalories === undefined
        ? true
        : afterSide <= remainingDayCalories

      if (withinSlot && withinDay) {
        carbSide   = side
        finalCal  += side.calories
        finalProt += side.protein_g
        finalCarbs+= side.carbs_g
        finalFat  += side.fat_g
      }
      // If carb side does not fit, proceed without it — the plan is still valid,
      // just lower-carb. The client guideline text should mention extra roti/rice.
    }

    // If this pick (with or without carb side) would blow the remaining day
    // budget by more than 10%, skip it and try the next ranked candidate.
    if (
      remainingDayCalories !== undefined &&
      finalCal > remainingDayCalories * 1.10
    ) {
      continue
    }

    // Build alternates from remaining scored candidates (exclude already-picked)
    const alternates: RecipeAlternate[] = scored
      .filter(s => s.candidate.recipe_id !== pick.candidate.recipe_id && !usedRecipeIds.has(s.candidate.recipe_id))
      .slice(0, 2)
      .map(s => ({
        recipe_id:               s.candidate.recipe_id,
        recipe_name:             s.candidate.recipe_name,
        calories:                s.candidate.calories_kcal,
        protein_g:               s.candidate.protein_g,
        carbs_g:                 s.candidate.carbs_g,
        fat_g:                   s.candidate.fat_g,
        serving_size_description: s.candidate.serving_size_description || null,
      }))

    output.push({
      recipe_id:               pick.candidate.recipe_id,
      recipe_name:             pick.candidate.recipe_name,
      portion:                 pick.label,
      portion_multiplier:      pick.m,
      calories:                Math.round(finalCal * 10) / 10,
      protein_g:               Math.round(finalProt * 10) / 10,
      carbs_g:                 Math.round(finalCarbs * 10) / 10,
      fat_g:                   Math.round(finalFat * 10) / 10,
      serving_size_description: pick.candidate.serving_size_description || null,
      ingredients:             pick.candidate.ingredients || [],
      carb_side:               carbSide,
      alternates,
      score:                   Math.round(pick.score * 1000) / 1000,
    })

    usedRecipeIds.add(pick.candidate.recipe_id)
  }

  return output
}

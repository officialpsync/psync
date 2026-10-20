// src/lib/generation/recipePlan.ts
// Recipe mode ("Full Recipes") weekly plan builder: two-pass slot selection,
// glucose carb cap, scale-first calorie top-up.
// Moved verbatim out of api/generate-plan/route.ts on 29 Sep 2026 (no logic change).
// route.ts handles auth, targets, filters, coverage, validation, guidelines and saving.

import { selectTopNRecipes } from '@/lib/nutrition/recipeOptimizer'
import { calculateRecipeNutrition } from '@/lib/nutrition/ingredientOptimizer'

// ── Protein source detection ───────────────────────────────────────────────
// Derives a protein group from recipe_id so we can rotate protein sources
// across meal slots within the same day. Covers both non-veg and veg clients.
function getProteinSource(recipeId: string): string {
  if (!recipeId) return 'other'
  const id = recipeId.toLowerCase()
  // Non-veg proteins
  // omelette / anda added 1 Oct 2026: "masala_omelette" was 'other', so egg could
  // appear at breakfast and lunch on the same day.
  if (id.startsWith('egg') || id.includes('_egg') || id.includes('egg_white') || id.includes('bhurji') ||
      id.includes('omelet') || id.startsWith('anda') || id.includes('_anda')) return 'egg'
  if (id.startsWith('chicken') || id.includes('_chicken'))                                               return 'chicken'
  if (id.startsWith('prawn') || id.includes('_prawn'))                                                   return 'prawn'
  if (id.startsWith('rohu') || id.startsWith('catla') || id.startsWith('tuna') ||
      id.startsWith('fish') || id.includes('_fish') || id.includes('_rohu') ||
      id.includes('_catla') || id.includes('_tuna'))                                                     return 'fish'
  if (id.startsWith('mutton') || id.includes('_mutton'))                                                 return 'mutton'
  if (id.startsWith('whey') || id.includes('_whey'))                                                    return 'whey'
  // Veg proteins
  if (id.startsWith('tofu') || id.includes('_tofu'))                                                    return 'tofu'
  if (id.startsWith('paneer') || id.includes('_paneer') || id.includes('palak_paneer'))                 return 'paneer'
  if (id.startsWith('soybean') || id.includes('_soybean') || id.includes('soya'))                       return 'soybean'
  if (id.startsWith('rajma') || id.includes('_rajma'))                                                  return 'rajma'
  if (id.startsWith('chole') || id.includes('_chole') || id.includes('chana'))                         return 'chole'
  if (id.startsWith('moong') || id.includes('_moong') || id.includes('moong_'))                        return 'moong'
  if (id.startsWith('masoor') || id.includes('_masoor'))                                               return 'masoor'
  if (id.startsWith('dal') || id.includes('_dal') || id.includes('dal_'))                              return 'dal'
  return 'other'
}

// ── Recipe name similarity check ───────────────────────────────────────────
// Extracts the first 3 meaningful words from a recipe name for similarity
// comparison. Prevents "Tofu Palak with Roti" and "Tofu Palak Rice Bowl"
// from appearing in the same day (same dish, different carb base).
function getRecipeNameFingerprint(recipeName: string): string {
  if (!recipeName) return ''
  return recipeName
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => !['with', 'and', 'in', 'the', 'a', 'an', 'of', 'bowl', 'plate', 'thali'].includes(w))
    .slice(0, 3)
    .join(' ')
}

// ── Heartburn dinner rule (exported 1 Oct 2026) ────────────────────────────
// No rice at dinner for heartburn / reflux clients, same rule as ingredient
// mode. Rice IDs: 23 white, 24 brown, 25 basmati. Only applied if at least
// HEARTBURN_MIN_DINNERS rice-free dinners remain, so a thin pool is never
// emptied. Shared with the coverage check in route.ts so both use one rule.
const RICE_IDS = [23, 24, 25]
const HEARTBURN_MIN_DINNERS = 8
export function applyHeartburnDinnerFilter(
  recipesByMealType: Record<string, any[]>,
  filters: any,
  warn: boolean = false,
): Record<string, any[]> {
  if (!filters?.requireHeartburnSafe || !Array.isArray(recipesByMealType.dinner)) return recipesByMealType
  const riceFree = recipesByMealType.dinner.filter((r: any) =>
    !(Array.isArray(r.ingredients) ? r.ingredients : []).some((i: any) => RICE_IDS.includes(i.ingredient_id)))
  if (riceFree.length >= HEARTBURN_MIN_DINNERS) return { ...recipesByMealType, dinner: riceFree }
  if (warn) console.warn(`Heartburn rice-free dinner pool too thin (${riceFree.length}); rice dinners kept`)
  return recipesByMealType
}

export interface RecipePlanContext {
  client: any
  plan_days: number
  dayTargets: any
  recipesByMealType: Record<string, any[]>
  ingredientRows: Record<number, any>
  filters: any
  cuisinePreference: string[]
  glucoseSensitive: boolean
  isSimpleTreatMode: boolean
  TREAT_DAYS: Set<number>
  previousPlans: any[] | null
}

export interface RecipePlanResult {
  weeklyPlan: Record<string, any>
  emptySlots: string[]
}

export function buildRecipeWeeklyPlan(ctx: RecipePlanContext): RecipePlanResult {
  const {
    client, plan_days, dayTargets, ingredientRows, filters,
    cuisinePreference, glucoseSensitive, isSimpleTreatMode, TREAT_DAYS, previousPlans,
  } = ctx

  // Heartburn: no rice at dinner (29 Sep 2026). Rule lives in
  // applyHeartburnDinnerFilter so the coverage check uses the same one.
  const recipesByMealType = applyHeartburnDinnerFilter(ctx.recipesByMealType, filters, true)

  // ── 12. Generate weekly plan ──────────────────────────────────────────
  const weeklyPlan: Record<string, any> = {}
  const recipeUseCount: Record<string, Record<string, number>> = {}
  const lastUsedOnDay:  Record<string, Record<string, number>> = {}

  // Week-level protein source cap. Was a flat 3 across ALL slots: a 4-meal week
  // is 28 meals but a non-veg pool is mostly chicken / fish / egg / prawn, so by
  // day 5 every main source was capped, the eligible pool emptied and every
  // slot fell to the no-swap fallback (1 Oct 2026). Now sized so ~6 rotating
  // sources can cover the week: 7 days x 4 meals → 5, x 3 meals → 4. Min 3.
  const proteinSourceWeekCount: Record<string, number> = {}
  const mealsPerDay = Array.isArray(dayTargets?.meals) ? dayTargets.meals.length : 4
  const PROTEIN_SOURCE_WEEK_LIMIT = Math.max(3, Math.ceil(plan_days * mealsPerDay / 6))

  // Cross-plan memory: pre-populate from previous plan so those recipes
  // are deprioritised but NOT blocked (count = 1, not 2).
  if (previousPlans && previousPlans.length > 0) {
    try {
      const prevJson = previousPlans[0].plan_json
      if (prevJson?.weekly_plan && typeof prevJson.weekly_plan === 'object') {
        Object.values(prevJson.weekly_plan).forEach(function(dayData: any) {
          if (!dayData?.meals || !Array.isArray(dayData.meals)) return
          dayData.meals.forEach(function(meal: any) {
            const mt  = meal.meal_type
            const rid = meal.recipe_id
            if (!mt || typeof mt !== 'string') return
            if (!rid || typeof rid !== 'string') return
            if (!recipeUseCount[mt]) recipeUseCount[mt] = {}
            if (!lastUsedOnDay[mt])  lastUsedOnDay[mt]  = {}
            recipeUseCount[mt][rid] = 1
            lastUsedOnDay[mt][rid]  = 0
          })
        })
      }
    } catch (memErr) {
      console.warn('Cross-plan memory failed, proceeding fresh:', memErr)
    }
  }

  const emptySlots: string[] = []

  // ── Helper: build sorted eligible pool for a slot ─────────────────────
  function buildEligiblePool(
    mt: string,
    mealTypeRecipes: any[],
    day: number,
    usedInDay: Set<string>,
    usedFingerprintsInDay: Set<string>,
    usedProteinSourcesInDay: string[],
    preferHighProtein: boolean,
    mealCalTarget: number,
  ): any[] {
    const poolSize = mealTypeRecipes.length

    const maxUses = poolSize >= plan_days * 3
      ? 2
      : poolSize < plan_days
        ? Math.ceil(plan_days / Math.max(1, poolSize))
        : 2

    const minGap = poolSize >= 25
      ? 3
      : poolSize >= plan_days
        ? 2
        : 1

    const pool = mealTypeRecipes.filter(function(r: any) {
      if (usedInDay.has(r.recipe_id)) return false
      const fp = getRecipeNameFingerprint(r.recipe_name || '')
      if (fp && usedFingerprintsInDay.has(fp)) return false
      const uses    = recipeUseCount[mt][r.recipe_id] || 0
      const lastDay = lastUsedOnDay[mt][r.recipe_id]  || 0
      const neverUsed = lastDay === 0
      if (!(uses < maxUses && (neverUsed || (day - lastDay) >= minGap))) return false
      const ps = getProteinSource(r.recipe_id)
      if (ps !== 'other' && (proteinSourceWeekCount[ps] || 0) >= PROTEIN_SOURCE_WEEK_LIMIT) return false
      return true
    })

    let proteinRotatedPool = pool
    if (usedProteinSourcesInDay.length > 0 && pool.length > 0) {
      const alternatives = pool.filter(function(r: any) {
        return !usedProteinSourcesInDay.includes(getProteinSource(r.recipe_id))
      })
      if (alternatives.length > 0) proteinRotatedPool = alternatives
    }

    const eligiblePool = proteinRotatedPool.length > 0
      ? proteinRotatedPool
      : pool.length > 0
        ? pool
        : [...mealTypeRecipes]
            .filter(function(r: any) {
              if (usedInDay.has(r.recipe_id)) return false
              const fp = getRecipeNameFingerprint(r.recipe_name || '')
              if (fp && usedFingerprintsInDay.has(fp)) return false
              const lastDay = lastUsedOnDay[mt][r.recipe_id] || 0
              return lastDay === 0 || (day - lastDay) >= 1
            })
            .sort(function(a: any, b: any) {
              return (lastUsedOnDay[mt][a.recipe_id] || 0) - (lastUsedOnDay[mt][b.recipe_id] || 0)
            })
            .slice(0, 15)

    return [...eligiblePool].sort(function(a: any, b: any) {
      const aLastDay = lastUsedOnDay[mt][a.recipe_id] || 0
      const bLastDay = lastUsedOnDay[mt][b.recipe_id] || 0
      const aFresh = aLastDay === 0 ? 1 : 0
      const bFresh = bLastDay === 0 ? 1 : 0
      if (aFresh !== bFresh) return bFresh - aFresh
      if (aLastDay !== bLastDay) return aLastDay - bLastDay
      if (preferHighProtein) return b.protein_g - a.protein_g
      return Math.abs(a.calories_kcal - mealCalTarget) -
             Math.abs(b.calories_kcal - mealCalTarget)
    })
  }

  // ── Helper: portion multiplier toward a calorie goal (29 Sep 2026) ────
  // Used by the 1x fallback and the top-up swap, which both served recipes
  // unscaled and left late days 15-22% under target. Caps match the
  // optimizer: snacks 2x, main meals 2.5x. Steps of 0.25, never below 1x.
  function scaleMultiplier(baseKcal: number, goalKcal: number, mt: string): number {
    if (!baseKcal || baseKcal <= 0 || goalKcal <= baseKcal) return 1
    const cap = mt === 'snack' ? 2 : 2.5
    const raw = Math.min(cap, goalKcal / baseKcal)
    return Math.max(1, Math.floor(raw * 4) / 4)
  }

  // ── Helper: glucose-sensitive carb cap on scaling (29 Sep 2026) ───────
  // T2D / insulin resistance clients: a recipe may only be scaled up while
  // its carbs stay under the per-meal cap. Never shrinks below 1x, so a dish
  // already over the cap at 1x is served at 1x, not cut down.
  // Applies to optimizer picks, the fallback and the top-up swap.
  const GLUCOSE_CARB_CAP: Record<string, number> = { breakfast: 90, lunch: 90, dinner: 90, snack: 35 }
  function capForGlucose(carbs1x: number, mult: number, mt: string): number {
    if (!glucoseSensitive || mult <= 1 || !carbs1x || carbs1x <= 0) return mult
    const cap     = GLUCOSE_CARB_CAP[mt] ?? 90
    const allowed = Math.floor((cap / carbs1x) * 4) / 4
    return Math.max(1, Math.min(mult, allowed))
  }

  // ── Helper: nutrition for a recipe at a multiplier ────────────────────
  function nutritionAt(recipe: any, multiplier: number) {
    const scaled = (recipe.ingredients || []).map((ing: any) => ({
      ...ing,
      quantity_grams: Math.round((ing.quantity_grams || 0) * multiplier),
    }))
    let calc: any = null
    if (scaled.length > 0 && Object.keys(ingredientRows).length > 0) {
      try { calc = calculateRecipeNutrition(scaled, ingredientRows) } catch {}
    }
    return {
      calories:  calc?.calories  ?? (recipe.calories_kcal || 0) * multiplier,
      protein_g: calc?.protein_g ?? (recipe.protein_g || 0) * multiplier,
      carbs_g:   calc?.carbs_g   ?? (recipe.carbs_g || 0) * multiplier,
      fat_g:     calc?.fat_g     ?? (recipe.fat_g || 0) * multiplier,
      source:    calc ? 'calculated' : 'stored',
    }
  }

  for (let day = 1; day <= plan_days; day++) {
    const dayKey   = 'day_' + day
    const dayMeals: any[] = []

    const usedInDay              = new Set<string>()
    const usedFingerprintsInDay  = new Set<string>()
    const usedProteinSourcesInDay: string[] = []

    // Determine recipe pool mode for this day
    // treat day  → filter pool to is_treat = true
    // simple day → filter pool to is_simple = true
    // standard   → no filter, full pool (existing behaviour)
    const isTreatDay  = isSimpleTreatMode && TREAT_DAYS.has(day)
    const isSimpleDay = isSimpleTreatMode && !TREAT_DAYS.has(day)

    // Track remaining calorie and fat budget across slots within this day.
    // Each slot draws from these budgets so later slots cannot overshoot.
    let remainingDayCalories = dayTargets.total_kcal

    // ── Pass 1: select top-3 candidates per slot, commit nothing ─────────
    // This pre-flight lets us detect day-total overages before finalising
    // any slot, and swap to a lower candidate when needed.
    type SlotDraft = {
      mealTarget: any
      mt: string
      candidates: any[]   // up to 3 ranked RecipeSelection objects
      sorted: any[]       // eligible pool (for fallback)
      slotPool: any[]     // full slot pool for the day (simple/treat applied)
    }
    const slotDrafts: SlotDraft[] = []

    for (const mealTarget of dayTargets.meals) {
      const mt = mealTarget.meal_type
      if (!recipeUseCount[mt]) recipeUseCount[mt] = {}
      if (!lastUsedOnDay[mt])  lastUsedOnDay[mt]  = {}

      // Apply simple/treat pool filter for this day.
      // Falls back to full pool if the filtered pool is too small (< 10 recipes)
      // to avoid starvation on condition-heavy profiles with small intersecting pools.
      const fullPool      = recipesByMealType[mt] || []
      const filteredPool  = isSimpleTreatMode
        ? fullPool.filter((r: any) => isTreatDay ? r.is_treat : r.is_simple)
        : fullPool
      const mealTypeRecipes = (isSimpleTreatMode && filteredPool.length < 10)
        ? fullPool   // fallback: pool too small after complexity filter
        : filteredPool

      if (mealTypeRecipes.length === 0) {
        emptySlots.push(`day_${day}/${mt}`)
        slotDrafts.push({ mealTarget, mt, candidates: [], sorted: [], slotPool: [] })
        continue
      }

      const isMainMeal = ['lunch', 'dinner'].includes(mt)
      const preferHighProtein = isMainMeal && ['muscle_gain', 'fat_loss'].includes(client.primary_goal)

      const sorted = buildEligiblePool(
        mt, mealTypeRecipes, day,
        usedInDay, usedFingerprintsInDay, usedProteinSourcesInDay,
        preferHighProtein, mealTarget.cal_target,
      )

      // Get top 3 candidates — no day budget constraint yet, just slot cap
      const candidates = selectTopNRecipes(
        sorted, mealTarget, cuisinePreference,
        filters, recipeUseCount[mt] ?? {}, lastUsedOnDay[mt] ?? {}, day,
        3,
        undefined,   // no day budget in pass 1 — we resolve it in pass 2
      )

      slotDrafts.push({ mealTarget, mt, candidates, sorted, slotPool: mealTypeRecipes })
    }

    // ── Pass 2: commit slots one by one, decrementing remainingDayCalories ─
    // For each slot, pick the top candidate that fits within remaining budget.
    // If pick #1 overshoots, try #2, then #3, then forced 1x fallback.
    for (const draft of slotDrafts) {
      const { mealTarget, mt, candidates, sorted, slotPool } = draft

      if (candidates.length === 0 && sorted.length === 0) continue   // empty slot already logged

      let selection: any = null

      // Day rules re-checked at commit time (29 Sep 2026).
      // Pass 1 builds every slot's pool before anything is committed, so its
      // "protein already used today" / "same dish today" checks always saw an
      // empty day. That let one protein fill all three meals (mutton x3 on
      // day 7). Selection now goes through tiers, best first:
      //   1. ranked candidate: fits budget, not a repeat today, fresh protein
      //   2. pool recipe (scaled): not a repeat today, fresh protein
      //   3. same two tiers again with the weekly protein cap relaxed, but still
      //      no protein twice in one day (21 slots vs 6 sources x 3 runs out)
      //   4. ranked candidate / pool recipe: not a repeat today (protein relaxed)
      //   5. previous behaviour, so a slot is never left empty by this change
      // Fat is still a scoring penalty in recipeOptimizer, never a hard gate here.
      const isRepeatToday = (rid: string, name: string) => {
        if (usedInDay.has(rid)) return true
        const fp = getRecipeNameFingerprint(name || '')
        return !!fp && usedFingerprintsInDay.has(fp)
      }
      const isFreshProtein = (rid: string, enforceWeekCap = true) => {
        const ps = getProteinSource(rid)
        if (ps === 'other') return true
        if (usedProteinSourcesInDay.includes(ps)) return false
        return !enforceWeekCap || (proteinSourceWeekCount[ps] || 0) < PROTEIN_SOURCE_WEEK_LIMIT
      }
      const fitsBudget = (c: any) => c.calories <= remainingDayCalories * 1.10
      const closestToTarget = (list: any[]) => list.length === 0 ? null : list.reduce(function(best: any, r: any) {
        return Math.abs((r.calories_kcal || 0) - draft.mealTarget.cal_target) <
               Math.abs((best.calories_kcal || 0) - draft.mealTarget.cal_target) ? r : best
      }, list[0])

      // Swaps for a fallback pick (1 Oct 2026)
      const fallbackSwaps = (pick: any): any[] => {
        const pickPs = getProteinSource(pick.recipe_id)
        const base = [...sorted, ...slotPool].filter((r: any, i: number, arr: any[]) =>
          arr.findIndex((x: any) => x.recipe_id === r.recipe_id) === i &&
          r.recipe_id !== pick.recipe_id &&
          getRecipeNameFingerprint(r.recipe_name || '') !== getRecipeNameFingerprint(pick.recipe_name || '') &&
          !isRepeatToday(r.recipe_id, r.recipe_name) &&
          (recipeUseCount[mt][r.recipe_id] || 0) < 2)
        const gapOk  = (r: any) => { const l = lastUsedOnDay[mt][r.recipe_id] || 0; return l === 0 || day - l >= 2 }
        const byGap  = (r: any) => Math.abs((r.calories_kcal || 0) - draft.mealTarget.cal_target)
        const tiers  = [
          base.filter(r => gapOk(r) && isFreshProtein(r.recipe_id) && getProteinSource(r.recipe_id) !== pickPs),
          base.filter(r => gapOk(r) && isFreshProtein(r.recipe_id, false)),
          base.filter(r => isFreshProtein(r.recipe_id, false)),
        ]
        const out: any[] = []
        const usedPs = new Set<string>()
        for (const tier of tiers) {
          for (const r of [...tier].sort((a, b) => byGap(a) - byGap(b))) {
            if (out.length >= 2) break
            if (out.some(o => o.recipe_id === r.recipe_id)) continue
            const ps = getProteinSource(r.recipe_id)
            if (ps !== 'other' && usedPs.has(ps) && tier !== tiers[2]) continue   // two different proteins if possible
            usedPs.add(ps)
            out.push({
              recipe_id: r.recipe_id, recipe_name: r.recipe_name,
              serving_size_description: r.serving_size_description || null,
              calories: r.calories_kcal || 0, protein_g: r.protein_g || 0,
              carbs_g: r.carbs_g || 0, fat_g: r.fat_g || 0,
              ingredients: r.ingredients || [],
            })
          }
        }
        return out
      }

      let fallbackRecipe: any = null
      selection = candidates.find((c: any) =>
        fitsBudget(c) && !isRepeatToday(c.recipe_id, c.recipe_name) && isFreshProtein(c.recipe_id)) || null
      if (!selection) {
        fallbackRecipe = closestToTarget(sorted.filter((r: any) =>
          !isRepeatToday(r.recipe_id, r.recipe_name) && isFreshProtein(r.recipe_id)))
      }
      if (!selection && !fallbackRecipe) {
        selection = candidates.find((c: any) =>
          fitsBudget(c) && !isRepeatToday(c.recipe_id, c.recipe_name) && isFreshProtein(c.recipe_id, false)) || null
      }
      if (!selection && !fallbackRecipe) {
        // The eligible pool already dropped proteins at their weekly cap, so look
        // at the full slot pool here, still max 2 uses per recipe per week.
        // 1 Oct 2026: prefer recipes not eaten yesterday; this tier had no gap
        // check, so the same lunch and snack landed on day 5 and day 6.
        const notYesterday = (r: any) => {
          const last = lastUsedOnDay[mt][r.recipe_id] || 0
          return last === 0 || day - last >= 2
        }
        const fullTier = slotPool.filter((r: any) =>
          !isRepeatToday(r.recipe_id, r.recipe_name) && isFreshProtein(r.recipe_id, false) &&
          (recipeUseCount[mt][r.recipe_id] || 0) < 2)
        fallbackRecipe = closestToTarget(fullTier.filter(notYesterday)) || closestToTarget(fullTier)
      }
      if (!selection && !fallbackRecipe) {
        selection = candidates.find((c: any) =>
          fitsBudget(c) && !isRepeatToday(c.recipe_id, c.recipe_name)) || null
      }
      if (!selection && !fallbackRecipe) {
        fallbackRecipe = closestToTarget(sorted.filter((r: any) => !isRepeatToday(r.recipe_id, r.recipe_name)))
      }
      if (!selection && !fallbackRecipe) {
        selection = candidates.find(fitsBudget) || null
        if (!selection) fallbackRecipe = closestToTarget(sorted)
      }

      // Pool recipe chosen: scale it toward the slot target.
      if (!selection && sorted.length > 0) {

        if (fallbackRecipe) {
          // Scale toward the slot target, but not past what the day has left
          // (29 Sep 2026: this used to be a flat 1x, the main cause of late-day gaps)
          const fbGoal = Math.min(draft.mealTarget.cal_target, Math.max(0, remainingDayCalories) * 1.10)
          const fbMult = capForGlucose(
            fallbackRecipe.carbs_g || 0,
            scaleMultiplier(fallbackRecipe.calories_kcal || 0, fbGoal, mt),
            mt,
          )
          selection = {
            recipe_id:                fallbackRecipe.recipe_id,
            recipe_name:              fallbackRecipe.recipe_name,
            portion:                  fbMult === 1 ? '1x serving' : `${fbMult}x serving`,
            portion_multiplier:       fbMult,
            calories:                 (fallbackRecipe.calories_kcal || 0) * fbMult,
            protein_g:                (fallbackRecipe.protein_g || 0) * fbMult,
            carbs_g:                  (fallbackRecipe.carbs_g || 0) * fbMult,
            fat_g:                    (fallbackRecipe.fat_g || 0) * fbMult,
            serving_size_description: fallbackRecipe.serving_size_description || null,
            ingredients:              fallbackRecipe.ingredients || [],
            carb_side:                null,
            // 1 Oct 2026: fallback picks had no swaps at all. Two swaps from the
            // same slot pool: not a repeat today, max 2 uses a week, not eaten
            // yesterday, fresh protein preferred, different protein from the
            // pick where possible, closest to the slot target. The end-of-day
            // matching pass sets their portion and calories.
            alternates:               fallbackSwaps(fallbackRecipe),
            score:                    999,
          }
        }
      }

      if (!selection) {
        emptySlots.push(`day_${day}/${mt}`)
        continue
      }

      // Glucose-sensitive carb cap on the optimizer's portion (29 Sep 2026)
      if (glucoseSensitive) {
        const m0 = Number(selection.portion_multiplier) || 1
        // 1x carbs straight from the recipe row. Deriving it as carbs_g / multiplier
        // overestimated it and cut a 46g-carb dish to 1x (fixed 29 Sep 2026).
        const srcRecipe = (recipesByMealType[mt] || []).find((r: any) => r.recipe_id === selection.recipe_id)
        const carbs1x = srcRecipe ? (Number(srcRecipe.carbs_g) || 0) : 0
        const m1 = capForGlucose(carbs1x, m0, mt)
        if (m1 < m0) {
          const f = m1 / m0
          selection = {
            ...selection,
            portion:            m1 === 1 ? '1x serving' : `${m1}x serving`,
            portion_multiplier: m1,
            calories:           (selection.calories  || 0) * f,
            protein_g:          (selection.protein_g || 0) * f,
            carbs_g:            (selection.carbs_g   || 0) * f,
            fat_g:              (selection.fat_g     || 0) * f,
            glucose_capped:     true,
          }
        }
      }

      // Commit: deduct calories from remaining day budget
      remainingDayCalories -= selection.calories

      // Update all tracking state
      recipeUseCount[mt][selection.recipe_id] = (recipeUseCount[mt][selection.recipe_id] || 0) + 1
      lastUsedOnDay[mt][selection.recipe_id]  = day
      usedInDay.add(selection.recipe_id)
      const selectedFp = getRecipeNameFingerprint(selection.recipe_name || '')
      if (selectedFp) usedFingerprintsInDay.add(selectedFp)
      const selectedPs = getProteinSource(selection.recipe_id)
      usedProteinSourcesInDay.push(selectedPs)
      if (selectedPs !== 'other') {
        proteinSourceWeekCount[selectedPs] = (proteinSourceWeekCount[selectedPs] || 0) + 1
      }

      // Live nutrition calculation from ingredients
      const rawIngredients = Array.isArray(selection.ingredients)
        ? selection.ingredients
        : []

      const multiplierRaw = selection.portion_multiplier
      const multiplier = (multiplierRaw && !isNaN(Number(multiplierRaw)))
        ? Number(multiplierRaw)
        : 1

      const scaledIngredients = rawIngredients.map((ing: any) => ({
        ...ing,
        quantity_grams: Math.round((ing.quantity_grams || 0) * multiplier),
      }))

      const hasIngredientData = scaledIngredients.length > 0 &&
        Object.keys(ingredientRows).length > 0

      let calculatedNutrition: any = null

      if (hasIngredientData) {
        try {
          calculatedNutrition = calculateRecipeNutrition(scaledIngredients, ingredientRows)
        } catch (calcErr) {
          console.warn(`Nutrition calc failed for ${selection.recipe_id}:`, calcErr)
        }
      }

      const calories  = calculatedNutrition ? calculatedNutrition.calories  : (selection.calories || 0)
      const protein_g = calculatedNutrition ? calculatedNutrition.protein_g : (selection.protein_g || 0)
      const carbs_g   = calculatedNutrition ? calculatedNutrition.carbs_g   : (selection.carbs_g || 0)
      const fat_g     = calculatedNutrition ? calculatedNutrition.fat_g     : (selection.fat_g || 0)

      dayMeals.push({
        meal_type:                mt,
        time:                     draft.mealTarget.time,
        recipe_id:                selection.recipe_id,
        recipe_name:              selection.recipe_name,
        portion:                  selection.portion,
        portion_multiplier:       selection.portion_multiplier,
        serving_size_description: selection.serving_size_description,
        calories,
        protein_g,
        carbs_g,
        fat_g,
        ingredients:              selection.ingredients,
        carb_side:                selection.carb_side,
        alternates:               selection.alternates,
        optimizer_score:          selection.score,
        nutrition_source:         calculatedNutrition ? 'calculated' : 'stored',
        glucose_capped:           selection.glucose_capped || undefined,
      })
    }

    const dayTotal = {
      calories:  Math.round(dayMeals.reduce((s, m) => s + (m.calories || 0), 0) * 10) / 10,
      protein_g: Math.round(dayMeals.reduce((s, m) => s + (m.protein_g || 0), 0) * 10) / 10,
      carbs_g:   Math.round(dayMeals.reduce((s, m) => s + (m.carbs_g || 0), 0) * 10) / 10,
      fat_g:     Math.round(dayMeals.reduce((s, m) => s + (m.fat_g || 0), 0) * 10) / 10,
    }

    weeklyPlan[dayKey] = { meals: dayMeals, day_total: dayTotal }

    // ── Calorie top-up (rewritten 29 Sep 2026) ─────────────────────────
    // If the day is >12% under target, walk meals from biggest gap to
    // smallest and swap each for a scaled alternative until the day is
    // within 8% or every meal has been tried. Swaps respect the same day
    // rules as normal selection: simple/treat pool, no repeat recipe,
    // no repeat dish fingerprint, no protein source already used today
    // by another meal, never pushing the day past 110% of target.
    const TOPUP_TRIGGER = 0.10   // was 0.12; any day under 90% now gets a top-up (29 Sep 2026)
    const TOPUP_STOP    = 0.08
    const dayUnder = () => {
      const tot = dayMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0)
      return dayTargets.total_kcal > 0 ? (dayTargets.total_kcal - tot) / dayTargets.total_kcal : 0
    }

    if (dayUnder() > TOPUP_TRIGGER && dayMeals.length > 0) {
      const order = dayMeals
        .map((m: any, idx: number) => {
          const tgt = dayTargets.meals.find((t: any) => t.meal_type === m.meal_type)?.cal_target ?? 0
          return { idx, gap: tgt - (m.calories || 0), tgt }
        })
        .filter(o => o.gap > 0)
        .sort((a, b) => b.gap - a.gap)

      for (const { idx, tgt } of order) {
        if (dayUnder() <= TOPUP_STOP) break
        const current = dayMeals[idx]
        const mt      = current.meal_type

        // Same pool the day was built from
        const fullPool = recipesByMealType[mt] || []
        const complexityPool = isSimpleTreatMode
          ? fullPool.filter((r: any) => isTreatDay ? r.is_treat : r.is_simple)
          : fullPool
        const slotPool = (isSimpleTreatMode && complexityPool.length < 10) ? fullPool : complexityPool

        // Rules from the OTHER meals of the day (the current meal is being replaced)
        const otherMeals   = dayMeals.filter((_: any, i: number) => i !== idx)
        const otherIds     = new Set(otherMeals.map((m: any) => m.recipe_id))
        const otherFps     = new Set(otherMeals.map((m: any) => getRecipeNameFingerprint(m.recipe_name || '')).filter(Boolean))
        const otherSources = new Set(otherMeals.map((m: any) => getProteinSource(m.recipe_id)).filter((s: string) => s !== 'other'))

        const dayTotalNow = dayMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0)
        const room        = dayTargets.total_kcal * 1.10 - (dayTotalNow - (current.calories || 0))
        const goal        = Math.min(tgt, room)
        if (goal <= (current.calories || 0)) continue

        let best: { recipe: any, mult: number, nut: any, rescale?: boolean } | null = null

        // First try scaling up the dish already on the plate (29 Sep 2026).
        // Late in the week the pool is thin and no replacement qualifies,
        // while the current dish could simply be served larger.
        const curRecipe = (recipesByMealType[mt] || []).find((r: any) => r.recipe_id === current.recipe_id)
        if (curRecipe) {
          const curMult = Number(current.portion_multiplier) || 1
          const upMult  = capForGlucose(curRecipe.carbs_g || 0, scaleMultiplier(curRecipe.calories_kcal || 0, goal, mt), mt)
          if (upMult > curMult) {
            const nut = nutritionAt(curRecipe, upMult)
            if (nut.calories > (current.calories || 0) && nut.calories <= room) {
              best = { recipe: curRecipe, mult: upMult, nut, rescale: true }
            }
          }
        }
        // Keep the rescale if it gets within 90% of the goal; only look for a
        // replacement when scaling alone falls short.
        const rescaleGoodEnough = !!best && best.nut.calories >= goal * 0.90

        for (const r of (rescaleGoodEnough ? [] : slotPool)) {
          if (r.recipe_id === current.recipe_id) continue
          if (otherIds.has(r.recipe_id)) continue
          // Weekly rules (29 Sep 2026): the swap ignored these, so the highest-kcal
          // breakfast was swapped in on days 4, 5 and 6 in a row.
          const swapUses = recipeUseCount[mt]?.[r.recipe_id] || 0
          const swapLast = lastUsedOnDay[mt]?.[r.recipe_id] || 0
          if (swapUses >= 2) continue
          if (swapLast > 0 && day - swapLast < 2) continue
          const fp = getRecipeNameFingerprint(r.recipe_name || '')
          if (fp && otherFps.has(fp)) continue
          const ps = getProteinSource(r.recipe_id)
          if (ps !== 'other' && otherSources.has(ps)) continue
          if (ps !== 'other' && ps !== getProteinSource(current.recipe_id) &&
              (proteinSourceWeekCount[ps] || 0) >= PROTEIN_SOURCE_WEEK_LIMIT) continue

          const mult = capForGlucose(r.carbs_g || 0, scaleMultiplier(r.calories_kcal || 0, goal, mt), mt)
          const nut  = nutritionAt(r, mult)
          if (nut.calories <= (current.calories || 0)) continue
          if (nut.calories > room) continue
          if (!best || Math.abs(nut.calories - goal) < Math.abs(best.nut.calories - goal)) {
            best = { recipe: r, mult, nut }
          }
        }
        if (!best) continue

        const { recipe: swap, mult, nut } = best

        if (best.rescale) {
          dayMeals[idx] = {
            ...current,
            portion:            mult === 1 ? '1x serving' : `${mult}x serving`,
            portion_multiplier: mult,
            calories:           nut.calories,
            protein_g:          nut.protein_g,
            carbs_g:            nut.carbs_g,
            fat_g:              nut.fat_g,
            nutrition_source:   nut.source,
            top_up_scaled:      true,
          }
          continue   // same recipe: use counts and protein tracking unchanged
        }

        dayMeals[idx] = {
          ...current,
          recipe_id:                swap.recipe_id,
          recipe_name:              swap.recipe_name,
          portion:                  mult === 1 ? '1x serving' : `${mult}x serving`,
          portion_multiplier:       mult,
          serving_size_description: swap.serving_size_description || null,
          calories:                 nut.calories,
          protein_g:                nut.protein_g,
          carbs_g:                  nut.carbs_g,
          fat_g:                    nut.fat_g,
          ingredients:              swap.ingredients || [],
          carb_side:                null,
          // 1 Oct 2026: was [], so a topped-up meal lost all its swaps. The
          // replaced dish and the slot's old swaps stay as options; they are
          // rescaled to the new dish's calories by the matching pass below.
          alternates: [
            { recipe_id: current.recipe_id, recipe_name: current.recipe_name,
              serving_size_description: current.serving_size_description || null },
            ...(Array.isArray(current.alternates) ? current.alternates : []),
          ].filter((a: any) => a.recipe_id !== swap.recipe_id && a.recipe_name !== swap.recipe_name)
           .slice(0, 2),
          nutrition_source:         nut.source,
          top_up_swap:              true,
          glucose_capped:           undefined,   // belonged to the replaced dish
          optimizer_score:          undefined,
        }

        // Tracking: release the old recipe/source, claim the new ones
        const oldPs = getProteinSource(current.recipe_id)
        if (oldPs !== 'other' && (proteinSourceWeekCount[oldPs] || 0) > 0) proteinSourceWeekCount[oldPs]--
        const newPs = getProteinSource(swap.recipe_id)
        if (newPs !== 'other') proteinSourceWeekCount[newPs] = (proteinSourceWeekCount[newPs] || 0) + 1
        if (recipeUseCount[mt][current.recipe_id] > 0) recipeUseCount[mt][current.recipe_id]--
        recipeUseCount[mt][swap.recipe_id] = (recipeUseCount[mt][swap.recipe_id] || 0) + 1
        lastUsedOnDay[mt][swap.recipe_id]  = day
        usedInDay.add(swap.recipe_id)
      }

      // Second sweep (29 Sep 2026): if the day is still short, let each meal go
      // up to 115% of its own slot target by serving more of the same dish.
      // The first sweep stops at each slot's target, so when one meal is held
      // back by the carb cap the others could not make up the difference.
      if (dayUnder() > TOPUP_STOP) {
        const sweep = dayMeals
          .map((m: any, idx: number) => ({
            idx,
            tgt: dayTargets.meals.find((t: any) => t.meal_type === m.meal_type)?.cal_target ?? 0,
          }))
          .sort((a, b) => (b.tgt * 1.15 - (dayMeals[b.idx].calories || 0)) -
                          (a.tgt * 1.15 - (dayMeals[a.idx].calories || 0)))
        for (const { idx, tgt } of sweep) {
          if (dayUnder() <= TOPUP_STOP) break
          const current = dayMeals[idx]
          const mt      = current.meal_type
          const recipe  = (recipesByMealType[mt] || []).find((r: any) => r.recipe_id === current.recipe_id)
          if (!recipe) continue
          const dayTotalNow = dayMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0)
          const room    = dayTargets.total_kcal * 1.10 - (dayTotalNow - (current.calories || 0))
          const toFull  = (current.calories || 0) + (dayTargets.total_kcal - dayTotalNow)
          const goal    = Math.min(tgt * 1.15, toFull, room)
          const curMult = Number(current.portion_multiplier) || 1
          const mult    = capForGlucose(recipe.carbs_g || 0, scaleMultiplier(recipe.calories_kcal || 0, goal, mt), mt)
          if (mult <= curMult) continue
          const nut = nutritionAt(recipe, mult)
          if (nut.calories <= (current.calories || 0) || nut.calories > room) continue
          dayMeals[idx] = {
            ...current,
            portion:            mult === 1 ? '1x serving' : `${mult}x serving`,
            portion_multiplier: mult,
            calories:           nut.calories,
            protein_g:          nut.protein_g,
            carbs_g:            nut.carbs_g,
            fat_g:              nut.fat_g,
            nutrition_source:   nut.source,
            top_up_scaled:      true,
          }
        }
      }

      weeklyPlan[dayKey] = {
        meals: dayMeals,
        day_total: {
          calories:  Math.round(dayMeals.reduce((s: number, m: any) => s + (m.calories || 0), 0) * 10) / 10,
          protein_g: Math.round(dayMeals.reduce((s: number, m: any) => s + (m.protein_g || 0), 0) * 10) / 10,
          carbs_g:   Math.round(dayMeals.reduce((s: number, m: any) => s + (m.carbs_g || 0), 0) * 10) / 10,
          fat_g:     Math.round(dayMeals.reduce((s: number, m: any) => s + (m.fat_g || 0), 0) * 10) / 10,
        },
      }
    }

    // ── Swap calorie matching (1 Oct 2026) ──────────────────────────────
    // Swaps came from the optimizer at their own portion and were never
    // adjusted when the top-up scaled or replaced the primary, so a swap
    // could be 20-40% off the dish it replaces. Each swap is now served at
    // the quarter-step multiplier (1x to 2.5x, snacks 2x, glucose carb cap
    // respected) that lands closest to the primary's final calories. Never
    // below 1x, so a swap that is bigger at 1x stays at 1x. Swaps whose
    // recipe is no longer in the pool are left as they were.
    for (const meal of dayMeals) {
      if (!Array.isArray(meal.alternates) || meal.alternates.length === 0) continue
      const mt   = meal.meal_type
      const goal = meal.calories || 0
      if (goal <= 0) continue
      const pool = recipesByMealType[mt] || []
      const cap  = mt === 'snack' ? 2 : 2.5
      meal.alternates = meal.alternates.map((alt: any) => {
        const recipe = pool.find((r: any) =>
          (alt.recipe_id && r.recipe_id === alt.recipe_id) ||
          (!alt.recipe_id && alt.recipe_name && r.recipe_name === alt.recipe_name))
        if (!recipe || !(recipe.calories_kcal > 0)) return alt
        // Nearest quarter step, not just the floor
        const raw  = Math.min(cap, Math.max(1, goal / recipe.calories_kcal))
        const lo   = Math.max(1, Math.floor(raw * 4) / 4)
        const hi   = Math.min(cap, lo + 0.25)
        const pick = (m: number) => capForGlucose(recipe.carbs_g || 0, m, mt)
        const nLo  = nutritionAt(recipe, pick(lo))
        const nHi  = nutritionAt(recipe, pick(hi))
        const useHi = Math.abs(nHi.calories - goal) < Math.abs(nLo.calories - goal)
        const mult = useHi ? pick(hi) : pick(lo)
        const nut  = useHi ? nHi : nLo
        return {
          ...alt,
          recipe_id:                recipe.recipe_id,
          recipe_name:              recipe.recipe_name,
          serving_size_description: alt.serving_size_description ?? recipe.serving_size_description ?? null,
          ingredients:              alt.ingredients ?? recipe.ingredients ?? [],
          portion:                  mult === 1 ? '1x serving' : `${mult}x serving`,
          portion_multiplier:       mult,
          calories:                 Math.round(nut.calories),
          protein_g:                Math.round(nut.protein_g * 10) / 10,
          carbs_g:                  Math.round(nut.carbs_g * 10) / 10,
          fat_g:                    Math.round(nut.fat_g * 10) / 10,
        }
      })
    }
  }

  return { weeklyPlan, emptySlots }
}

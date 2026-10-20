// src/lib/generation/ingredientPlan.ts
// Ingredient mode ("Simple Food Items") weekly plan builder.
// Moved verbatim out of api/generate-plan/route.ts on 29 Sep 2026 (no logic change).
// route.ts handles auth, targets, filters, guidelines and saving; this file only
// builds the day-by-day meals.

import { buildIngredientMeal, topUpIngredientDay, matchAlternates, enforceOnePremiumPerDay } from '@/lib/nutrition/ingredientMealBuilder'

export interface IngredientPlanContext {
  client: any
  plan_days: number
  dayTargets: any
  ingredientRows: Record<number, any>
  filters: any
  glucoseSensitive: boolean
  previousPlans: any[] | null
  nextVersion: number
}

export function buildIngredientWeeklyPlan(ctx: IngredientPlanContext): Record<string, any> {
  const {
    client, plan_days, dayTargets, ingredientRows, filters,
    glucoseSensitive, previousPlans, nextVersion,
  } = ctx

  const ingredientWeeklyPlan: Record<string, any> = {}
  const isST = client.meal_complexity === 'simple_treat'

  // Week-level protein tracker — shared across all 7 days to enforce rotation
  const weekTracker = { lastUsedOnDay: {} as Record<string, Record<string | number, number>> }

  // Seed carb and veg rotation counters from nextVersion so each generation
  // starts at a different offset. Without this, every generation starts at
  // index 0 and produces identical carb/veg sequences.
  const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner']
  const CARB_POOL_SIZES: Record<string, number> = { breakfast: 2, lunch: 2, snack: 1, dinner: 3 }
  const VEG_POOL_SIZE = 5
  for (const mt of MEAL_SLOTS) {
    const carbKey = `__carbIndex_${mt}`
    const vegKey  = `__vegIndex_${mt}`
    if (!weekTracker.lastUsedOnDay[carbKey]) weekTracker.lastUsedOnDay[carbKey] = {}
    if (!weekTracker.lastUsedOnDay[vegKey])  weekTracker.lastUsedOnDay[vegKey]  = {}
    // Each slot gets a different starting offset so breakfast/lunch/dinner
    // don't all cycle in lockstep. The slot index (0–3) adds further spread.
    const slotIdx = MEAL_SLOTS.indexOf(mt)
    weekTracker.lastUsedOnDay[carbKey]['__idx'] = (nextVersion * 3 + slotIdx * 2 - 1) % Math.max(1, CARB_POOL_SIZES[mt] || 2)
    weekTracker.lastUsedOnDay[vegKey]['__idx']  = (nextVersion * 2 + slotIdx    - 1) % VEG_POOL_SIZE
  }

  // Cross-plan memory — load previous plan proteins into weekTracker so they
  // are on cooldown and won't repeat identically in the new plan.
  if (previousPlans && previousPlans.length > 0) {
    try {
      const prevJson = previousPlans[0].plan_json
      if (prevJson?.weekly_plan && typeof prevJson.weekly_plan === 'object') {
        // Previous-plan days are stored as days BEFORE day 1 of the new plan:
        // its last day = 0, the day before = -1, and so on. They used to be
        // stored as plan_days + dayNum (a future day), which put every
        // previous-plan protein on cooldown for the whole new week (fixed 25 Sep 2026).
        const prevDays = Object.keys(prevJson.weekly_plan).length
        Object.entries(prevJson.weekly_plan).forEach(([dayKey, dayData]: [string, any]) => {
          const dayNum = parseInt(dayKey.replace('day_', '')) || 0
          if (!dayData?.meals || !Array.isArray(dayData.meals)) return
          dayData.meals.forEach((meal: any) => {
            const mt = meal.meal_type
            if (!mt) return
            if (!weekTracker.lastUsedOnDay[mt]) weekTracker.lastUsedOnDay[mt] = {}
            if (!Array.isArray(meal.food_items)) return
            meal.food_items.forEach((item: any) => {
              if (item.role === 'protein' || item.role === 'dairy') {
                const asDay = dayNum - prevDays
                const prev  = weekTracker.lastUsedOnDay[mt][item.ingredient_id]
                weekTracker.lastUsedOnDay[mt][item.ingredient_id] = prev === undefined ? asDay : Math.max(prev, asDay)
              }
            })
          })
        })
      }
    } catch {
      // Cross-plan memory failed — proceed fresh
    }
  }

  // Weekly protein count — tracked PER SLOT so chicken at dinner and lunch
  // have independent caps. Key = meal_type, value = { ingredient_id: count }
  const weekProteinCount: Record<string, Record<number, number>> = {}
  const WEEK_PROTEIN_LIMIT = 3  // fallback for proteins not in PROTEIN_WEEK_CAPS

  for (let day = 1; day <= plan_days; day++) {
    const dayKey      = 'day_' + day
    const isTreatDay  = isST && [3, 7].includes(day)
    const dayMeals: any[] = []
    // Per-day Set — prevents same protein appearing twice in one day
    const dayProteinUsed = new Set<number>()

    for (const mealTarget of dayTargets.meals) {
      const meal = buildIngredientMeal(
        mealTarget, ingredientRows, client.diet_type || 'non_vegetarian',
        dayProteinUsed, isTreatDay, day, weekTracker,
        filters.excludedIngredientIds,
        filters.avoidBloatingTriggers,
        weekProteinCount,
        WEEK_PROTEIN_LIMIT,
        client.primary_goal || 'fat_loss',
        filters.excludeHighFat,
        filters.requireHeartburnSafe,
        glucoseSensitive,
      )
      if (meal) {
        // Update per-slot weekly protein count
        meal.food_items?.forEach((item: any) => {
          if (item.role === 'protein' || item.role === 'dairy') {
            if (!weekProteinCount[mealTarget.meal_type]) weekProteinCount[mealTarget.meal_type] = {}
            const slotCounts = weekProteinCount[mealTarget.meal_type]
            slotCounts[item.ingredient_id] = (slotCounts[item.ingredient_id] || 0) + 1
          }
        })
        dayMeals.push(meal)
      }
    }

    // Day-level top-up (29 Sep 2026): if the day is under 90%, add curd / rotis
    // to lunch or dinner meals that still have room (see ingredientMealBuilder).
    topUpIngredientDay(
      dayMeals, dayTargets.total_kcal, ingredientRows,
      filters.excludedIngredientIds, glucoseSensitive,
    )

    // One meat/fish per day must hold for swaps too (1 Oct 2026)
    enforceOnePremiumPerDay(dayMeals, ingredientRows, client.diet_type || 'non_vegetarian',
      filters.excludedIngredientIds, filters.avoidBloatingTriggers,
      filters.excludeHighFat, glucoseSensitive)

    // Swap calorie matching (1 Oct 2026): runs after the top-up so swaps are
    // matched to each primary's final calories.
    for (const m of dayMeals) {
      matchAlternates(m, ingredientRows, filters.excludedIngredientIds,
        filters.avoidBloatingTriggers, glucoseSensitive)
    }

    const dayTotal = {
      calories:  Math.round(dayMeals.reduce((s, m) => s + (m.calories || 0), 0) * 10) / 10,
      protein_g: Math.round(dayMeals.reduce((s, m) => s + (m.protein_g || 0), 0) * 10) / 10,
      carbs_g:   Math.round(dayMeals.reduce((s, m) => s + (m.carbs_g || 0), 0) * 10) / 10,
      fat_g:     Math.round(dayMeals.reduce((s, m) => s + (m.fat_g || 0), 0) * 10) / 10,
    }
    ingredientWeeklyPlan[dayKey] = { meals: dayMeals, day_total: dayTotal }
  }

  return ingredientWeeklyPlan
}

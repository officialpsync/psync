// lib/nutrition/mealTargets.ts (ported from Nayamai)
// Allocates daily macro targets across meals based on meal frequency and type.
// This runs BEFORE recipe selection — each meal gets a hard target to hit.

import type { CalculationResult } from '@/lib/nutrition/calculations'

export interface MealTarget {
  meal_type: string
  time: string | null
  cal_target: number
  protein_target: number
  carbs_target: number
  fat_target: number
  cal_tolerance_pct: number   // acceptable deviation before flagging
  protein_tolerance_pct: number
}

export interface DayTargets {
  total_kcal: number
  total_protein_g: number
  total_carbs_g: number
  total_fat_g: number
  meals: MealTarget[]
}

// Calorie distribution by meal type — must sum to 1.0 per meal set
// Designed for Indian eating patterns: lighter breakfast, heavy lunch, moderate dinner
const MEAL_WEIGHTS: Record<string, number> = {
  early_morning: 0.05,
  breakfast:     0.25,
  lunch:         0.35,
  snack:         0.10,
  dinner:        0.25,
}

// Meal times — approximate only, used as display hint not clinical instruction
// TODO: replace with client schedule data when collected
const MEAL_TIMES: Record<string, string> = {
  early_morning: '6:30 AM',
  breakfast:     '8:30 AM',
  lunch:         '1:00 PM',
  snack:         '4:30 PM',
  dinner:        '8:00 PM',
}

function getMealTypes(mealFrequency: number): string[] {
  if (mealFrequency <= 2) return ['breakfast', 'dinner']
  if (mealFrequency === 3) return ['breakfast', 'lunch', 'dinner']
  if (mealFrequency === 4) return ['breakfast', 'lunch', 'snack', 'dinner']
  return ['early_morning', 'breakfast', 'lunch', 'snack', 'dinner']
}

// Heartburn clients: shift 100 kcal from dinner to lunch so the heaviest
// meal lands at midday, not late evening. Only applied when the plan has
// both a lunch and a dinner slot.
const HEARTBURN_DINNER_SHIFT_KCAL = 50

export function allocateMealTargets(
  calcs: CalculationResult,
  mealFrequency: number,
  overrideKcal?: number,
  requireHeartburnSafe?: boolean
): DayTargets {
  const totalKcal = overrideKcal || calcs.target_kcal

  // If calorie override provided, scale macros proportionally
  const scale = totalKcal / calcs.target_kcal
  const totalProtein = Math.round(calcs.target_protein_g * scale)
  const totalFat     = Math.round(calcs.target_fat_g * scale)
  const totalCarbs   = Math.max(0, Math.round((totalKcal - totalProtein * 4 - totalFat * 9) / 4))

  const mealTypes = getMealTypes(mealFrequency)

  // Normalize weights for selected meal types
  const selectedWeights = mealTypes.reduce(function(acc, mt) {
    acc[mt] = MEAL_WEIGHTS[mt] || 0.25
    return acc
  }, {} as Record<string, number>)

  const totalWeight = Object.values(selectedWeights).reduce(function(s, w) { return s + w }, 0)

  const meals: MealTarget[] = mealTypes.map(function(mt, i) {
    const isLast = i === mealTypes.length - 1
    const w = selectedWeights[mt] / totalWeight

    // Last meal gets exactly what's left to avoid rounding drift
    const prevMealsCal = isLast
      ? mealTypes.slice(0, -1).reduce(function(s, m) {
          return s + Math.round(totalKcal * (selectedWeights[m] / totalWeight))
        }, 0)
      : 0

    return {
      meal_type: mt,
      time: MEAL_TIMES[mt] || null,
      cal_target:     isLast ? totalKcal - prevMealsCal : Math.round(totalKcal * w),
      protein_target: Math.round(totalProtein * w),
      carbs_target:   Math.round(totalCarbs * w),
      fat_target:     Math.round(totalFat * w),
      // Tolerances — breakfast tighter, snack looser
      cal_tolerance_pct:     mt === 'snack' ? 30 : 15,
      protein_tolerance_pct: mt === 'snack' ? 40 : 20,
    }
  })

  // Heartburn adjustment: move 100 kcal from dinner to lunch
  if (requireHeartburnSafe) {
    const lunchIdx  = meals.findIndex(m => m.meal_type === 'lunch')
    const dinnerIdx = meals.findIndex(m => m.meal_type === 'dinner')
    if (lunchIdx !== -1 && dinnerIdx !== -1 &&
        meals[dinnerIdx].cal_target > HEARTBURN_DINNER_SHIFT_KCAL + 200) {
      meals[lunchIdx].cal_target  += HEARTBURN_DINNER_SHIFT_KCAL
      meals[dinnerIdx].cal_target -= HEARTBURN_DINNER_SHIFT_KCAL
    }
  }

  return {
    total_kcal:     totalKcal,
    total_protein_g: totalProtein,
    total_carbs_g:   totalCarbs,
    total_fat_g:     totalFat,
    meals,
  }
}

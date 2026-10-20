// src/lib/nutrition/planValidator.ts
// Validates generated meal plans against daily and weekly targets.
// This is the final gate before a plan is saved - deterministic, not AI.
//
// Validation statuses:
//   on_target   - within acceptable deviation
//   amber       - minor gap, plan still saves
//   red         - gap too large, plan rejected (optimization failure)
//
// Coverage check statuses (pre-generation):
//   CONTENT_GAP - recipe pool cannot physically reach calorie target
//                 after clinical filtering. Not an optimizer failure.

export interface MacroValidationItem {
  target: number
  planned: number
  gap_pct: number
  pass: boolean
}

export interface DayValidation {
  day_key: string
  status: 'on_target' | 'amber' | 'red'
  macro_validation: {
    calories: MacroValidationItem
    protein:  MacroValidationItem
    carbs:    MacroValidationItem
    fat:      MacroValidationItem
  }
  message: string
  can_save: boolean
}

export interface WeekValidation {
  valid: boolean
  days: DayValidation[]
  failed_days: string[]
  summary: string
}

// Per-slot coverage result from checkRecipeCoverage()
export interface SlotCoverage {
  meal_type: string
  cal_target: number
  max_achievable_cal: number
  coverage_pct: number        // max_achievable / target * 100
  recipe_count: number
  status: 'ok' | 'borderline' | 'gap'
}

export interface CoverageCheckResult {
  can_generate: boolean
  overall_coverage_pct: number
  slots: SlotCoverage[]
  // Human-readable summary for API response
  summary: string
}

// Tolerance thresholds - gap_pct above these triggers failure at that level
// Calibrated for Indian recipe-based plans with 3-5 meals per day.
const THRESHOLDS = {
  calories: { pass: 20, amber: 30 },
  protein:  { pass: 25, amber: 35 },
  carbs:    { pass: 30, amber: 40 },
  fat:      { pass: 30, amber: 40 },
}

// Coverage thresholds - below these the recipe pool cannot hit calorie target
const COVERAGE = {
  ok:          0.90,   // >= 90% coverage → ok
  borderline:  0.80,   // 80-90% → borderline (warn but allow generation)
  gap:         0.80,   // < 80% → CONTENT_GAP, block generation
}

// Portion multipliers used by recipe mode (must match recipePlan.ts):
// main meals up to 2.5x, snacks up to 2x.
const MAX_PORTION_MULTIPLIER       = 2.5
const MAX_SNACK_PORTION_MULTIPLIER = 2.0
// Glucose-sensitive carb caps per serving (must match recipePlan.ts capForGlucose)
const GLUCOSE_CARB_CAP_MAIN  = 90
const GLUCOSE_CARB_CAP_SNACK = 35

export interface CoverageOptions {
  // Plan length. A recipe can be used at most twice a week, so a slot needs
  // about ceil(days / 2) distinct recipes that reach the target.
  planDays?: number
  // Glucose-sensitive clients: multipliers are capped by the carb caps
  glucoseSensitive?: boolean
  // Extra per-slot filters that generation applies later (e.g. heartburn:
  // no rice at dinner). Return false to drop a recipe from that slot.
  slotFilters?: Record<string, (recipe: any) => boolean>
}

// ── Coverage check (runs BEFORE generation) ──────────────────────────────────

/**
 * Check whether the filtered recipe pool can physically reach calorie targets.
 * Call this before the weekly generation loop.
 *
 * 1 Oct 2026: coverage now mirrors what generation can actually use:
 *   - snacks scale to 2x, not 2.5x
 *   - glucose-sensitive multipliers are capped by the 90g / 35g carb caps
 *   - per-slot filters from generation (heartburn dinners) are applied
 *   - a slot is scored on its Nth best recipe, N = ceil(planDays / 2),
 *     not the single biggest recipe. One outlier dish used to make a thin
 *     pool look fine even though it can only appear twice a week.
 *
 * recipesByMealType: already-filtered recipe pool grouped by meal type
 * dayTargets: meal targets from allocateMealTargets()
 */
export function checkRecipeCoverage(
  recipesByMealType: Record<string, any[]>,
  dayTargets: { meals: Array<{ meal_type: string; cal_target: number }> },
  options: CoverageOptions | number = {}
): CoverageCheckResult {
  // Older callers passed plan_days as a bare number
  const opts: CoverageOptions = typeof options === 'number' ? { planDays: options } : options
  const planDays    = Math.max(1, opts.planDays ?? 7)
  const neededDepth = Math.max(1, Math.ceil(planDays / 2))

  const slots: SlotCoverage[] = dayTargets.meals.map(function(mealTarget) {
    const mt      = mealTarget.meal_type
    const isSnack = mt === 'snack'
    const filter  = opts.slotFilters?.[mt]
    const pool    = (recipesByMealType[mt] || []).filter((r: any) => !filter || filter(r))

    const maxMult = isSnack ? MAX_SNACK_PORTION_MULTIPLIER : MAX_PORTION_MULTIPLIER
    const carbCap = isSnack ? GLUCOSE_CARB_CAP_SNACK : GLUCOSE_CARB_CAP_MAIN
    const reach = (r: any) => {
      const kcal  = r.calories_kcal || 0
      const carbs = r.carbs_g || 0
      let mult = maxMult
      if (opts.glucoseSensitive && carbs > 0) mult = Math.min(mult, Math.max(1, carbCap / carbs))
      return kcal * mult
    }
    const reaches = pool.map(reach).sort((x, y) => y - x)
    // Nth best, or the weakest one if the pool is smaller than N
    const depthReach = reaches.length > 0 ? reaches[Math.min(neededDepth, reaches.length) - 1] : 0
    const maxAchievable = Math.round(depthReach)
    const coveragePct   = mealTarget.cal_target > 0
      ? Math.round(maxAchievable / mealTarget.cal_target * 100)
      : 100

    const status: SlotCoverage['status'] =
      coveragePct >= COVERAGE.ok * 100         ? 'ok' :
      coveragePct >= COVERAGE.borderline * 100 ? 'borderline' :
      'gap'

    return {
      meal_type:          mt,
      cal_target:         mealTarget.cal_target,
      max_achievable_cal: maxAchievable,
      coverage_pct:       coveragePct,
      recipe_count:       pool.length,
      status,
    }
  })

  // Overall coverage: weighted by each slot's calorie share of daily total
  const totalTarget = dayTargets.meals.reduce((s, m) => s + m.cal_target, 0)
  const weightedCoverage = totalTarget > 0
    ? slots.reduce(function(s, slot) {
        const weight = slot.cal_target / totalTarget
        const slotCoverage = Math.min(slot.coverage_pct / 100, 1.0)
        return s + slotCoverage * weight
      }, 0)
    : 1

  const overallPct    = Math.round(weightedCoverage * 100)
  const canGenerate   = slots.every(s => s.status !== 'gap')
  const gapSlots      = slots.filter(s => s.status === 'gap')
  const borderlineSlots = slots.filter(s => s.status === 'borderline')

  let summary: string
  if (canGenerate && gapSlots.length === 0 && borderlineSlots.length === 0) {
    summary = `Recipe pool covers ${overallPct}% of calorie target - generation proceeding.`
  } else if (!canGenerate) {
    const gapDetails = gapSlots.map(s =>
      `${s.meal_type} (target ${s.cal_target} kcal, max achievable ${s.max_achievable_cal} kcal, ${s.coverage_pct}% coverage, ${s.recipe_count} recipes)`
    ).join('; ')
    summary = `Content gap detected - recipe pool cannot reach calorie targets for: ${gapDetails}. Add more high-calorie recipes for these meal types.`
  } else {
    const borderlineDetails = borderlineSlots.map(s =>
      `${s.meal_type} (${s.coverage_pct}% coverage)`
    ).join(', ')
    summary = `Recipe pool covers ${overallPct}% of calorie target. Borderline slots: ${borderlineDetails}. Generation proceeding but plan may fall short.`
  }

  return { can_generate: canGenerate, overall_coverage_pct: overallPct, slots, summary }
}

// ── Day/week validation (runs AFTER generation) ───────────────────────────────

function validateMacro(
  target: number,
  planned: number,
  key: keyof typeof THRESHOLDS
): MacroValidationItem {
  const gap_pct = target > 0
    ? Math.round(Math.abs(planned - target) / target * 100)
    : 0
  return {
    target,
    planned: Math.round(planned),
    gap_pct,
    pass: gap_pct <= THRESHOLDS[key].pass,
  }
}

export function validateDay(
  dayKey: string,
  meals: any[],
  targets: {
    total_kcal: number
    total_protein_g: number
    total_carbs_g: number
    total_fat_g: number
  }
): DayValidation {
  const planned = meals.reduce(function(acc, m) {
    const mt = m.meal_total || m
    return {
      calories: acc.calories + (mt.calories || 0),
      protein:  acc.protein  + (mt.protein_g || 0),
      carbs:    acc.carbs    + (mt.carbs_g || 0),
      fat:      acc.fat      + (mt.fat_g || 0),
    }
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 })

  // Protein: only penalise undershoot (excess protein is acceptable)
  // Calories: penalise both over and under
  // Carbs/fat: penalise both directions
  const proteinGapPct = targets.total_protein_g > 0
    ? Math.round(Math.max(0, targets.total_protein_g - planned.protein) / targets.total_protein_g * 100)
    : 0

  const mv = {
    calories: validateMacro(targets.total_kcal,      planned.calories, 'calories'),
    protein:  {
      target:   targets.total_protein_g,
      planned:  Math.round(planned.protein),
      gap_pct:  proteinGapPct,
      pass:     proteinGapPct <= THRESHOLDS.protein.pass,
    },
    carbs:    validateMacro(targets.total_carbs_g,   planned.carbs,    'carbs'),
    fat:      validateMacro(targets.total_fat_g,     planned.fat,      'fat'),
  }

  const allPass = Object.values(mv).every(v => v.pass)
  // Only calorie gap triggers red -- protein/carb/fat overshoot is not clinically harmful
  // Protein excess is acceptable; only a large calorie deviation warrants plan rejection
  const anyRed  = mv.calories.gap_pct > THRESHOLDS.calories.amber

  const status: 'on_target' | 'amber' | 'red' = allPass ? 'on_target' : anyRed ? 'red' : 'amber'

  const failedMacros = Object.entries(mv)
    .filter(([, v]) => !v.pass)
    .map(([k, v]) => `${k}: ${v.planned} vs target ${v.target} (${v.gap_pct}% off)`)

  return {
    day_key: dayKey,
    status,
    macro_validation: mv,
    message: status === 'on_target'
      ? 'On target'
      : status === 'red'
        ? `Plan rejected - ${failedMacros.join('; ')}`
        : `Calorie gap: ${mv.calories.gap_pct}% ${planned.calories < targets.total_kcal ? 'under' : 'over'}`,
    can_save: status !== 'red',
  }
}

export function validateWeek(
  weeklyPlan: Record<string, any>,
  dayTargets: { total_kcal: number; total_protein_g: number; total_carbs_g: number; total_fat_g: number }
): WeekValidation {
  const days: DayValidation[] = []
  const failedDays: string[] = []

  for (const [dayKey, dayData] of Object.entries(weeklyPlan)) {
    const validation = validateDay(dayKey, dayData.meals || [], dayTargets)
    days.push(validation)
    if (!validation.can_save) {
      failedDays.push(`${dayKey}: ${validation.message}`)
    }
  }

  const valid          = failedDays.length === 0
  const onTargetCount  = days.filter(d => d.status === 'on_target').length
  const amberCount     = days.filter(d => d.status === 'amber').length
  const redCount       = days.filter(d => d.status === 'red').length

  return {
    valid,
    days,
    failed_days: failedDays,
    summary: valid
      ? `${onTargetCount} days on target, ${amberCount} amber`
      : `${redCount} day(s) failed validation - plan rejected`,
  }
}

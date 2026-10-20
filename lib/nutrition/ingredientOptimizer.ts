// src/lib/nutrition/ingredientOptimizer.ts
//
// Four deterministic layers — no AI, no clinical logic, no medical decisions:
//
//   1. calculateIngredientNutrition(ingredientId, grams)
//      → exact nutrition for a single ingredient at a given weight
//
//   2. calculateRecipeNutrition(ingredients)
//      → summed nutrition for a list of {ingredient_id, quantity_grams}
//
//   3. auditRecipeNutrition(recipe)
//      → compares stored recipe nutrition against calculated values,
//        flags discrepancies above threshold
//
//   4. optimizeIngredients(ingredients, mealTarget, constraints)
//      → finds portion multipliers that minimize a weighted nutrition
//        error across all macros simultaneously
//
// Clinical logic (GERD, CKD, diabetes, hypertension) stays in clinicalFilters.ts.
// Meal timing stays in mealTargets.ts.
// Plan validation stays in planValidator.ts.

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface IngredientNutrition {
  ingredient_id: number
  food_name: string
  quantity_grams: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
}

export interface RecipeNutrition {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  ingredients: IngredientNutrition[]
}

export interface NutritionVariance {
  calories_pct: number
  protein_pct: number
  carbs_pct: number
  fat_pct: number
  fiber_pct: number
}

export interface RecipeAuditResult {
  recipe_id: string
  recipe_name: string
  stored: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }
  calculated: RecipeNutrition
  variance: NutritionVariance
  status: 'PASS' | 'REVIEW' | 'FAIL'
  issues: string[]
}

export interface MealNutritionTarget {
  cal_target: number
  protein_target: number
  carbs_target: number
  fat_target: number
  fiber_target?: number
  cal_tolerance_pct?: number
  protein_tolerance_pct?: number
}

export interface OptimizationConstraint {
  ingredient_id: number
  min_grams: number
  max_grams: number
  base_grams: number  // starting portion before optimization
}

export interface OptimizationResult {
  ingredients: Array<{ ingredient_id: number; food_name: string; quantity_grams: number }>
  nutrition: RecipeNutrition
  score: number       // lower is better — weighted multi-objective error
  converged: boolean  // false if optimizer hit max iterations without convergence
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit thresholds
// ─────────────────────────────────────────────────────────────────────────────

const AUDIT_THRESHOLDS = {
  PASS:   5,   // < 5% variance on all macros → PASS
  REVIEW: 15,  // 5-15% variance → REVIEW
  FAIL:   15,  // > 15% variance on any macro → FAIL
}

// Weighted scoring for optimization
// Protein weighted highest — hardest to hit with Indian food
// Fiber weighted lowest — most flexible
const OPTIMIZATION_WEIGHTS = {
  calories: 1.0,
  protein:  1.5,
  carbs:    0.75,
  fat:      0.75,
  fiber:    0.5,
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1: calculateIngredientNutrition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate exact nutrition for a single ingredient at a given weight.
 * ingredientRow is a row from the ingredients table (values per 100g).
 */
export function calculateIngredientNutrition(
  ingredientRow: {
    id: number
    food_name: string
    energy_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  },
  quantity_grams: number
): IngredientNutrition {
  const factor = quantity_grams / 100

  return {
    ingredient_id: ingredientRow.id,
    food_name:     ingredientRow.food_name,
    quantity_grams,
    calories:  round2(ingredientRow.energy_kcal * factor),
    protein_g: round2(ingredientRow.protein_g   * factor),
    carbs_g:   round2(ingredientRow.carbs_g     * factor),
    fat_g:     round2(ingredientRow.fat_g       * factor),
    fiber_g:   round2(ingredientRow.fiber_g     * factor),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: calculateRecipeNutrition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sum nutrition across all ingredients in a recipe.
 * ingredientRows: map of ingredient_id → ingredient table row
 * recipeIngredients: the ingredients jsonb array from the recipes table
 */
export function calculateRecipeNutrition(
  recipeIngredients: Array<{ ingredient_id: number; quantity_grams: number }>,
  ingredientRows: Record<number, {
    id: number
    food_name: string
    energy_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }>
): RecipeNutrition {
  let calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0, fiber_g = 0
  const ingredients: IngredientNutrition[] = []
  const missing: number[] = []

  for (const item of recipeIngredients) {
    const row = ingredientRows[item.ingredient_id]
    if (!row) {
      missing.push(item.ingredient_id)
      continue
    }

    const n = calculateIngredientNutrition(row, item.quantity_grams)
    ingredients.push(n)
    calories  += n.calories
    protein_g += n.protein_g
    carbs_g   += n.carbs_g
    fat_g     += n.fat_g
    fiber_g   += n.fiber_g
  }

  if (missing.length > 0) {
    console.warn(`calculateRecipeNutrition: missing ingredient IDs [${missing.join(', ')}] — nutrition will be understated`)
  }

  return {
    calories:  round2(calories),
    protein_g: round2(protein_g),
    carbs_g:   round2(carbs_g),
    fat_g:     round2(fat_g),
    fiber_g:   round2(fiber_g),
    ingredients,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3: auditRecipeNutrition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare stored recipe nutrition against calculated values.
 * Flags discrepancies above threshold so composition errors are visible.
 */
export function auditRecipeNutrition(
  recipe: {
    recipe_id: string
    recipe_name: string
    calories_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
    ingredients: Array<{ ingredient_id: number; quantity_grams: number }>
  },
  ingredientRows: Record<number, {
    id: number
    food_name: string
    energy_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }>
): RecipeAuditResult {
  const calculated = calculateRecipeNutrition(recipe.ingredients, ingredientRows)
  const issues: string[] = []

  const variance: NutritionVariance = {
    calories_pct: pctDiff(recipe.calories_kcal, calculated.calories),
    protein_pct:  pctDiff(recipe.protein_g,     calculated.protein_g),
    carbs_pct:    pctDiff(recipe.carbs_g,        calculated.carbs_g),
    fat_pct:      pctDiff(recipe.fat_g,          calculated.fat_g),
    fiber_pct:    pctDiff(recipe.fiber_g,        calculated.fiber_g),
  }

  // Flag high-variance macros
  const highVariance: string[] = []
  if (Math.abs(variance.calories_pct) > AUDIT_THRESHOLDS.REVIEW) {
    highVariance.push(`calories ${variance.calories_pct > 0 ? '+' : ''}${variance.calories_pct.toFixed(1)}%`)
  }
  if (Math.abs(variance.protein_pct) > AUDIT_THRESHOLDS.REVIEW) {
    highVariance.push(`protein ${variance.protein_pct > 0 ? '+' : ''}${variance.protein_pct.toFixed(1)}%`)
  }
  if (Math.abs(variance.carbs_pct) > AUDIT_THRESHOLDS.REVIEW) {
    highVariance.push(`carbs ${variance.carbs_pct > 0 ? '+' : ''}${variance.carbs_pct.toFixed(1)}%`)
  }
  if (highVariance.length > 0) {
    issues.push(`Stored vs calculated variance: ${highVariance.join(', ')} — check ingredient quantities or stored values`)
  }

  // Flag missing ingredients
  const knownIds = new Set(Object.keys(ingredientRows).map(Number))
  const missing = recipe.ingredients
    .filter(i => !knownIds.has(i.ingredient_id))
    .map(i => i.ingredient_id)
  if (missing.length > 0) {
    issues.push(`Missing ingredient IDs in lookup: [${missing.join(', ')}] — nutrition understated`)
  }

  // Macro-derived calorie check (4-4-9 rule)
  const macroDerivedCal = (calculated.protein_g * 4) + (calculated.carbs_g * 4) + (calculated.fat_g * 9)
  const macroDiff = Math.abs(macroDerivedCal - calculated.calories)
  if (macroDiff > calculated.calories * 0.10) {
    issues.push(`4-4-9 macro check: macro-derived ${macroDerivedCal.toFixed(0)} kcal vs calculated ${calculated.calories} kcal (${(macroDiff / calculated.calories * 100).toFixed(1)}% diff) — possible fiber or alcohol in calculation`)
  }

  // Determine status
  const maxVariance = Math.max(
    Math.abs(variance.calories_pct),
    Math.abs(variance.protein_pct),
    Math.abs(variance.carbs_pct),
  )
  const status: 'PASS' | 'REVIEW' | 'FAIL' =
    issues.length === 0 && maxVariance <= AUDIT_THRESHOLDS.PASS ? 'PASS' :
    maxVariance > AUDIT_THRESHOLDS.FAIL || missing.length > 0   ? 'FAIL' :
    'REVIEW'

  return {
    recipe_id:   recipe.recipe_id,
    recipe_name: recipe.recipe_name,
    stored: {
      calories:  recipe.calories_kcal,
      protein_g: recipe.protein_g,
      carbs_g:   recipe.carbs_g,
      fat_g:     recipe.fat_g,
      fiber_g:   recipe.fiber_g,
    },
    calculated,
    variance,
    status,
    issues,
  }
}

/**
 * Audit a batch of recipes and return summary.
 */
export function auditAllRecipes(
  recipes: Array<{
    recipe_id: string
    recipe_name: string
    calories_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
    ingredients: Array<{ ingredient_id: number; quantity_grams: number }>
  }>,
  ingredientRows: Record<number, {
    id: number
    food_name: string
    energy_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }>
): {
  results: RecipeAuditResult[]
  summary: { pass: number; review: number; fail: number; total: number }
} {
  const results = recipes.map(r => auditRecipeNutrition(r, ingredientRows))
  const pass   = results.filter(r => r.status === 'PASS').length
  const review = results.filter(r => r.status === 'REVIEW').length
  const fail   = results.filter(r => r.status === 'FAIL').length

  return {
    results,
    summary: { pass, review, fail, total: recipes.length },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 4: optimizeIngredients
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find portion multipliers for a set of ingredients that minimize
 * weighted multi-objective nutrition error against a meal target.
 *
 * Uses coordinate descent — iterates over each ingredient and finds
 * the multiplier that most improves the overall score.
 *
 * This replaces the old fixed-portion approach where calorie gap
 * was the only optimization signal.
 */
export function optimizeIngredients(
  constraints: OptimizationConstraint[],
  target: MealNutritionTarget,
  ingredientRows: Record<number, {
    id: number
    food_name: string
    energy_kcal: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
  }>
): OptimizationResult {
  const MAX_ITERATIONS = 50
  const STEP_SIZES = [0.25, 0.1, 0.05]  // coarse to fine

  // Start at base quantities
  let quantities = constraints.map(c => c.base_grams)

  let bestScore = Infinity
  let converged = false

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const prevScore = bestScore
    const stepSize = STEP_SIZES[Math.min(Math.floor(iter / 15), STEP_SIZES.length - 1)]

    for (let i = 0; i < constraints.length; i++) {
      const c = constraints[i]
      const row = ingredientRows[c.ingredient_id]
      if (!row) continue

      // Try increasing and decreasing this ingredient
      const candidates = [
        quantities[i],
        Math.min(c.max_grams, quantities[i] * (1 + stepSize)),
        Math.max(c.min_grams, quantities[i] * (1 - stepSize)),
      ]

      let bestLocal = quantities[i]
      let bestLocalScore = scoreQuantities(quantities, constraints, ingredientRows, target)

      for (const q of candidates) {
        const trial = [...quantities]
        trial[i] = q
        const s = scoreQuantities(trial, constraints, ingredientRows, target)
        if (s < bestLocalScore) {
          bestLocalScore = s
          bestLocal = q
        }
      }

      quantities[i] = bestLocal
      bestScore = bestLocalScore
    }

    // Check convergence
    if (Math.abs(prevScore - bestScore) < 0.001) {
      converged = true
      break
    }
  }

  // Build final result
  const finalIngredients = constraints.map((c, i) => ({
    ingredient_id: c.ingredient_id,
    food_name: ingredientRows[c.ingredient_id]?.food_name || `Ingredient ${c.ingredient_id}`,
    quantity_grams: Math.round(quantities[i]),
  }))

  const nutrition = calculateRecipeNutrition(
    finalIngredients.map(i => ({ ingredient_id: i.ingredient_id, quantity_grams: i.quantity_grams })),
    ingredientRows
  )

  return {
    ingredients: finalIngredients,
    nutrition,
    score: bestScore,
    converged,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreQuantities(
  quantities: number[],
  constraints: OptimizationConstraint[],
  ingredientRows: Record<number, any>,
  target: MealNutritionTarget
): number {
  // Calculate nutrition for these quantities
  let calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0

  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i]
    const row = ingredientRows[c.ingredient_id]
    if (!row) continue
    const factor = quantities[i] / 100
    calories += row.energy_kcal * factor
    protein  += row.protein_g   * factor
    carbs    += row.carbs_g     * factor
    fat      += row.fat_g       * factor
    fiber    += (row.fiber_g || 0) * factor
  }

  // Normalized errors (0.0–1.0+)
  const calErr  = target.cal_target     > 0 ? Math.abs(calories - target.cal_target)     / target.cal_target     : 0
  const protErr = target.protein_target > 0 ? Math.abs(protein  - target.protein_target) / target.protein_target : 0
  const carbErr = target.carbs_target   > 0 ? Math.abs(carbs    - target.carbs_target)   / target.carbs_target   : 0
  const fatErr  = target.fat_target     > 0 ? Math.abs(fat      - target.fat_target)     / target.fat_target     : 0
  const fibErr  = target.fiber_target && target.fiber_target > 0
    ? Math.abs(fiber - target.fiber_target) / target.fiber_target
    : 0

  // Weighted multi-objective score
  const nutritionScore =
    calErr  * OPTIMIZATION_WEIGHTS.calories +
    protErr * OPTIMIZATION_WEIGHTS.protein  +
    carbErr * OPTIMIZATION_WEIGHTS.carbs    +
    fatErr  * OPTIMIZATION_WEIGHTS.fat      +
    fibErr  * OPTIMIZATION_WEIGHTS.fiber

  // Portion penalty — discourages unrealistic quantities
  let portionPenalty = 0
  for (let i = 0; i < constraints.length; i++) {
    const c = constraints[i]
    if (quantities[i] > c.max_grams) portionPenalty += 0.1 * (quantities[i] - c.max_grams) / c.max_grams
    if (quantities[i] < c.min_grams) portionPenalty += 0.1 * (c.min_grams - quantities[i]) / c.min_grams
  }

  return nutritionScore + portionPenalty
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function pctDiff(stored: number, calculated: number): number {
  if (calculated === 0) return stored === 0 ? 0 : 100
  return round2(((stored - calculated) / calculated) * 100)
}

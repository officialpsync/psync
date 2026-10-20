// src/lib/nutrition/clinicalFilters.ts
// Deterministic clinical food filters — derived from medical conditions.
// These are factual constraints, not AI decisions.
// AI may explain these rules to clients in plain language, but cannot override them.

export interface ClinicalFilters {
  requireLowGI: boolean        // Type 2 Diabetes, Pre-Diabetes, PCOS, Insulin Resistance
  requireLowSodium: boolean    // Hypertension
  requireGerdSafe: boolean     // GERD
  requireHeartburnSafe: boolean // Heartburn gut symptom — shifts calories from dinner to lunch
  requireHighFiber: boolean    // IBS, Constipation, NAFLD
  excludeHighFat: boolean      // NAFLD, High Cholesterol
  vegetarianOnly: boolean      // derived from diet_type
  veganOnly: boolean
  avoidGluten: boolean         // Celiac (future)
  excludeSpicy: boolean        // spice_tolerance = none or mild
  maxPrepMinutes: number       // max_prep_time_minutes from client profile
  excludedIngredientIds: number[] // dislikes + intolerance-derived exclusions
  avoidBloatingTriggers: boolean  // bloating symptom flag
}

export interface FoodsToAvoidRule {
  category: string
  reason: string
  examples: string[]
}

// Conditions that trigger low-GI filter
const LOW_GI_CONDITIONS = [
  'Type 2 Diabetes',
  'Pre-Diabetes',
  'PCOS',
  'Insulin Resistance',
  'Prediabetes',
]

// Conditions that trigger GERD-safe filter
const GERD_CONDITIONS = ['GERD', 'Acid Reflux', 'GORD']

// Conditions that trigger low-sodium filter
const LOW_SODIUM_CONDITIONS = ['Hypertension', 'High Blood Pressure']

// Conditions that benefit from high fiber
const HIGH_FIBER_CONDITIONS = ['IBS', 'Constipation', 'NAFLD', 'Fatty Liver']

// Conditions that warrant limiting high-fat foods
const EXCLUDE_HIGH_FAT_CONDITIONS = ['NAFLD', 'Fatty Liver', 'High Cholesterol', 'Dyslipidemia']

// Ingredient IDs to exclude for lactose intolerance (verified against the
// ingredients table 29 Sep 2026). 16 is Tofu firm, NOT dairy: it was on this
// list by mistake and removed tofu for every lactose-intolerant client.
// 15 = Paneer, 17 = Low fat curd, 18 = Full fat curd, 19 = Skimmed milk,
// 20 = Full fat milk, 21 = Whey protein powder, 22 = Cottage cheese low fat,
// 100 = Buttermilk low fat, 99 = Greek yogurt / hung curd (added 6 Oct 2026,
// it is dairy and is now used for curd breakfasts)
const LACTOSE_INGREDIENT_IDS = [15, 17, 18, 19, 20, 21, 22, 99, 100]

// Ingredient IDs known to cause bloating (verified 29 Sep 2026).
// 51 = Cauliflower, 52 = Broccoli, 59 = Peas green cooked,
// 153 = Roasted chana (same legume family as chole).
// 68 was listed as cabbage but is Almond; there is no cabbage in the table.
const BLOATING_INGREDIENT_IDS = [51, 52, 59, 153]

// Recipe mode also drops the legumes ingredient mode excludes for bloating:
// 40 = Rajma, 41 = Chole, 155 = Sprouted moong
const BLOATING_RECIPE_IDS = [...BLOATING_INGREDIENT_IDS, 40, 41, 155]

// Jain diet (6 Oct 2026): no root vegetables, no sprouts. Verified IDs:
// 46 = Onion, 47 = Garlic, 136 = Garlic raw, 34 = Potato cooked,
// 33 = Sweet potato cooked, 133 = Sweet potato raw, 53 = Carrot,
// 119 = Beetroot raw, 155 = Sprouted moong. No radish in the table.
// Also drops recipe-mode recipes containing any of these (most curries use
// onion/garlic), so Jain clients should use Simple Food Items mode.
const JAIN_EXCLUDED_IDS = [46, 47, 136, 34, 33, 133, 53, 119, 155]

// Gut symptoms that indicate heartburn / reflux
const HEARTBURN_SYMPTOMS = ['heartburn', 'acid reflux', 'reflux', 'gerd']

// Normalise condition strings so 'pcos', 'PCOS', 'type_2_diabetes' and
// 'Type 2 Diabetes' all match (5 Oct 2026: mixed formats in the DB meant
// some clients silently got no clinical rules).
const norm = (s: string) =>
  s.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

export function buildClinicalFilters(
  conditions: string[],
  dietType?: string,
  spiceTolerance?: string,
  maxPrepMinutes?: number,
  intolerances?: string[],
  dislikedIngredientIds?: number[],
  symptoms?: string[]
): ClinicalFilters {
  const excludedIds: number[] = [...(dislikedIngredientIds || [])]

  // Lactose intolerance — exclude all dairy ingredient IDs
  const intoleranceList = (intolerances || []).map((i: string) => i.toLowerCase())
  if (intoleranceList.some(i => i.includes('lactose'))) {
    excludedIds.push(...LACTOSE_INGREDIENT_IDS)
  }

  // Jain: root vegetables and sprouts
  const diet = norm(dietType || '').replace(/ /g, '_')
  if (diet === 'jain') {
    excludedIds.push(...JAIN_EXCLUDED_IDS)
  }

  const symptomList = (symptoms || []).map((s: string) => s.toLowerCase())

  const condSet = (conditions || []).map(norm)
  const has = (list: string[]) => list.some(x => condSet.includes(norm(x)))

  return {
    requireLowGI:            has(LOW_GI_CONDITIONS),
    requireLowSodium:        has(LOW_SODIUM_CONDITIONS),
    requireGerdSafe:         has(GERD_CONDITIONS),
    requireHeartburnSafe:    symptomList.some(s => HEARTBURN_SYMPTOMS.some(h => s.includes(h))),
    requireHighFiber:        has(HIGH_FIBER_CONDITIONS),
    excludeHighFat:          has(EXCLUDE_HIGH_FAT_CONDITIONS),
    vegetarianOnly:          ['vegetarian', 'vegan', 'jain'].includes(diet),
    veganOnly:               diet === 'vegan',
    avoidGluten:             has(['Celiac Disease']),
    excludeSpicy:            ['none', 'mild'].includes(spiceTolerance || 'moderate'),
    maxPrepMinutes:          maxPrepMinutes || 60,
    excludedIngredientIds:   [...new Set(excludedIds)],
    avoidBloatingTriggers:   symptomList.some(s => s.includes('bloat')),
  }
}

// Deterministic "foods to avoid" rules — NOT AI-generated
// These are shown to clients as factual clinical guidance
export function buildFoodsToAvoidRules(
  conditions: string[],
  filters: ClinicalFilters
): FoodsToAvoidRule[] {
  const rules: FoodsToAvoidRule[] = []

  if (filters.requireLowGI) {
    rules.push({
      category: 'High-GI foods',
      reason: 'Rapid glucose spike — incompatible with blood sugar management',
      examples: ['White bread', 'Maida products', 'Sugary drinks', 'White rice in large portions', 'Processed cereals'],
    })
  }

  if (filters.requireLowSodium) {
    rules.push({
      category: 'High-sodium foods',
      reason: 'Sodium restriction for blood pressure management',
      examples: ['Pickles (achar)', 'Papad', 'Processed snacks', 'Canned foods', 'Salted nuts'],
    })
  }

  if (filters.requireGerdSafe) {
    rules.push({
      category: 'GERD trigger foods',
      reason: 'Known acid reflux triggers — individual tolerance varies',
      examples: ['Spicy foods', 'Citrus fruits and juices', 'Fried foods', 'Caffeine', 'Chocolate', 'Mint', 'Carbonated drinks'],
    })
  }

  if (filters.excludeHighFat) {
    rules.push({
      category: 'High saturated fat foods',
      reason: 'Saturated fat restriction for liver/cholesterol management',
      examples: ['Cream', 'Butter in excess', 'Fried foods', 'Fatty red meat', 'Full-fat processed snacks'],
    })
  }

  if (filters.excludedIngredientIds.some(id => LACTOSE_INGREDIENT_IDS.includes(id))) {
    rules.push({
      category: 'Dairy products',
      reason: 'Lactose intolerance — avoid milk-based foods',
      examples: ['Milk', 'Paneer', 'Curd / dahi', 'Whey protein', 'Cream', 'Butter'],
    })
  }

  if (JAIN_EXCLUDED_IDS.every(id => filters.excludedIngredientIds.includes(id))) {
    rules.push({
      category: 'Jain restrictions',
      reason: 'No root vegetables or sprouts, as per Jain dietary practice',
      examples: ['Onion', 'Garlic', 'Potato', 'Sweet potato', 'Carrot', 'Beetroot', 'Sprouts'],
    })
  }

  if (filters.avoidBloatingTriggers) {
    rules.push({
      category: 'Gas-forming vegetables',
      reason: 'Known bloating triggers — replaced with low-fermentation alternatives',
      examples: ['Cauliflower', 'Broccoli', 'Cabbage', 'Onion in excess', 'Rajma in excess'],
    })
  }

  return rules
}

// Apply clinical filters to a Supabase recipe query
export function applyRecipeFilters(
  query: any,
  filters: ClinicalFilters
): any {
  if (filters.requireLowGI)     query = query.eq('is_low_gi', true)
  if (filters.requireLowSodium) query = query.eq('is_low_sodium', true)
  if (filters.requireGerdSafe)  query = query.eq('is_gerd_safe', true)
  if (filters.maxPrepMinutes < 60) query = query.lte('prep_time_minutes', filters.maxPrepMinutes)
  return query
}

// Post-fetch filter: remove spicy recipes for low spice tolerance clients
// Cannot be done at DB query level as it requires checking ingredients JSON
export function passesSpiceFilter(
  recipe: any,
  filters: ClinicalFilters
): boolean {
  if (!filters.excludeSpicy) return true
  // ingredient id 49 = green chilli, id 74 = red chilli powder
  const SPICY_INGREDIENT_IDS = [49, 74]
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  return !ingredients.some((ing: any) => SPICY_INGREDIENT_IDS.includes(ing.ingredient_id))
}

// Post-fetch filter: remove recipes containing excluded ingredients
// Covers dislikes and intolerance-derived exclusions (lactose etc.)
export function passesExclusionFilter(
  recipe: any,
  filters: ClinicalFilters
): boolean {
  if (filters.excludedIngredientIds.length === 0) return true
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  return !ingredients.some((ing: any) =>
    filters.excludedIngredientIds.includes(ing.ingredient_id)
  )
}

// Post-fetch filter: gut symptoms (29 Sep 2026). Brings recipe mode in line
// with ingredient mode, which already drops these foods for bloating.
export function passesSymptomFilter(
  recipe: any,
  filters: ClinicalFilters
): boolean {
  if (!filters.avoidBloatingTriggers) return true
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  return !ingredients.some((ing: any) => BLOATING_RECIPE_IDS.includes(ing.ingredient_id))
}

// Apply clinical filters to food portions (ingredient mode)
export function passesIngredientFilters(
  portion: any,
  filters: ClinicalFilters
): boolean {
  if (filters.requireLowGI     && !portion.is_low_gi)    return false
  if (filters.requireLowSodium && !portion.is_low_sodium) return false
  if (filters.requireGerdSafe  && !portion.is_gerd_safe)  return false
  if (filters.excludedIngredientIds.includes(portion.id)) return false
  if (filters.avoidBloatingTriggers && BLOATING_INGREDIENT_IDS.includes(portion.id)) return false
  return true
}

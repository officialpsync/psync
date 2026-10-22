// lib/nutrition/recipeMath.ts
// Pure helpers shared by the AI route (server) and the recipe form (browser):
// ingredient groups, name matching, and per-serving macros.
// Ingredient nutrition values are per 100 g, raw.

export interface IngredientRow {
  id: number
  food_name: string
  common_name: string | null
  category: string | null
  energy_kcal: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  org_id?: string | null
  is_active?: boolean | null
  is_low_gi?: boolean | null
  is_low_sodium?: boolean | null
  is_gerd_safe?: boolean | null
  notes?: string | null
}

/** One line of a recipe. Grams are for the whole batch. */
export interface RecipeLine {
  ingredient_id: number | null
  ingredient_name: string
  quantity_grams: number
  is_optional: boolean
}

// ── Groups: clean filters over the built-in categories, which overlap ──────
export const INGREDIENT_GROUPS = [
  { key: "vegetable", label: "Vegetables" },
  { key: "fruit",     label: "Fruits" },
  { key: "protein",   label: "Protein" },
  { key: "dairy",     label: "Dairy & eggs" },
  { key: "grain",     label: "Grains & carbs" },
  { key: "legume",    label: "Legumes & dals" },
  { key: "nut",       label: "Nuts & seeds" },
  { key: "fat",       label: "Fats & oils" },
  { key: "spice",     label: "Spices & herbs" },
  { key: "other",     label: "Other" },
] as const
export type IngredientGroup = typeof INGREDIENT_GROUPS[number]["key"]

const CATEGORY_TO_GROUP: Record<string, IngredientGroup> = {
  vegetable: "vegetable",
  fruit: "fruit", "fruit-dried": "fruit",
  protein: "protein",
  dairy: "dairy", egg: "dairy",
  carb: "grain", grain: "grain", cereals: "grain", millet: "grain",
  legume: "legume", pulses: "legume",
  nut: "nut", nuts_seeds: "nut", seed: "nut",
  fat: "fat",
  spice: "spice", "spice-seed": "spice", herb: "spice", "souring-agent": "spice",
}

export function ingredientGroup(category: string | null | undefined): IngredientGroup {
  return CATEGORY_TO_GROUP[(category ?? "").toLowerCase().trim()] ?? "other"
}

export function groupLabel(key: IngredientGroup): string {
  return INGREDIENT_GROUPS.find((g) => g.key === key)?.label ?? "Other"
}

// ── Name matching ────────────────────────────────────────────────────────────
/** Lowercase, strip accents/punctuation/non-Latin script, collapse spaces. */
export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Finds the catalog ingredient for a free-text name. Exact match on the name or
 * common name first, then a whole-word containment either way. Returns null when
 * unsure rather than guessing wrong — a wrong match silently corrupts macros.
 */
export function matchIngredient(name: string, catalog: IngredientRow[]): IngredientRow | null {
  const n = normalizeName(name)
  if (n.length < 2) return null
  // Try the name as given, then a simple singular ("eggs" -> "egg", "tomatoes" -> "tomato")
  const variants = [n]
  if (n.endsWith("es") && n.length > 4) variants.push(n.slice(0, -2))
  if (n.endsWith("s") && n.length > 3) variants.push(n.slice(0, -1))

  for (const v of variants) {
    // 1. Exact food name
    const byName = catalog.filter((i) => normalizeName(i.food_name) === v)
    if (byName.length === 1) return byName[0]
    // 2. Exact common name, only if unambiguous ("Murgh" is breast, thigh, leg and whole: no match)
    const byCommon = catalog.filter((i) => normalizeName(i.common_name) === v)
    if (byCommon.length === 1) return byCommon[0]
    if (byName.length > 1 || byCommon.length > 1) return null
    // 3. Whole-word containment either way, only if unambiguous
    const words = (s: string) => ` ${s} `
    const candidates = catalog.filter((i) => {
      const a = normalizeName(i.food_name)
      return a.length >= 3 && (words(v).includes(words(a)) || words(a).includes(words(v)))
    })
    if (candidates.length === 1) return candidates[0]
    if (candidates.length > 1) return null
  }
  return null
}

// ── Macros ───────────────────────────────────────────────────────────────────
export interface MacroTotals {
  kcal: number; protein: number; carbs: number; fat: number; fiber: number
  matched: number; unmatched: number
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Per-serving macros from the batch lines. Unmatched lines are counted, not guessed. */
export function perServing(lines: RecipeLine[], byId: Map<number, IngredientRow>, servings: number): MacroTotals {
  const s = Math.max(1, Math.round(servings) || 1)
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, matched: 0, unmatched: 0 }
  for (const line of lines) {
    const ing = line.ingredient_id != null ? byId.get(line.ingredient_id) : undefined
    if (!ing) { t.unmatched++; continue }
    const f = (Number(line.quantity_grams) || 0) / 100
    t.kcal += (Number(ing.energy_kcal) || 0) * f
    t.protein += (Number(ing.protein_g) || 0) * f
    t.carbs += (Number(ing.carbs_g) || 0) * f
    t.fat += (Number(ing.fat_g) || 0) * f
    t.fiber += (Number(ing.fiber_g) || 0) * f
    t.matched++
  }
  return {
    kcal: Math.round(t.kcal / s),
    protein: round1(t.protein / s), carbs: round1(t.carbs / s),
    fat: round1(t.fat / s), fiber: round1(t.fiber / s),
    matched: t.matched, unmatched: t.unmatched,
  }
}

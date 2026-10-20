// src/lib/nutrition/ingredientMealBuilder.ts
// Builds home-style Indian meals from raw ingredients to hit macro targets.
// IDs verified against actual DB on 17 Sep 2026.
// 25 Sep 2026: portions are now snapped to real household units (whole eggs,
// whole rotis, ½ katori, ¼ cup) and macros are computed from the snapped grams,
// so natural_quantity and quantity_grams always agree.

import type { MealTarget } from './mealTargets'

export interface FoodItem {
  ingredient_id: number
  food_name: string
  quantity_grams: number
  natural_quantity: string
  role: 'protein' | 'carb' | 'vegetable' | 'fat' | 'fruit' | 'dairy'
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

export interface IngredientMealAlternate {
  meal_label: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  food_items: FoodItem[]
}

export interface IngredientMeal {
  meal_type: string
  time: string
  recipe_id: null
  recipe_name: null
  meal_label: string
  display_mode: 'ingredient_based'
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  cal_target: number   // slot target this meal was built against (plan page review)
  food_items: FoodItem[]
  alternates: IngredientMealAlternate[]
}

export interface WeekProteinTracker {
  lastUsedOnDay: Record<string, Record<string | number, number>>  // '__idx' keys hold carb/veg rotation
}

// ── Verified IDs ──────────────────────────────────────────────────────────────
const ID_EGG_WHOLE  = 5
const ID_EGG_WHITE  = 6
const ID_CURD_LOWFAT  = 17
const ID_CURD_FULLFAT = 18
const ID_CHICKEN_BREAST = 1
const ID_MUTTON         = 14
const ID_PRAWNS         = 13
const ID_ROHU           = 8
const ID_CATLA          = 9
const ID_PANEER       = 15
// Plant protein (6 Oct 2026): tofu was in the DB but in no pool; soya chunks
// added as ID 159 (cooked weight, 17g protein / 100g).
const ID_TOFU         = 16
const ID_SOYA_CHUNKS  = 159
// Hung curd (6 Oct 2026): ID 99 'Greek yogurt, plain, low fat' = strained dahi.
// 13.6g protein per 100 kcal vs 5.2g for regular curd. Used for curd breakfasts.
const ID_HUNG_CURD    = 99
const ID_MOONG_DAL    = 37
const ID_MASOOR_DAL   = 38
const ID_TOOR_DAL     = 36
const ID_RAJMA        = 40
const ID_CHOLE        = 41
const ID_CHANA_DAL    = 39
const ID_ROASTED_CHANA  = 153
const ID_MAKHANA        = 151
const ID_SPROUTED_MOONG = 155
const ID_ROTI         = 26
const ID_RICE_WHITE   = 23
const ID_RICE_BROWN   = 24
const ID_RICE_BASMATI = 25
const ID_OATS         = 29
const ID_POHA         = 30
const ID_GHEE = 61
const ID_MURMURA = 152   // puffed rice, for murmura bhel snack (1 Oct 2026)

// Glucose-sensitive per-meal carb cap for breakfast/lunch/dinner (29 Sep 2026).
// Same 90g as recipe mode. Legume "proteins" (rajma, sabut moong) carry their
// own carbs, and the carb portion was sized on calories alone, so lunches
// reached 129-131g.
const GLUCOSE_MEAL_CARB_CAP = 85
// Per-meal cap scales with the slot (5 Oct 2026): 45% of the slot's calories
// from carbs, never below 85g. A flat 85g starved big slots (an 858 kcal
// vegetarian diabetic lunch stalled at ~550 kcal). Small slots are unchanged.
const glucoseCapFor = (slotKcal: number) =>
  Math.max(GLUCOSE_MEAL_CARB_CAP, Math.round((slotKcal || 0) * 0.45 / 4))
const ID_BANANA = 35
const ID_APPLE  = 77

// ── Protein group sets — for same-day group blocking ─────────────────────────
// Dal group: used for swap options and alternate variety (no longer blocks a
// second, different dal on the same day)
const ID_MOONG_WHOLE = 42   // sabut moong cooked
const DAL_IDS = new Set([ID_TOOR_DAL, ID_MOONG_DAL, ID_MASOOR_DAL, ID_CHANA_DAL, ID_MOONG_WHOLE])
// Egg group: egg whole and egg white count as same group
const EGG_IDS = new Set([ID_EGG_WHOLE, ID_EGG_WHITE])
// Expensive group: prawns and mutton should not both appear on same day
const EXPENSIVE_IDS = new Set([ID_PRAWNS, ID_MUTTON])
// Fish group: rohu and catla count as same group — no double fish in one day
const FISH_IDS = new Set([ID_ROHU, ID_CATLA])
// Budget rule (25 Sep 2026): max ONE meat/fish meal per day. The other main
// meal gets dal, egg or another budget protein.
const PREMIUM_IDS = new Set([ID_CHICKEN_BREAST, ID_ROHU, ID_CATLA, ID_MUTTON, ID_PRAWNS])

// ── Bloating trigger veg IDs ──────────────────────────────────────────────────
// 51 cauliflower, 52 broccoli, 59 peas. 68 removed 29 Sep 2026: it is Almond, not cabbage.
const BLOATING_VEG_IDS = new Set([51, 52, 59])

// ── Per-protein weekly caps ───────────────────────────────────────────────────
// Prawns: 0 in standard mode — treat day only (isTreatDay overrides)
// Mutton: 1 max — weekend feel
// Chicken + fish: 2 each — common but not daily
const PROTEIN_WEEK_CAPS: Record<number, number> = {
  [ID_CHICKEN_BREAST]: 2,
  [ID_ROHU]:           2,
  [ID_CATLA]:          2,
  [ID_PRAWNS]:         0,  // treat day only in standard plans
  [ID_MUTTON]:         1,
}

// Proteins needing minimum 3-day gap (not 2)
const PROTEIN_LONG_GAP = new Set([ID_PRAWNS, ID_MUTTON])
// Dals and legumes at lunch/dinner also get a 3-day gap (28 Sep 2026).
// With a 2-day gap, toor and moong simply alternated (toor, moong, toor, moong)
// and rajma/chole were never reached. A 3-day gap lets them rotate in.
const LEGUME_IDS = new Set([ID_TOOR_DAL, ID_MOONG_DAL, ID_MASOOR_DAL, ID_CHANA_DAL, ID_RAJMA, ID_CHOLE, ID_MOONG_WHOLE])

// ── Protein pools ─────────────────────────────────────────────────────────────
const BREAKFAST_PROTEINS: Record<string, number[]> = {
  // Eggs are the default breakfast protein for egg-eaters (25 Sep 2026).
  // Dal-roti is available as a swap alternate but not the primary choice —
  // most clients cannot cook dal before leaving for work at 8:30 AM.
  // Egg white removed for non-veg (25 Sep 2026): whole eggs only.
  non_vegetarian: [ID_EGG_WHOLE, ID_MOONG_DAL, ID_TOOR_DAL,
                   ID_PANEER, ID_CURD_LOWFAT],
  vegetarian:     [ID_PANEER, ID_CURD_LOWFAT, ID_TOFU, ID_MOONG_DAL, ID_TOOR_DAL,
                   ID_MASOOR_DAL, ID_CHOLE],
  eggetarian:     [ID_EGG_WHOLE, ID_EGG_WHITE, ID_MOONG_DAL, ID_TOOR_DAL,
                   ID_PANEER, ID_CURD_LOWFAT],
  // Roasted chana removed from vegan breakfast (1 Oct 2026): it is a snack, and
  // "Roasted Chana aur Roti" is not a real breakfast.
  vegan:          [ID_TOFU, ID_MOONG_DAL, ID_MASOOR_DAL, ID_TOOR_DAL, ID_SPROUTED_MOONG,
                   ID_CHOLE],
  // Jain (6 Oct 2026): vegetarian pool. Root vegetables and sprouts are
  // excluded upstream in clinicalFilters (JAIN_EXCLUDED_IDS). Before this key
  // existed, Jain clients fell back to the non-veg pool (chicken, fish, eggs).
  jain:           [ID_PANEER, ID_CURD_LOWFAT, ID_TOFU, ID_MOONG_DAL, ID_TOOR_DAL,
                   ID_MASOOR_DAL, ID_CHOLE],
}

const LUNCH_DINNER_PROTEINS: Record<string, number[]> = {
  // Priority order for non-veg lunch/dinner:
  // chicken (2x cap) → fish (2x cap) → dal/legumes (fill remaining slots)
  // → mutton (1x, treat-feel) → egg (last resort, breakfast protein)
  // → prawns (treat day only, 0 cap standard)
  // This ensures eggs only appear at lunch/dinner when chicken+fish are both capped/on cooldown
  // Simple shopping list (25 Sep 2026): one fish (rohu), two dals (toor, moong).
  // Catla stays available on treat days via TREAT_PREFERRED.
  // Paneer added for non-veg (28 Sep 2026): capped at 1 per slot per week, so it
  // breaks up the dal dinners on chicken/fish lunch days without taking over.
  // Egg moved up (28 Sep 2026): dinner option on chicken/fish lunch days.
  // Moong whole added: sabut moong aur roti is a distinct dinner from moong dal.
  non_vegetarian: [ID_CHICKEN_BREAST, ID_ROHU, ID_PANEER, ID_TOOR_DAL, ID_MOONG_DAL,
                   ID_RAJMA, ID_CHOLE, ID_MOONG_WHOLE, ID_EGG_WHOLE,
                   ID_CATLA, ID_MUTTON, ID_PRAWNS],
  // Soya chunks and tofu (6 Oct 2026): the densest plant proteins available
  // (soya 14.7g protein per 100 kcal, tofu 9.9g, paneer 6.2g, dal ~6g).
  vegetarian:     [ID_TOOR_DAL, ID_MOONG_DAL, ID_PANEER, ID_SOYA_CHUNKS, ID_MASOOR_DAL,
                   ID_RAJMA, ID_CHOLE, ID_TOFU, ID_CHANA_DAL],
  eggetarian:     [ID_EGG_WHOLE, ID_TOOR_DAL, ID_MOONG_DAL, ID_PANEER, ID_SOYA_CHUNKS,
                   ID_RAJMA, ID_CHOLE, ID_EGG_WHITE],
  vegan:          [ID_TOOR_DAL, ID_SOYA_CHUNKS, ID_MOONG_DAL, ID_TOFU, ID_MASOOR_DAL, ID_RAJMA,
                   ID_CHOLE, ID_SPROUTED_MOONG],
  jain:           [ID_TOOR_DAL, ID_MOONG_DAL, ID_PANEER, ID_SOYA_CHUNKS, ID_MASOOR_DAL,
                   ID_RAJMA, ID_CHOLE, ID_TOFU, ID_CHANA_DAL],
}

// Nuts and buttermilk added 29 Sep 2026 so clients with curd/chana restrictions
// still see snack variety. Nut portions are realistic small handfuls.
const ID_ALMOND     = 68
const ID_PEANUT     = 69
const ID_CASHEW     = 67
const ID_WALNUT     = 97
const ID_BUTTERMILK = 100

const NUT_SNACK_G: Record<number, number> = {
  [68]: 20, [69]: 25, [67]: 20, [97]: 20,
  [151]: 30, // makhana: self-contained, no fruit; 30g ≈ 23g carbs, under 35g cap
}
// Nut snack portions scale to the slot target (30 Sep 2026). NUT_SNACK_G is the
// minimum; these are the most a person would eat as one snack. Makhana max is
// 40g for glucose-sensitive clients (about 31g carbs, under the 35g snack cap).
const NUT_SNACK_MAX_G: Record<number, number> = {
  [68]: 30, [69]: 35, [67]: 30, [97]: 30, [151]: 50,
}

const SNACK_PROTEINS: Record<string, number[]> = {
  non_vegetarian: [ID_ROASTED_CHANA, ID_CURD_LOWFAT, ID_ALMOND, ID_PEANUT,
                   ID_CASHEW, ID_EGG_WHOLE, ID_MAKHANA, ID_WALNUT,
                   ID_SPROUTED_MOONG, ID_BUTTERMILK, ID_MURMURA],
  vegetarian:     [ID_ROASTED_CHANA, ID_CURD_LOWFAT, ID_ALMOND, ID_PEANUT,
                   ID_CASHEW, ID_MAKHANA, ID_PANEER, ID_WALNUT,
                   ID_SPROUTED_MOONG, ID_BUTTERMILK, ID_MURMURA],
  eggetarian:     [ID_ROASTED_CHANA, ID_CURD_LOWFAT, ID_ALMOND, ID_PEANUT,
                   ID_CASHEW, ID_EGG_WHOLE, ID_MAKHANA, ID_WALNUT,
                   ID_SPROUTED_MOONG, ID_BUTTERMILK, ID_MURMURA],
  vegan:          [ID_ROASTED_CHANA, ID_ALMOND, ID_PEANUT, ID_CASHEW,
                   ID_MAKHANA, ID_WALNUT, ID_SPROUTED_MOONG, ID_MURMURA],
  // Jain: vegetarian snacks without sprouted moong (sprouts are avoided)
  jain:           [ID_ROASTED_CHANA, ID_CURD_LOWFAT, ID_ALMOND, ID_PEANUT,
                   ID_CASHEW, ID_MAKHANA, ID_PANEER, ID_WALNUT,
                   ID_BUTTERMILK, ID_MURMURA],
}

const TREAT_PREFERRED: Record<string, number[]> = {
  non_vegetarian: [ID_MUTTON, ID_PRAWNS, ID_CATLA, ID_ROHU, ID_CHICKEN_BREAST],
  vegetarian:     [ID_PANEER, ID_CHOLE, ID_RAJMA],
  eggetarian:     [ID_EGG_WHOLE, ID_PANEER, ID_CHOLE],
  vegan:          [ID_CHOLE, ID_RAJMA],
  jain:           [ID_PANEER, ID_CHOLE, ID_RAJMA],
}

// ── Carb pools ────────────────────────────────────────────────────────────────
// Roti and poha only (oats dropped 25 Sep 2026: one more item to buy for 1–2 meals a week)
const BREAKFAST_CARBS = [ID_ROTI, ID_POHA]
// One rice type per plan (basmati). Rotating white/brown/basmati meant buying 3 rices.
const LUNCH_CARBS     = [ID_RICE_BASMATI, ID_ROTI]
const DINNER_CARBS    = [ID_ROTI, ID_RICE_BASMATI, ID_ROTI]

// ── Vegetable pool ────────────────────────────────────────────────────────────
// Five everyday vegetables so the weekly shopping list stays short (25 Sep 2026):
// lauki, palak, gajar, capsicum, kheera
const VEG_OPTIONS = [55, 44, 53, 50, 54]
const ID_CUCUMBER = 54
const ID_PEAS     = 59
const VEG_PORTION_G  = 150  // raw weight per lunch/dinner (was 80g)
const PEAS_PORTION_G = 80   // peas are starchy, keep smaller

// ── Snack extras ──────────────────────────────────────────────────────────────
const SNACK_EXTRAS = [ID_BANANA, ID_APPLE, ID_BANANA, ID_APPLE, ID_BANANA]

// ── Household units ───────────────────────────────────────────────────────────
// Grams per household unit. Check these once with a kitchen scale and adjust
// here only. Every label and every gram value is derived from this table.
const U = {
  EGG_WHOLE:      50,   // 1 large egg, edible part
  EGG_WHITE:      33,   // white of 1 large egg
  ROTI:           40,   // 1 medium whole wheat roti
  KATORI:         150,  // 1 katori (150 ml) cooked rice / dal / curd / sabzi
  OATS_CUP:       80,   // 1 cup rolled oats, dry
  POHA_CUP:       60,   // 1 cup thick poha, dry
  MAKHANA_CUP:    15,   // 1 cup makhana
  SPROUTS_KATORI: 100,  // 1 katori sprouted moong
  FISH_PIECE:     80,   // 1 curry-cut piece rohu/catla, raw
  BANANA:         100,  // 1 medium banana, peeled
  APPLE:          180,  // 1 medium apple
  CUCUMBER:       150,  // 1 medium cucumber
  GHEE_TSP:       5,
  MURMURA_CUP:    15,   // 1 cup murmura
  CHAACH_GLASS:   200,  // 1 glass chaach (200 ml)
}

const RICE_NAMES: Record<number, string> = {
  [ID_RICE_BASMATI]: 'basmati rice',
  [ID_RICE_BROWN]:   'brown rice',
  [ID_RICE_WHITE]:   'rice',
}
const PULSE_NAMES: Record<number, string> = {
  [ID_TOOR_DAL]:   'toor dal',
  [ID_MOONG_DAL]:  'moong dal',
  [ID_MASOOR_DAL]: 'masoor dal',
  [ID_CHANA_DAL]:  'chana dal',
  [ID_RAJMA]:      'rajma',
  [ID_CHOLE]:      'chole',
  [ID_MOONG_WHOLE]: 'sabut moong',  // 1 Oct 2026: was printing "225g Moong whole"
}
const VEG_NAMES: Record<number, string> = {
  44: 'palak', 50: 'capsicum', 51: 'gobhi', 52: 'broccoli', 53: 'gajar',
  54: 'kheera', 55: 'lauki', 56: 'turai', 57: 'karela', 58: 'drumstick', 59: 'matar',
}

interface Portion { grams: number; label: string }

// Snap grams to the nearest step of a unit (never below one step)
function snap(grams: number, unitG: number, step: number) {
  const units = Math.max(step, Math.round(grams / unitG / step) * step)
  return { units, grams: Math.round(units * unitG) }
}
const snapG = (grams: number, to: number) => Math.max(to, Math.round(grams / to) * to)

// 1.5 → "1½", 0.75 → "¾"
function fmt(n: number): string {
  const whole = Math.floor(n + 1e-9)
  const q = Math.round((n - whole) * 4)
  const frac = q === 1 ? '¼' : q === 2 ? '½' : q === 3 ? '¾' : ''
  if (whole === 0) return frac || '0'
  return `${whole}${frac}`
}
const pl = (n: number, one: string, many: string) => (n > 1 ? many : one)

// Returns the snapped grams AND the label for those exact grams.
// Callers must use portion.grams for macros, never the unsnapped value.
function toPortion(id: number, grams: number, name: string): Portion {
  if (id === ID_EGG_WHOLE) {
    const p = snap(grams, U.EGG_WHOLE, 1)
    return { grams: p.grams, label: `${p.units} whole ${pl(p.units, 'egg', 'eggs')}` }
  }
  if (id === ID_EGG_WHITE) {
    const p = snap(grams, U.EGG_WHITE, 1)
    return { grams: p.grams, label: `${p.units} egg ${pl(p.units, 'white', 'whites')}` }
  }
  if (id === ID_ROTI) {
    const p = snap(grams, U.ROTI, 1)
    return { grams: p.grams, label: `${p.units} ${pl(p.units, 'roti', 'rotis')}` }
  }
  if (id === ID_OATS) {
    const p = snap(grams, U.OATS_CUP, 0.25)
    return { grams: p.grams, label: `${fmt(p.units)} ${pl(p.units, 'cup', 'cups')} oats (dry)` }
  }
  if (id === ID_POHA) {
    const p = snap(grams, U.POHA_CUP, 0.25)
    return { grams: p.grams, label: `${fmt(p.units)} ${pl(p.units, 'cup', 'cups')} poha (dry)` }
  }
  if (RICE_NAMES[id]) {
    const p = snap(grams, U.KATORI, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} katori cooked ${RICE_NAMES[id]}` }
  }
  if (PULSE_NAMES[id]) {
    const p = snap(grams, U.KATORI, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} katori ${PULSE_NAMES[id]} (cooked)` }
  }
  if (id === ID_CURD_LOWFAT || id === ID_CURD_FULLFAT) {
    const p = snap(grams, U.KATORI, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} katori curd` }
  }
  if (id === ID_HUNG_CURD) {
    const p = snap(grams, U.KATORI, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} katori hung curd (strained dahi)` }
  }
  if (id === ID_PANEER) {
    const g = snapG(grams, 10)
    return { grams: g, label: `${g}g paneer` }
  }
  if (id === ID_TOFU) {
    const g = snapG(grams, 10)
    return { grams: g, label: `${g}g tofu` }
  }
  if (id === ID_SOYA_CHUNKS) {
    const p = snap(grams, U.KATORI, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} katori soya chunks (cooked)` }
  }
  if (id === ID_CHICKEN_BREAST) {
    const g = snapG(grams, 10)
    return { grams: g, label: `${g}g boneless chicken (raw)` }
  }
  if (id === ID_MUTTON) {
    const g = snapG(grams, 10)
    return { grams: g, label: `${g}g mutton (raw)` }
  }
  if (id === ID_ROHU || id === ID_CATLA) {
    const p = snap(grams, U.FISH_PIECE, 1)
    const fish = id === ID_ROHU ? 'rohu' : 'catla'
    return { grams: p.grams, label: `${p.units} ${pl(p.units, 'piece', 'pieces')} ${fish} (${p.grams}g raw)` }
  }
  if (id === ID_PRAWNS) {
    const g = snapG(grams, 10)
    return { grams: g, label: `${g}g prawns (raw, about ${Math.round(g / 12)} medium)` }
  }
  if (id === ID_ROASTED_CHANA) {
    const g = snapG(grams, 5)
    const size = g <= 20 ? 'a small handful' : g <= 35 ? 'a handful' : 'a big handful'
    return { grams: g, label: `${g}g roasted chana (${size})` }
  }
  if (id === ID_MAKHANA) {
    const p = snap(grams, U.MAKHANA_CUP, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} ${pl(p.units, 'cup', 'cups')} makhana` }
  }
  if (id === ID_SPROUTED_MOONG) {
    const p = snap(grams, U.SPROUTS_KATORI, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} katori sprouted moong` }
  }
  if (id === ID_BUTTERMILK) {
    const p = snap(grams, U.CHAACH_GLASS, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} ${pl(p.units, 'glass', 'glasses')} chaach` }
  }
  if (id === ID_MURMURA) {
    const p = snap(grams, U.MURMURA_CUP, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} ${pl(p.units, 'cup', 'cups')} murmura` }
  }
  if (id === ID_ALMOND || id === ID_CASHEW || id === ID_WALNUT || id === ID_PEANUT) {
    const g = snapG(grams, 5)
    const nut = id === ID_ALMOND ? 'almonds' : id === ID_CASHEW ? 'cashews' : id === ID_WALNUT ? 'walnuts' : 'roasted peanuts'
    return { grams: g, label: `${g}g ${nut}` }
  }
  if (id === ID_BANANA) {
    const p = snap(grams, U.BANANA, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} banana` }
  }
  if (id === ID_APPLE) {
    // Always a whole apple — half an apple is not a real snack portion
    const p = snap(grams, U.APPLE, 1)
    return { grams: p.grams, label: `${p.units} ${p.units === 1 ? 'apple' : 'apples'}` }
  }
  if (id === ID_GHEE) {
    const p = snap(grams, U.GHEE_TSP, 1)
    return { grams: p.grams, label: `${p.units} tsp ghee (for cooking)` }
  }
  if (id === ID_CUCUMBER) {
    const p = snap(grams, U.CUCUMBER, 0.5)
    return { grams: p.grams, label: `${fmt(p.units)} kheera, as salad` }
  }
  if (VEG_NAMES[id]) {
    const g = snapG(grams, 10)
    return { grams: g, label: `${VEG_NAMES[id]} sabzi (${g}g raw)` }
  }
  const g = Math.round(grams)
  return { grams: g, label: `${g}g ${name}` }
}

function makeItem(ing: any, id: number, grams: number, role: FoodItem['role']): FoodItem {
  const p = toPortion(id, grams, ing.food_name)
  return {
    ingredient_id:    id,
    food_name:        ing.food_name,
    quantity_grams:   p.grams,
    natural_quantity: p.label,
    role,
    ...calcMacros(ing, p.grams),
  }
}

// ── Egg breakfast style (28 Sep 2026) ─────────────────────────────────────────
// Eggs every breakfast is deliberate (simple routine, short grocery list), so
// variety comes from how the eggs are cooked, not new foods. Rotates by day:
// bhurji, boiled, omelette. Nutrition and shopping list are unchanged; only the
// meal label and the egg's quantity text change.
const EGG_STYLES = ['bhurji', 'boiled', 'omelette'] as const
const EGG_STYLE_TEXT: Record<string, string> = {
  bhurji: 'as bhurji', boiled: 'boiled', omelette: 'as omelette',
}
const EGG_STYLE_LABEL: Record<string, Record<string, string>> = {
  roti: { bhurji: 'Anda Bhurji aur Roti', boiled: 'Boiled Anda aur Roti', omelette: 'Omelette aur Roti' },
  poha: { bhurji: 'Poha aur Anda Bhurji', boiled: 'Anda Poha',            omelette: 'Poha aur Omelette' },
}

// Returns a styled label and updates the egg's quantity text, or null if the
// meal is not an egg + roti/poha breakfast.
function styleEggBreakfast(items: FoodItem[], mt: string, day: number): string | null {
  if (mt !== 'breakfast') return null
  const eggIdx = items.findIndex(i => i.ingredient_id === ID_EGG_WHOLE && i.role === 'protein')
  if (eggIdx < 0) return null
  const carb = items.find(i => i.role === 'carb')
  const carbKey = carb?.ingredient_id === ID_ROTI ? 'roti' : carb?.ingredient_id === ID_POHA ? 'poha' : null
  if (!carbKey) return null
  const style = EGG_STYLES[((day - 1) % EGG_STYLES.length + EGG_STYLES.length) % EGG_STYLES.length]
  const egg = items[eggIdx]
  if (!egg.natural_quantity.includes(',')) {
    items[eggIdx] = { ...egg, natural_quantity: `${egg.natural_quantity}, ${EGG_STYLE_TEXT[style]}` }
  }
  return EGG_STYLE_LABEL[carbKey][style]
}

// Short names for the item paired with chaach in a snack
const SNACK_SIDE_NAMES: Record<number, string> = {
  [ID_MAKHANA]: 'Makhana', [ID_PEANUT]: 'Moongphali', [ID_ALMOND]: 'Badam',
  [ID_ROASTED_CHANA]: 'Roasted Chana',
}

// ── Meal label ────────────────────────────────────────────────────────────────
function buildMealLabel(items: FoodItem[], mt: string): string {
  const protein = items.find(i => i.role === 'protein' || i.role === 'dairy') ?? items[0]
  const carb    = items.find(i => i.role === 'carb')
  const pid     = protein?.ingredient_id ?? 0
  const cid     = carb?.ingredient_id    ?? 0

  const pLabel =
    pid === ID_EGG_WHOLE                          ? 'Anda' :
    pid === ID_EGG_WHITE                          ? 'Egg White' :
    pid === ID_CHICKEN_BREAST                     ? 'Chicken' :
    pid === ID_MUTTON                             ? 'Mutton' :
    pid === ID_PANEER                             ? 'Paneer' :
    pid === ID_TOFU                               ? 'Tofu' :
    pid === ID_SOYA_CHUNKS                        ? 'Soya Chunks' :
    pid === ID_PRAWNS                             ? 'Jhinga' :
    pid === ID_ROHU || pid === ID_CATLA           ? 'Machli' :
    pid === ID_CURD_LOWFAT || pid === ID_CURD_FULLFAT || pid === ID_HUNG_CURD ? 'Dahi' :
    pid === ID_MOONG_WHOLE                        ? 'Sabut Moong' :
    pid === ID_MOONG_DAL                          ? 'Moong Dal' :
    pid === ID_TOOR_DAL                           ? 'Toor Dal' :
    pid === ID_MASOOR_DAL                         ? 'Masoor Dal' :
    pid === ID_CHANA_DAL                          ? 'Chana Dal' :
    pid === ID_RAJMA                              ? 'Rajma' :
    pid === ID_CHOLE                              ? 'Chole' :
    pid === ID_ROASTED_CHANA                      ? 'Roasted Chana' :
    pid === ID_MAKHANA                            ? 'Makhana' :
    pid === ID_SPROUTED_MOONG                     ? 'Sprouted Moong' :
    protein?.food_name?.split(' ')[0] ?? ''

  const cLabel =
    cid === ID_ROTI                                   ? 'Roti' :
    cid === ID_RICE_BASMATI || cid === ID_RICE_WHITE  ? 'Chawal' :
    cid === ID_RICE_BROWN                             ? 'Brown Rice' :
    cid === ID_OATS                                   ? 'Oats Bowl' :
    cid === ID_POHA                                   ? 'Poha' : ''

  // Breakfast labels (1 Oct 2026): every pool protein x carb combination has an
  // explicit label. Old fallbacks produced "Dahi aur Fruit" (no fruit in it),
  // "Egg White aur Roti" and "Chole Poha".
  if (mt === 'breakfast') {
    const withRoti = cid === ID_ROTI
    const withPoha = cid === ID_POHA
    if (pid === ID_EGG_WHOLE)  return withRoti ? 'Anda aur Roti' : withPoha ? 'Anda Poha' : 'Anda Nashta'
    if (pid === ID_EGG_WHITE)  return withRoti ? 'Egg White Bhurji aur Roti' : withPoha ? 'Egg White aur Poha' : 'Egg White Bhurji'
    if (pid === ID_PANEER)     return withRoti ? 'Paneer Bhurji aur Roti' : 'Paneer Bhurji'
    if (pid === ID_TOFU)       return withRoti ? 'Tofu Bhurji aur Roti' : 'Tofu Bhurji'
    if (pid === ID_CURD_LOWFAT || pid === ID_CURD_FULLFAT || pid === ID_HUNG_CURD)
                               return withRoti ? 'Dahi aur Roti' : withPoha ? 'Dahi Poha' : 'Dahi Bowl'
    if (pid === ID_SPROUTED_MOONG) return withPoha ? 'Sprouts Poha' : withRoti ? 'Sprouts Chaat aur Roti' : 'Sprouts Chaat'
    if (DAL_IDS.has(pid) || pid === ID_CHOLE || pid === ID_RAJMA)
                               return withRoti ? `${pLabel} aur Roti` : pLabel
    return [pLabel, cLabel].filter(Boolean).join(' aur ') || 'Ghar ka Nashta'
  }
  // Snack labels are matched on ingredient ID, not food_name (1 Oct 2026).
  // Matching 'Peanut roasted' / 'Buttermilk, low fat' against the first word of
  // food_name never fired, so clients saw "Peanut Snack" and "Buttermilk, Snack".
  if (mt === 'snack') {
    const has = (id: number) => items.some(i => i.ingredient_id === id)
    if (pid === ID_BUTTERMILK) {
      const side = items.find(i => i.ingredient_id !== ID_BUTTERMILK)
      const sideName = side ? SNACK_SIDE_NAMES[side.ingredient_id] : undefined
      return sideName ? `Chaach aur ${sideName}` : 'Chaach'
    }
    if (pid === ID_MURMURA)        return 'Murmura Bhel'
    if (pid === ID_ROASTED_CHANA)  return has(ID_APPLE) || has(ID_BANANA) ? 'Roasted Chana aur Fruit' : 'Roasted Chana'
    if (pid === ID_ALMOND)         return 'Badam Bowl'
    if (pid === ID_PEANUT)         return 'Moongphali Snack'
    if (pid === ID_CASHEW)         return 'Kaju Bowl'
    if (pid === ID_WALNUT)         return 'Akhrot Bowl'
    if (pid === ID_MAKHANA)        return has(ID_ALMOND) ? 'Makhana aur Badam' : 'Makhana Bowl'
    if (pid === ID_CURD_LOWFAT || pid === ID_CURD_FULLFAT)
                                   return has(ID_APPLE) || has(ID_BANANA) ? 'Dahi aur Fruit' : 'Dahi Bowl'
    if (pid === ID_EGG_WHOLE)      return 'Boiled Anda'
    if (pid === ID_SPROUTED_MOONG) return 'Sprouted Moong Chaat'
    if (pid === ID_PANEER)         return 'Paneer Tikka Bites'
    return pLabel ? `${pLabel} Snack` : 'Healthy Snack'
  }
  if (pLabel && cLabel) return `${pLabel} aur ${cLabel}`
  if (pLabel)           return `${pLabel} Thali`
  return 'Ghar ka Khana'
}

// ── Macro helper ──────────────────────────────────────────────────────────────
function calcMacros(ing: any, grams: number) {
  return {
    calories:  Math.round((ing.energy_kcal || 0) * grams / 100),
    protein_g: Math.round((ing.protein_g   || 0) * grams / 100 * 10) / 10,
    carbs_g:   Math.round((ing.carbs_g     || 0) * grams / 100 * 10) / 10,
    fat_g:     Math.round((ing.fat_g       || 0) * grams / 100 * 10) / 10,
  }
}

// ── Build a single meal from a given protein ID ───────────────────────────────
// Extracted so we can call it for the primary meal AND for alternates
function assembleMeal(
  proteinId: number,
  carbId: number,
  vegId: number,
  mt: string,
  calTarget: number,
  currentDay: number,
  ingredientRows: Record<number, any>,
  excluded: Set<number>,
  avoidBloatingTriggers: boolean,
  glucoseSensitive: boolean = false,
  eggSideOk: boolean = false,
  paneerSideMaxG: number = 0,
  tofuSideMaxG: number = 0,
): FoodItem[] | null {
  const mealCarbCap = glucoseCapFor(calTarget)
  const proteinIng = ingredientRows[proteinId]
  if (!proteinIng || !proteinIng.energy_kcal) return null

  const items: FoodItem[] = []

  // Protein
  const protCalShare = mt === 'snack' ? 0.55 : 0.40
  const protGramsRaw = Math.round((calTarget * protCalShare) / (proteinIng.energy_kcal / 100))
  const isEggWhole   = proteinId === ID_EGG_WHOLE

  // Simplified quantities — more realistic home portions
  const protGramsMax =
    mt === 'snack' && NUT_SNACK_G[proteinId]               ? NUT_SNACK_G[proteinId] :
    mt === 'snack'                                         ? 80  :
    mt === 'breakfast' && (proteinId === ID_CURD_LOWFAT || proteinId === ID_CURD_FULLFAT)
                                                           ? 1.5 * U.KATORI : // 1 Oct 2026: curd breakfast was 1 katori + 2 cups poha
    mt === 'breakfast'                                     ? 150 :
    proteinId === ID_CHICKEN_BREAST || proteinId === ID_MUTTON ? 150 : // reduced from 200 → 150g
    proteinId === ID_ROHU || proteinId === ID_CATLA        ? 160 : // reduced from 200 → 160g
    proteinId === ID_PRAWNS                                ? 120 : // reduced from 200 → 120g
    proteinId === ID_PANEER                                ? 100 : // normal home serving; paneer is ~25% fat
    proteinId === ID_SOYA_CHUNKS                           ? 150 : // 1 katori cooked (~45g dry)
    proteinId === ID_TOFU                                  ? 150 :
    isEggWhole                                             ? 165 : // 3 eggs max
                                                             160

  const protRole: FoodItem['role'] =
    mt === 'snack' && (proteinId === ID_CURD_LOWFAT || proteinId === ID_CURD_FULLFAT ||
                       proteinId === ID_BUTTERMILK)                                   ? 'dairy' :
    proteinId === ID_MAKHANA || proteinId === ID_MURMURA                              ? 'carb'  :
    NUT_SNACK_G[proteinId]                                                            ? 'fat'   :
    'protein'

  let protGrams = Math.min(Math.max(protGramsRaw, 40), protGramsMax)

  // Nut snacks: size to ~95% of the slot target in 5g steps, between the base
  // portion and a realistic handful. Fixed portions left snacks at ~68% of target.
  if (mt === 'snack' && NUT_SNACK_G[proteinId]) {
    const minG = NUT_SNACK_G[proteinId]
    const maxG = proteinId === ID_MAKHANA && glucoseSensitive ? 40 : (NUT_SNACK_MAX_G[proteinId] ?? minG)
    const wantG = Math.round(((calTarget * 0.95) / (proteinIng.energy_kcal / 100)) / 5) * 5
    protGrams = Math.min(Math.max(wantG, minG), maxG)
  }

  // Chaach is one glass (1 Oct 2026). The generic 80g snack cap made it ~25 kcal;
  // addSnackExtras pairs it with makhana / peanuts / chana to fill the slot.
  if (mt === 'snack' && proteinId === ID_BUTTERMILK) protGrams = U.CHAACH_GLASS
  // Murmura starts at 2 cups; addSnackExtras adds peanuts + kheera, then resizes.
  if (mt === 'snack' && proteinId === ID_MURMURA) protGrams = 2 * U.MURMURA_CUP

  // Dal main meals get 1½ katori (25 Sep 2026): the dal meal is the lowest-protein
  // main meal of each day, and a fuller bowl is how people naturally eat it.
  // Falls back to 1 katori if 1½ katori + 2 rotis + veg + ghee would pass 115%.
  if (DAL_IDS.has(proteinId) && (mt === 'lunch' || mt === 'dinner')) {
    const bigG     = 1.5 * U.KATORI
    const dalKcal  = proteinIng.energy_kcal * bigG / 100
    const vegIng0  = ingredientRows[vegId]
    const vegKcal  = vegIng0?.energy_kcal
      ? vegIng0.energy_kcal * (vegId === ID_PEAS ? PEAS_PORTION_G : VEG_PORTION_G) / 100 : 0
    const gheeKcal = (ingredientRows[ID_GHEE]?.energy_kcal ?? 900) * U.GHEE_TSP / 100
    const rotiKcal = ingredientRows[ID_ROTI]?.energy_kcal
      ? ingredientRows[ID_ROTI].energy_kcal * 2 * U.ROTI / 100 : 240
    protGrams = (dalKcal + vegKcal + gheeKcal + rotiKcal <= calTarget * 1.15) ? bigG : U.KATORI
  }

  // Curd breakfast uses hung curd (6 Oct 2026): same katori, ~3x the protein.
  // "Dahi aur Roti" / "Dahi Poha" were ~11-15g protein and the main drag on
  // every vegetarian plan. Falls back to regular curd if hung curd is excluded.
  const hungIng = ingredientRows[ID_HUNG_CURD]
  const useHung = mt === 'breakfast' && proteinId === ID_CURD_LOWFAT &&
                  !!hungIng?.energy_kcal && !excluded.has(ID_HUNG_CURD)
  const protItem = useHung
    ? makeItem(hungIng, ID_HUNG_CURD, protGrams, protRole)
    : makeItem(proteinIng, proteinId, protGrams, protRole)
  items.push(protItem)
  let usedCal = protItem.calories

  // Vegetable — built before the carb so the carb fills the real remainder
  let vegItem: FoodItem | null = null
  if (mt === 'lunch' || mt === 'dinner') {
    const vegIng = ingredientRows[vegId]
    if (vegIng && vegIng.energy_kcal) {
      vegItem = makeItem(vegIng, vegId, vegId === ID_PEAS ? PEAS_PORTION_G : VEG_PORTION_G, 'vegetable')
    }
  }

  // Dal + dahi (1 Oct 2026, re-added): dal lunches and dinners get a katori of
  // low-fat curd for non-lactose clients. A dal-roti plate alone is ~12g protein;
  // with curd it is ~20g. Reserved before the carb so the plate stays on target.
  // Skipped if the plate (dal + curd + veg + ghee + 2 rotis) would pass 115%.
  let curdSide: FoodItem | null = null
  if (DAL_IDS.has(proteinId) && (mt === 'lunch' || mt === 'dinner') &&
      !excluded.has(ID_CURD_LOWFAT) && !excluded.has(ID_CURD_FULLFAT)) {
    const curdIng = ingredientRows[ID_CURD_LOWFAT]
    const rotiKcal2 = ingredientRows[ID_ROTI]?.energy_kcal
      ? ingredientRows[ID_ROTI].energy_kcal * 2 * U.ROTI / 100 : 240
    const gheeKcal1 = (ingredientRows[ID_GHEE]?.energy_kcal ?? 900) * U.GHEE_TSP / 100
    if (curdIng?.energy_kcal) {
      const c = makeItem(curdIng, ID_CURD_LOWFAT, U.KATORI, 'dairy')
      const plate = usedCal + c.calories + (vegItem?.calories ?? 0) + gheeKcal1 + rotiKcal2
      if (plate <= calTarget * 1.15) curdSide = c
    }
  }

  // Dal + boiled egg (5 Oct 2026): clients who cannot have curd (lactose) but
  // eat eggs get 1 whole egg as the dal side instead. Without it their dal
  // meals sat at 14-20g protein and the day ran 80-90% of the protein target.
  // Same 115% plate check as curd. Max one egg side per day (the caller passes
  // eggSideOk = false once a side egg has been used), so a 2-egg breakfast
  // tops out at 3 eggs for the day. Uses the curdSide slot so the carb reserve
  // and item order are unchanged.
  // 5 Oct 2026: the egg replaces one roti. On small dinner slots (~400 kcal)
  // dal + 2 rotis already hit 115%, so the egg never fit. With an egg side the
  // plate is checked against 1 roti and the roti minimum drops to 1 (below).
  if (!curdSide && eggSideOk && DAL_IDS.has(proteinId) && (mt === 'lunch' || mt === 'dinner') &&
      !excluded.has(ID_EGG_WHOLE)) {
    const eggIng = ingredientRows[ID_EGG_WHOLE]
    const rotiKcal3 = ingredientRows[ID_ROTI]?.energy_kcal
      ? ingredientRows[ID_ROTI].energy_kcal * U.ROTI / 100 : 120
    const gheeKcal2 = (ingredientRows[ID_GHEE]?.energy_kcal ?? 900) * U.GHEE_TSP / 100
    if (eggIng?.energy_kcal) {
      const e = makeItem(eggIng, ID_EGG_WHOLE, U.EGG_WHOLE, 'protein')
      const plate = usedCal + e.calories + (vegItem?.calories ?? 0) + gheeKcal2 + rotiKcal3
      if (plate <= calTarget * 1.18) curdSide = e
    }
  }

  // Ghee
  let gheeItem: FoodItem | null = null
  if (mt !== 'snack') {
    const gheeIng = ingredientRows[ID_GHEE]
    if (gheeIng && gheeIng.energy_kcal) gheeItem = makeItem(gheeIng, ID_GHEE, 5, 'fat')
  }

  // Carb
  if (mt !== 'snack') {
    const carbIng = ingredientRows[carbId]
    if (carbIng && carbIng.energy_kcal) {
      const reserve       = (vegItem?.calories ?? 0) + (gheeItem?.calories ?? 0) + (curdSide?.calories ?? 0)
      const carbCalTarget = Math.max(0, calTarget - usedCal - reserve)
      const carbGramsRaw  = Math.round(carbCalTarget / (carbIng.energy_kcal / 100))
      const carbGramsMax  =
        carbId === ID_ROTI ? (mt === 'breakfast' ? 3 * U.ROTI : 4 * U.ROTI) : // 3 rotis breakfast, 4 lunch/dinner
        carbId === ID_POHA ? 1.5 * U.POHA_CUP :   // 1 Oct 2026: max 1½ cups dry poha
        carbId === ID_OATS ? U.OATS_CUP :
        300
      const eggSided = curdSide?.ingredient_id === ID_EGG_WHOLE
      const carbMin  = carbId === ID_ROTI && (mt === 'lunch' || mt === 'dinner')
        ? (eggSided ? U.ROTI : 2 * U.ROTI)   // egg side replaces one roti (5 Oct 2026)
        : 40
      const carbItem = makeItem(carbIng, carbId, Math.min(Math.max(carbGramsRaw, carbMin), carbGramsMax), 'carb')
      items.push(carbItem)
      usedCal += carbItem.calories
    }
  }

  if (vegItem)  items.push(vegItem)
  if (curdSide) items.push(curdSide)
  if (gheeItem) items.push(gheeItem)

  const totalCarbs = () => items.reduce((s, i) => s + (i.carbs_g || 0), 0)

  // Glucose-sensitive carb trim (29 Sep 2026): if the plate is over the cap,
  // shrink the rice/roti/poha/oats one household step at a time. Never below
  // ½ katori rice, 1 roti, ¼ cup oats/poha. Calories are then topped up by
  // curd and ghee in the fill step below, never by more carbs.
  if (glucoseSensitive && mt !== 'snack') {
    const cIdx = items.findIndex(i => i.role === 'carb' && i.ingredient_id === carbId)
    const carbIng = ingredientRows[carbId]
    if (cIdx >= 0 && carbIng) {
      const isRice = carbId === ID_RICE_BASMATI || carbId === ID_RICE_WHITE || carbId === ID_RICE_BROWN
      const step =
        carbId === ID_ROTI ? U.ROTI :
        isRice             ? U.KATORI / 2 :
        carbId === ID_OATS ? U.OATS_CUP / 4 :
        carbId === ID_POHA ? U.POHA_CUP / 4 :
        20
      // Side curd is exempt from the cap (same rule as the fill step)
      const capCarbs = () => items.reduce((s, i) => s + (i.role === 'dairy' ? 0 : (i.carbs_g || 0)), 0)
      while (capCarbs() > mealCarbCap && items[cIdx].quantity_grams - step >= step) {
        items[cIdx] = makeItem(carbIng, carbId, items[cIdx].quantity_grams - step, 'carb')
      }
    }
  }

  // Fill step (28 Sep 2026): replaces the rice-only +1 roti rule.
  // Big slots (e.g. a 919 kcal lunch in a 3-meal plan) hit the portion caps
  // (fish 160g, chicken 150g, rice 2 katori, rotis 4) and landed at 77-88%.
  // If a lunch/dinner is under 90% of its slot target, add in this order,
  // never passing 115%:
  //   1. a side katori of curd (protein, slows carbs, good for diabetics)
  //   2. rotis one at a time, up to 4 (rice meals: max 1 roti on the side)
  //   3. a second tsp of ghee
  // Runs for alternates too, so swap options are calorie-matched as well.
  if (mt === 'lunch' || mt === 'dinner') {
    const floor  = calTarget * 0.90
    // Tighter ceiling for small slots (6 Oct 2026): 1.15 on a 380 kcal
    // breakfast = 437 kcal allowed, which compounds to 200+ kcal/day over.
    // Slots under 500 kcal use 1.08; larger slots keep 1.15.
    const ceil   = calTarget < 500 ? calTarget * 1.08 : calTarget * 1.15
    const total  = () => items.reduce((s, i) => s + i.calories, 0)
    const kcalOf = (id: number, g: number) =>
      Math.round((ingredientRows[id]?.energy_kcal || 0) * g / 100)
    const fits   = (add: number) => add > 0 && total() + add <= ceil
    const carbsOf = (id: number, g: number) => (ingredientRows[id]?.carbs_g || 0) * g / 100
    const carbsFit = (id: number, g: number) =>
      !glucoseSensitive || totalCarbs() + carbsOf(id, g) <= mealCarbCap

    // 1. Side katori of curd
    const curdIng = ingredientRows[ID_CURD_LOWFAT]
    const hasCurd = items.some(i => i.ingredient_id === ID_CURD_LOWFAT || i.ingredient_id === ID_CURD_FULLFAT)
    if (total() < floor && !hasCurd && curdIng?.energy_kcal &&
        !excluded.has(ID_CURD_LOWFAT) && !excluded.has(ID_CURD_FULLFAT) &&
        fits(kcalOf(ID_CURD_LOWFAT, U.KATORI))) {
      // Curd is exempt from the carb cap: ~7g carbs a katori, mostly protein and
      // slow-release, the best filler for a diabetic plate.
      items.push(makeItem(curdIng, ID_CURD_LOWFAT, U.KATORI, 'dairy'))
    }

    // 2. Rotis, one at a time
    const rotiIng = ingredientRows[ID_ROTI]
    if (rotiIng?.energy_kcal && !excluded.has(ID_ROTI)) {
      const rotiKcal = kcalOf(ID_ROTI, U.ROTI)
      const hasRice  = items.some(i => i.ingredient_id === ID_RICE_BASMATI ||
                                       i.ingredient_id === ID_RICE_WHITE   ||
                                       i.ingredient_id === ID_RICE_BROWN)
      // Glucose-sensitive clients (T2D, insulin resistance): no roti on top of
      // rice, to keep the per-meal carb load down. Curd and ghee still fill (28 Sep 2026).
      const maxRotiG = hasRice ? (glucoseSensitive ? 0 : U.ROTI) : 4 * U.ROTI
      while (total() < floor && fits(rotiKcal) && carbsFit(ID_ROTI, U.ROTI)) {
        const idx     = items.findIndex(i => i.ingredient_id === ID_ROTI)
        const current = idx >= 0 ? items[idx].quantity_grams : 0
        if (current + U.ROTI > maxRotiG) break
        const next = makeItem(rotiIng, ID_ROTI, current + U.ROTI, 'carb')
        if (idx >= 0) items[idx] = next
        else items.push(next)
      }
    }

    // 2b. Paneer side (5 Oct 2026): a dal/legume lunch or dinner still under
    // 90% after curd and rotis gets 50-100g paneer (dal, roti, paneer sabzi).
    // Adds calories and protein with almost no carbs, so it works under the
    // glucose cap. paneerSideMaxG is 0 for vegans, lactose-free clients and
    // once a side has been used today (set by the caller).
    const panIng = ingredientRows[ID_PANEER]
    const sideBase = LEGUME_IDS.has(proteinId) || proteinId === ID_SOYA_CHUNKS
    if (total() < floor && paneerSideMaxG >= 50 && sideBase &&
        panIng?.energy_kcal && !excluded.has(ID_PANEER) &&
        !items.some(i => i.ingredient_id === ID_PANEER)) {
      const want = (calTarget * 0.95 - total()) / (panIng.energy_kcal / 100)
      let g = Math.max(50, Math.min(paneerSideMaxG, Math.round(want / 10) * 10))
      while (g >= 50 && !fits(kcalOf(ID_PANEER, g))) g -= 10
      if (g >= 50) items.push(makeItem(panIng, ID_PANEER, g, 'protein'))
    }

    // 2c. Tofu side (6 Oct 2026): same idea for clients who can't have the
    // paneer side (vegans, lactose-free vegetarians). Set by the caller.
    const tofuIng = ingredientRows[ID_TOFU]
    if (total() < floor && tofuSideMaxG >= 50 && sideBase &&
        tofuIng?.energy_kcal && !excluded.has(ID_TOFU) &&
        !items.some(i => i.ingredient_id === ID_TOFU || i.ingredient_id === ID_PANEER)) {
      const want = (calTarget * 0.95 - total()) / (tofuIng.energy_kcal / 100)
      let g = Math.max(50, Math.min(tofuSideMaxG, Math.round(want / 10) * 10))
      while (g >= 50 && !fits(kcalOf(ID_TOFU, g))) g -= 10
      if (g >= 50) items.push(makeItem(tofuIng, ID_TOFU, g, 'protein'))
    }

    // 3. Second tsp of ghee
    const gIdx    = items.findIndex(i => i.ingredient_id === ID_GHEE)
    const gheeIng = ingredientRows[ID_GHEE]
    if (total() < floor && gIdx >= 0 && gheeIng?.energy_kcal &&
        items[gIdx].quantity_grams < 2 * U.GHEE_TSP &&
        fits(kcalOf(ID_GHEE, U.GHEE_TSP))) {
      items[gIdx] = makeItem(gheeIng, ID_GHEE, items[gIdx].quantity_grams + U.GHEE_TSP, 'fat')
    }
  }

  // Trim pass (6 Oct 2026): portion rounding and plate minimums (2 rotis at
  // dinner, 50g paneer, rotis rounded up) built 436-497 kcal plates on ~380
  // kcal slots, and the fill-step ceiling never sees those. If a main meal is
  // over its ceiling, step down one household unit at a time, and only when
  // the result lands closer to the slot target:
  //   1. the carb: 1 roti / ½ katori rice / ½ cup poha (never below 1 unit)
  //   2. paneer as the main protein: 10g at a time, not below 40g
  if (mt !== 'snack') {
    const tCeil  = calTarget < 500 ? calTarget * 1.08 : calTarget * 1.15
    const tTotal = () => items.reduce((s, i) => s + i.calories, 0)
    const closer = (oldKcal: number, newKcal: number) =>
      Math.abs(tTotal() - oldKcal + newKcal - calTarget) < Math.abs(tTotal() - calTarget)
    const RICE_TRIM_IDS = new Set([ID_RICE_BASMATI, ID_RICE_WHITE, ID_RICE_BROWN])
    for (let guard = 0; guard < 6 && tTotal() > tCeil; guard++) {
      // 1. Carb
      const cIdx = items.findIndex(i => i.role === 'carb')
      if (cIdx >= 0) {
        const it   = items[cIdx]
        const cid  = it.ingredient_id
        const step = cid === ID_ROTI ? U.ROTI : RICE_TRIM_IDS.has(cid) ? U.KATORI / 2 : cid === ID_POHA ? U.POHA_CUP / 2 : 0
        if (step && it.quantity_grams - step >= step && ingredientRows[cid]?.energy_kcal) {
          const smaller = makeItem(ingredientRows[cid], cid, it.quantity_grams - step, 'carb')
          if (smaller.calories < it.calories && closer(it.calories, smaller.calories)) {
            items[cIdx] = smaller
            continue
          }
        }
      }
      // 2. Paneer main protein
      const pIdx = items.findIndex(i => i.ingredient_id === ID_PANEER && i.role === 'protein')
      if (pIdx === 0 && items[pIdx].quantity_grams - 10 >= 40) {
        const smaller = makeItem(ingredientRows[ID_PANEER], ID_PANEER, items[pIdx].quantity_grams - 10, 'protein')
        if (smaller.calories < items[pIdx].calories) {
          items[pIdx] = smaller
          continue
        }
      }
      break
    }
  }

  return items
}

// ── Core builder ──────────────────────────────────────────────────────────────
export function buildIngredientMeal(
  mealTarget: MealTarget,
  ingredientRows: Record<number, any>,
  dietType: string,
  dayProteinUsed: Set<number>,
  isTreatDay: boolean,
  currentDay: number,
  weekTracker: WeekProteinTracker,
  excludedIngredientIds: number[] = [],
  avoidBloatingTriggers: boolean = false,
  weekProteinCount: Record<string, Record<number, number>> = {},
  weekProteinLimit: number = 3,
  primaryGoal: string = 'fat_loss',
  excludeHighFat: boolean = false,
  requireHeartburnSafe: boolean = false,
  glucoseSensitive: boolean = false,
): IngredientMeal | null {
  const mt        = mealTarget.meal_type
  const calTarget = mealTarget.cal_target
  const diet      = (dietType || 'non_vegetarian').toLowerCase()
  const MIN_GAP      = 2
  const MIN_GAP_LONG = 3

  const excluded = new Set(excludedIngredientIds)
  // Egg side for dal meals (5 Oct 2026): egg-eating clients only, once a day.
  // EGG_SIDE_MARK is a sentinel in dayProteinUsed; it matches no real ID.
  const EGG_SIDE_MARK = -ID_EGG_WHOLE
  const eatsEggs  = ['non_vegetarian', 'eggetarian'].includes(diet.replace(/-/g, '_'))
  const eggSideOk = eatsEggs && !excluded.has(ID_EGG_WHOLE) && !dayProteinUsed.has(EGG_SIDE_MARK)
  // Paneer side for legume meals (5 Oct 2026): not for vegans or lactose-free
  // clients, once a day, smaller if paneer was already the protein today.
  const PANEER_SIDE_MARK = -ID_PANEER
  const paneerSideMaxG =
    diet === 'vegan' || excluded.has(ID_PANEER) || dayProteinUsed.has(PANEER_SIDE_MARK) ? 0 :
    dayProteinUsed.has(ID_PANEER) ? 60 : 100
  // Tofu side (6 Oct 2026): plant-eaters who can't have the paneer side.
  // One protein side per day across both.
  const TOFU_SIDE_MARK = -ID_TOFU
  const plantDiet = ['vegetarian', 'vegan', 'jain', 'eggetarian'].includes(diet)
  const tofuSideMaxG =
    plantDiet && paneerSideMaxG === 0 && !excluded.has(ID_TOFU) &&
    !dayProteinUsed.has(PANEER_SIDE_MARK) && !dayProteinUsed.has(TOFU_SIDE_MARK) &&
    !dayProteinUsed.has(ID_TOFU) ? 100 : 0

  // Runtime condition exclusions
  // Poha is high GI (~82) and was the only high-GI carb still reaching
  // glucose-sensitive clients (6 Oct 2026). Their breakfasts go with roti.
  // Note: passesIngredientFilters (is_low_gi flags) is not used by ingredient
  // mode; the carb cap + targeted exclusions like this one do that job.
  if (glucoseSensitive) excluded.add(ID_POHA)
  if (excludeHighFat) excluded.add(ID_MUTTON)
  // High-fat clients who eat meat have leaner options than paneer
  if (excludeHighFat && diet === 'non_vegetarian') excluded.add(ID_PANEER)
  if (avoidBloatingTriggers) {
    excluded.add(ID_RAJMA)
    excluded.add(ID_CHOLE)
    excluded.add(ID_SPROUTED_MOONG)
    excluded.add(ID_ROASTED_CHANA)   // same legume family as chole
    excluded.add(ID_SOYA_CHUNKS)     // soy is a common bloating trigger (6 Oct 2026)
  }
  // Heartburn: no rice at dinner — a heavy rice meal late at night worsens reflux
  const heartburnDinnerRiceExcluded = requireHeartburnSafe && mt === 'dinner'
  // Mutton and prawns only on treat days (cost). Excluded, not just capped,
  // because the cap is relaxed in the P3 fallback and ignored by alternates.
  if (!isTreatDay) {
    excluded.add(ID_MUTTON)
    excluded.add(ID_PRAWNS)
    excluded.add(ID_CATLA)   // one fish (rohu) on normal days keeps shopping simple
  }

  // Muscle gain: raise fish/chicken caps
  const effectiveCaps: Record<number, number> = { ...PROTEIN_WEEK_CAPS }
  // Non-veg: paneer once per slot per week (vegetarian clients keep the normal limit)
  if (diet === 'non_vegetarian') effectiveCaps[ID_PANEER] = 1
  // Moong whole: treat like a legume, cap at 1 per slot per week for non-veg
  // so it does not crowd out toor dal and rajma
  if (diet === 'non_vegetarian') effectiveCaps[ID_MOONG_WHOLE] = 1
  // Soya chunks and tofu: twice per slot per week (variety, not every day)
  effectiveCaps[ID_SOYA_CHUNKS] = 2
  effectiveCaps[ID_TOFU]        = 2
  if (primaryGoal === 'muscle_gain') {
    effectiveCaps[ID_CHICKEN_BREAST] = 3
    effectiveCaps[ID_ROHU]           = 3
    effectiveCaps[ID_CATLA]          = 3
  }

  // On treat days, allow prawns (cap override)
  if (isTreatDay) {
    effectiveCaps[ID_PRAWNS] = 1
  }

  // Select protein pool
  let pool: number[] =
    mt === 'breakfast' ? (BREAKFAST_PROTEINS[diet]   ?? BREAKFAST_PROTEINS.vegetarian) :
    mt === 'snack'     ? (SNACK_PROTEINS[diet]        ?? SNACK_PROTEINS.vegetarian) :
                         (LUNCH_DINNER_PROTEINS[diet] ?? LUNCH_DINNER_PROTEINS.vegetarian)

  pool = pool.filter(id => !excluded.has(id))
  // Murmura is high-GI: never a snack for glucose-sensitive clients
  if (glucoseSensitive) pool = pool.filter(id => id !== ID_MURMURA)
  if (pool.length === 0) return null

  const mtTracker = weekTracker.lastUsedOnDay[mt] ?? {}

  // Treat day: reorder to prefer treat proteins
  if (isTreatDay && mt !== 'snack') {
    const treat = (TREAT_PREFERRED[diet] ?? []).filter(id => pool.includes(id) && !excluded.has(id))
    const rest  = pool.filter(id => !treat.includes(id))
    pool = [...treat, ...rest]
  }

  // Variety shuffle (28 Sep 2026): with a fixed priority order, every plan came
  // out the same week after week. Shuffle only WITHIN groups of the same kind
  // that sit next to each other in the pool (chicken/fish, legumes), so the
  // priority between groups is unchanged: meat/fish still comes before dal,
  // and all gap, cap and same-day rules still apply. Treat days keep their order.
  if ((mt === 'lunch' || mt === 'dinner') && !isTreatDay) {
    const groupOf = (id: number) =>
      PREMIUM_IDS.has(id) ? 'premium' : LEGUME_IDS.has(id) ? 'legume' : `solo_${id}`
    const shuffled: number[] = []
    let i = 0
    while (i < pool.length) {
      const g = groupOf(pool[i])
      let j = i
      while (j < pool.length && groupOf(pool[j]) === g) j++
      const run = pool.slice(i, j)
      for (let k = run.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [run[k], run[r]] = [run[r], run[k]]
      }
      shuffled.push(...run)
      i = j
    }
    pool = shuffled
  }

  // Egg group cooldown. Tracker days can be 0 or negative (previous plan),
  // so "never used" means undefined, not 0.
  const eggDays = [mtTracker[ID_EGG_WHOLE], mtTracker[ID_EGG_WHITE]]
    .filter((d): d is number => d !== undefined)
  const eggOnCooldown = eggDays.length > 0 && (currentDay - Math.max(...eggDays)) < MIN_GAP

  // Per-protein helpers
  const cap      = (id: number) => effectiveCaps[id] ?? weekProteinLimit
  const slotCount = weekProteinCount[mt] ?? {}
  const underCap = (id: number) => (slotCount[id] || 0) < cap(id)
  const gapFor   = (id: number) =>
    PROTEIN_LONG_GAP.has(id) || ((mt === 'lunch' || mt === 'dinner') && LEGUME_IDS.has(id))
      ? MIN_GAP_LONG : MIN_GAP
  const freshGap = (id: number) => { const d = mtTracker[id]; return d === undefined || currentDay - d >= gapFor(id) }
  const notEggCd = (id: number) => !(EGG_IDS.has(id) && eggOnCooldown)

  // Group-aware same-day check
  // Blocks dal from appearing if any dal already used today
  // Blocks expensive protein if another expensive one already used today
  const groupBlocked = (id: number) => {
    // Dal at two meals is normal in Indian homes; only the SAME dal is blocked
    // (via dayProteinUsed below). The old one-dal-per-day rule left no budget
    // protein for dinner and forced a second meat/fish meal.
    if (EXPENSIVE_IDS.has(id) && [...dayProteinUsed].some(u => EXPENSIVE_IDS.has(u))) return true
    if (FISH_IDS.has(id)      && [...dayProteinUsed].some(u => FISH_IDS.has(u)))      return true
    if (PREMIUM_IDS.has(id)   && [...dayProteinUsed].some(u => PREMIUM_IDS.has(u)))   return true
    if (dayProteinUsed.has(id)) return true
    return false
  }

  // Priority cascade
  // Simple routine (25 Sep 2026): egg-eaters get eggs at EVERY breakfast.
  // Same breakfast daily is easier to follow; the carb rotates for variety.
  // Dal-roti stays available as the swap option.
  const eggEveryBreakfast = mt === 'breakfast' && pool.includes(ID_EGG_WHOLE) && !dayProteinUsed.has(ID_EGG_WHOLE)

  // Snack nut rotation (30 Sep 2026): pool.find() always picks the first surviving
  // nut, so lactose+bloating clients see Badam every day. Rotate the nut segment
  // of the pool by currentDay so each day a different nut sits at the front.
  if (mt === 'snack') {
    // Murmura joins the rotating dry-snack segment (1 Oct 2026); as a non-nut it
    // sat ahead of every nut and came up every other day.
    const nutIds  = new Set([...Object.keys(NUT_SNACK_G).map(Number), ID_MURMURA])
    const nuts    = pool.filter(id => nutIds.has(id))
    const nonNuts = pool.filter(id => !nutIds.has(id))
    if (nuts.length > 1) {
      const offset = (currentDay - 1) % nuts.length
      pool = [...nonNuts, ...nuts.slice(offset), ...nuts.slice(0, offset)]
    }
  }

  let proteinId = eggEveryBreakfast ? ID_EGG_WHOLE :
    // P1: ideal — all constraints satisfied
    pool.find(id => !groupBlocked(id) && notEggCd(id) && freshGap(id) && underCap(id)) ??
    // P2: relax gap
    pool.find(id => !groupBlocked(id) && notEggCd(id) && underCap(id)) ??
    // P3: relax cap
    pool.find(id => !groupBlocked(id) && notEggCd(id)) ??
    // P4: relax group (last resort — avoid null meal)
    pool.find(id => !dayProteinUsed.has(id) && !PREMIUM_IDS.has(id)) ??
    pool.find(id => !dayProteinUsed.has(id)) ??
    pool[0]

  if (!proteinId) return null
  const proteinIng = ingredientRows[proteinId]
  if (!proteinIng || !proteinIng.energy_kcal) return null

  // Mark used
  dayProteinUsed.add(proteinId)
  if (!weekTracker.lastUsedOnDay[mt]) weekTracker.lastUsedOnDay[mt] = {}
  weekTracker.lastUsedOnDay[mt][proteinId] = currentDay

  // ── Select carb ───────────────────────────────────────────────────────────
  const rawCarbPool    = mt === 'breakfast' ? BREAKFAST_CARBS : mt === 'lunch' ? LUNCH_CARBS : DINNER_CARBS
  // Heartburn clients: no rice at dinner — late rice worsens reflux
  const carbPool       = heartburnDinnerRiceExcluded
    ? rawCarbPool.filter(id => id !== ID_RICE_BASMATI && id !== ID_RICE_WHITE && id !== ID_RICE_BROWN)
    : rawCarbPool
  const carbCandidates = carbPool.filter(id => !excluded.has(id))
  // Dal + poha / dal + oats / paneer + poha / paneer + oats are not real dishes.
  // Dal and paneer breakfasts always get roti (paneer rule added 30 Sep 2026).
  const carbFits = (pid: number, cid: number) =>
    !(mt === 'breakfast' &&
      (DAL_IDS.has(pid) || pid === ID_PANEER || pid === ID_TOFU || pid === ID_CHOLE || pid === ID_RAJMA) &&
      (cid === ID_POHA || cid === ID_OATS))
  const pickCarb = (cands: number[], start: number, pid: number): number => {
    for (let k = 0; k < cands.length; k++) {
      const c = cands[(start + k) % cands.length]
      if (carbFits(pid, c)) return c
    }
    return cands[start % cands.length]
  }

  // Carb rotation is tracked independently from protein so a repeating protein
  // (e.g. egg every other day) doesn't lock the carb into the same cycle.
  // Use a separate sub-key in weekTracker to remember the last carb used per slot.
  const carbTrackerKey = `__carbIndex_${mt}`
  if (!weekTracker.lastUsedOnDay[carbTrackerKey]) weekTracker.lastUsedOnDay[carbTrackerKey] = {}
  const lastCarbIndex = weekTracker.lastUsedOnDay[carbTrackerKey]['__idx'] ?? -1
  const nextCarbIndex = (lastCarbIndex + 1) % Math.max(1, carbCandidates.length)
  weekTracker.lastUsedOnDay[carbTrackerKey]['__idx'] = nextCarbIndex

  const primaryCarbId = carbCandidates.length > 0
    ? pickCarb(carbCandidates, nextCarbIndex, proteinId)
    : carbPool[nextCarbIndex % carbPool.length]

  // ── Select vegetable ──────────────────────────────────────────────────────
  const safeVegOptions = VEG_OPTIONS.filter(id => {
    if (excluded.has(id)) return false
    if (avoidBloatingTriggers && BLOATING_VEG_IDS.has(id)) return false
    return true
  })
  const vegPool = safeVegOptions.length > 0 ? safeVegOptions : VEG_OPTIONS.filter(id => !excluded.has(id))

  // Independent veg tracker per slot so dinner veg doesn't shadow lunch veg
  const vegTrackerKey = `__vegIndex_${mt}`
  if (!weekTracker.lastUsedOnDay[vegTrackerKey]) weekTracker.lastUsedOnDay[vegTrackerKey] = {}
  const lastVegIndex = weekTracker.lastUsedOnDay[vegTrackerKey]['__idx'] ?? -1
  let nextVegIndex = (lastVegIndex + 1) % Math.max(1, vegPool.length)

  // No same veg at lunch and dinner on the same day (28 Sep 2026). Lunch and
  // dinner rotate independently, so without this check they could land on the
  // same veg every day of a plan.
  if (mt === 'lunch' || mt === 'dinner') {
    if (!weekTracker.lastUsedOnDay['__vegDay']) weekTracker.lastUsedOnDay['__vegDay'] = {}
    const vegDay = weekTracker.lastUsedOnDay['__vegDay']
    for (let k = 0; k < vegPool.length; k++) {
      const cand = (lastVegIndex + 1 + k) % vegPool.length
      if (vegDay[vegPool[cand]] !== currentDay) { nextVegIndex = cand; break }
    }
    vegDay[vegPool[nextVegIndex]] = currentDay
  }
  weekTracker.lastUsedOnDay[vegTrackerKey]['__idx'] = nextVegIndex

  const primaryVegId = vegPool[nextVegIndex]

  // ── Build primary meal ────────────────────────────────────────────────────
  const primaryItems = assembleMeal(
    proteinId, primaryCarbId, primaryVegId,
    mt, calTarget, currentDay, ingredientRows, excluded, avoidBloatingTriggers, glucoseSensitive,
    eggSideOk, paneerSideMaxG, tofuSideMaxG
  )
  if (!primaryItems) return null
  const sideBaseP = LEGUME_IDS.has(proteinId) || proteinId === ID_SOYA_CHUNKS
  if (sideBaseP &&
      primaryItems.some(i => i.ingredient_id === ID_PANEER && i.role === 'protein')) {
    dayProteinUsed.add(PANEER_SIDE_MARK)
  }
  if (sideBaseP &&
      primaryItems.some(i => i.ingredient_id === ID_TOFU && i.role === 'protein')) {
    dayProteinUsed.add(TOFU_SIDE_MARK)
  }
  if (DAL_IDS.has(proteinId) &&
      primaryItems.some(i => i.ingredient_id === ID_EGG_WHOLE && i.role === 'protein')) {
    dayProteinUsed.add(EGG_SIDE_MARK)
  }

  // ── Snack extras (29 Sep 2026 refactor) ─────────────────────────────────────
  // Nuts and buttermilk are self-contained — no fruit added.
  // A helper is shared with snack alternates so they build the same way.
  const isNutSnack = (id: number) => !!NUT_SNACK_G[id]
  const addSnackExtras = (items: FoodItem[], snackProteinId: number, fruitOffset: number) => {
    const kcalNow = () => items.reduce((s, i) => s + i.calories, 0)
    // Almond side, 5g steps up to 15g, toward ~95% of the slot (1 Oct 2026)
    const addAlmondSide = () => {
      const aIng = ingredientRows[ID_ALMOND]
      if (!aIng?.energy_kcal || excluded.has(ID_ALMOND) || snackProteinId === ID_ALMOND) return
      const gap = calTarget * 0.95 - kcalNow()
      if (gap < 40) return   // under ~40 kcal short is close enough
      const g = Math.min(15, Math.max(10, Math.round((gap / (aIng.energy_kcal / 100)) / 5) * 5))
      items.push(makeItem(aIng, ID_ALMOND, g, 'fat'))
    }
    // Makhana for glucose-sensitive clients is capped at 40g (~130 kcal), so
    // pair it with a few almonds to reach the slot.
    if (snackProteinId === ID_MAKHANA) {
      if (kcalNow() < calTarget * 0.85) addAlmondSide()
      return
    }
    if (isNutSnack(snackProteinId)) return

    // Chaach (1 Oct 2026): one glass alone is ~60 kcal, so pair it with a dry
    // side sized to ~95% of the slot. Side rotates by day; skips excluded and
    // bloating-trigger items.
    if (snackProteinId === ID_BUTTERMILK) {
      const sides = [ID_MAKHANA, ID_PEANUT, ID_ROASTED_CHANA, ID_ALMOND].filter(id =>
        !excluded.has(id) && ingredientRows[id]?.energy_kcal &&
        !(avoidBloatingTriggers && id === ID_ROASTED_CHANA) &&
        !(glucoseSensitive && id === ID_ROASTED_CHANA))
      if (sides.length === 0) return
      const sideId = sides[(currentDay - 1 + fruitOffset) % sides.length]
      const ing    = ingredientRows[sideId]
      const maxG   = sideId === ID_ROASTED_CHANA ? 40 : (NUT_SNACK_MAX_G[sideId] ?? 30)
      const wantG  = Math.round(((calTarget * 0.95 - kcalNow()) / (ing.energy_kcal / 100)) / 5) * 5
      const g      = Math.min(Math.max(wantG, 10), maxG)
      items.push(makeItem(ing, sideId, g, sideId === ID_MAKHANA ? 'carb' : sideId === ID_ROASTED_CHANA ? 'protein' : 'fat'))
      return
    }

    // Murmura bhel (1 Oct 2026): murmura + 15g peanuts + ½ kheera, then the
    // murmura is resized (1 to 3 cups) to land near 95% of the slot.
    if (snackProteinId === ID_MURMURA) {
      const pIng = ingredientRows[ID_PEANUT]
      if (pIng?.energy_kcal && !excluded.has(ID_PEANUT)) items.push(makeItem(pIng, ID_PEANUT, 15, 'fat'))
      const cIng = ingredientRows[ID_CUCUMBER]
      if (cIng?.energy_kcal && !excluded.has(ID_CUCUMBER)) items.push(makeItem(cIng, ID_CUCUMBER, U.CUCUMBER / 2, 'vegetable'))
      const mIdx = items.findIndex(i => i.ingredient_id === ID_MURMURA)
      const mIng = ingredientRows[ID_MURMURA]
      if (mIdx >= 0 && mIng?.energy_kcal) {
        const others = kcalNow() - items[mIdx].calories
        const wantG  = (calTarget * 0.95 - others) / (mIng.energy_kcal / 100)
        const g      = Math.min(Math.max(wantG, U.MURMURA_CUP), 3 * U.MURMURA_CUP)
        items[mIdx]  = makeItem(mIng, ID_MURMURA, g, 'carb')
      }
      return
    }
    // Glucose-sensitive (29 Sep 2026): apple only (lower GI than banana), and
    // the chana top-up below is capped so the snack stays within SNACK_CARB_CAP.
    const SNACK_CARB_CAP = 35
    const fruitBase = glucoseSensitive ? [ID_APPLE] : SNACK_EXTRAS
    const availableExtras = fruitBase.filter(id => !excluded.has(id))
    const extraPool = availableExtras.length > 0 ? availableExtras : SNACK_EXTRAS
    const extraId   = extraPool[(currentDay - 1 + fruitOffset) % extraPool.length]
    const extraIng  = ingredientRows[extraId]
    // Fruit is checked AFTER it snaps to real units (6 Oct 2026). An apple is
    // always a whole apple (~94 kcal), so on a ~150 kcal slot it overflowed no
    // matter what grams were asked for. Try today's fruit, then the others
    // (banana can be ½), and skip fruit if none fits under 110% of the slot.
    {
      const tryOrder = [extraId, ...extraPool.filter(id => id !== extraId)]
      for (const fid of [...new Set(tryOrder)]) {
        const fIng = ingredientRows[fid]
        if (!fIng?.energy_kcal) continue
        const room = calTarget * 1.10 - kcalNow()
        const wantG = Math.min(100, Math.max(1, Math.round(room / (fIng.energy_kcal / 100))))
        const fItem = makeItem(fIng, fid, wantG, 'fruit')
        if (fItem.quantity_grams > 0 && kcalNow() + fItem.calories <= calTarget * 1.10) {
          items.push(fItem)
          break
        }
      }
    }
    const usedCal    = items.reduce((s, i) => s + i.calories, 0)
    // Floor raised 80% → 90% (1 Oct 2026); the top-up sizes toward 95%.
    const snackFloor = calTarget * 0.90
    if (usedCal < snackFloor && !excluded.has(ID_ROASTED_CHANA) && snackProteinId !== ID_ROASTED_CHANA && !avoidBloatingTriggers) {
      const topUpIng = ingredientRows[ID_ROASTED_CHANA]
      if (topUpIng && topUpIng.energy_kcal) {
        let topUpGrams = Math.min(40, Math.round(((calTarget * 0.95 - usedCal) / (topUpIng.energy_kcal / 100)) / 5) * 5)
        if (glucoseSensitive && topUpIng.carbs_g > 0) {
          const carbsNow = items.reduce((s, i) => s + (i.carbs_g || 0), 0)
          topUpGrams = Math.min(topUpGrams, Math.floor((SNACK_CARB_CAP - carbsNow) / (topUpIng.carbs_g / 100)))
        }
        const snackKcalAfterTopUp = items.reduce((s,i)=>s+i.calories,0) + topUpIng.energy_kcal * topUpGrams / 100
        if (topUpGrams >= 10 && snackKcalAfterTopUp <= calTarget * 1.10) {
          items.push(makeItem(topUpIng, ID_ROASTED_CHANA, topUpGrams, 'protein'))
        } else {
          addAlmondSide()   // gap too small for a chana handful, or top-up would overshoot
        }
      }
    } else if (usedCal < snackFloor) {
      // Chana blocked (bloating, excluded, or it is the snack): almonds instead.
      // Dahi aur Fruit for bloating clients was landing at ~64% of the slot.
      addAlmondSide()
    }
  }
  if (mt === 'snack') addSnackExtras(primaryItems, proteinId, 0)

  // ── Build 2 alternates ────────────────────────────────────────────────────
  // Pick 2 different proteins from the pool (excluding primary and group-blocked)
  // Each alternate gets a different carb too for real meal variety
  const alternateCarbPool = carbCandidates.filter(id => id !== primaryCarbId)
  const alternates: IngredientMealAlternate[] = []

  if (mt !== 'snack') {
    // A premium protein at ANOTHER meal today blocks premium swap options here
    const premiumElsewhere = [...dayProteinUsed].some(u => u !== proteinId && PREMIUM_IDS.has(u))
    const altProteinCandidates = pool.filter(id =>
      id !== proteinId &&
      !dayProteinUsed.has(id) &&
      !(premiumElsewhere && PREMIUM_IDS.has(id)) &&
      !(DAL_IDS.has(id)  && DAL_IDS.has(proteinId))  && // don't offer dal swap if primary is already dal
      !(FISH_IDS.has(id) && FISH_IDS.has(proteinId))    // don't offer fish swap if primary is already fish
    )

    // Two alternates from different protein groups (not moong dal AND toor dal)
    const groupOf = (id: number) =>
      DAL_IDS.has(id) ? 'dal' : FISH_IDS.has(id) ? 'fish' : EGG_IDS.has(id) ? 'egg' : String(id)
    const altPicks: number[] = []
    for (const id of altProteinCandidates) {
      if (altPicks.length >= 2) break
      if (!altPicks.some(a => groupOf(a) === groupOf(id))) altPicks.push(id)
    }
    for (const id of altProteinCandidates) {        // top up if groups ran out
      if (altPicks.length >= 2) break
      if (!altPicks.includes(id)) altPicks.push(id)
    }

    // Relaxed fallback (29 Sep 2026): stacked rules left dal dinners with no swap
    if (altPicks.length < 2) {
      const notToday = (id: number) => id !== proteinId && !dayProteinUsed.has(id) && !altPicks.includes(id)
      // Premium swaps still respect one meat/fish per day (1 Oct 2026: this
      // tier used to offer chicken at dinner on a chicken-lunch day).
      const relaxed = [
        ...pool.filter(id => notToday(id) && DAL_IDS.has(id)),
        ...pool.filter(id => notToday(id) && PREMIUM_IDS.has(id) && !premiumElsewhere &&
                             !(FISH_IDS.has(id) && FISH_IDS.has(proteinId))),
      ]
      for (const id of relaxed) {
        if (altPicks.length >= 2) break
        altPicks.push(id)
      }
    }

    // Last tier (1 Oct 2026): restricted clients (veg/vegan + bloating + lactose)
    // can have 3 or 4 proteins in the whole pool, all eaten earlier in the day,
    // which left every dal dinner with 0 or 1 swaps. Allow a non-premium,
    // non-egg protein from an earlier meal today as a swap, e.g. the breakfast
    // moong dal as a dinner option. Never the primary itself.
    if (altPicks.length < 2) {
      const reuse = pool.filter(id =>
        id !== proteinId && !altPicks.includes(id) &&
        dayProteinUsed.has(id) && !PREMIUM_IDS.has(id) && !EGG_IDS.has(id))
      for (const id of reuse) {
        if (altPicks.length >= 2) break
        altPicks.push(id)
      }
    }

    for (let i = 0; i < altPicks.length; i++) {
      const altProteinId = altPicks[i]
      // Rotate carb for alternate so it feels like a different meal
      // Prefer a different carb from the primary, but never an invalid pairing
      // (dal + poha / dal + oats). If only the primary's carb fits, reuse it.
      const fitAlt = alternateCarbPool.filter(c => carbFits(altProteinId, c))
      const fitAny = carbCandidates.filter(c => carbFits(altProteinId, c))
      const altCarbId =
        fitAlt.length > 0 ? fitAlt[i % fitAlt.length] :
        fitAny.length > 0 ? fitAny[i % fitAny.length] :
        primaryCarbId
      // Rotate veg for alternate — offset from primary veg index
      const altVegId = vegPool[(nextVegIndex + i + 1) % vegPool.length]

      const altItems = assembleMeal(
        altProteinId, altCarbId, altVegId,
        mt, calTarget, currentDay, ingredientRows, excluded, avoidBloatingTriggers, glucoseSensitive,
        eggSideOk, paneerSideMaxG, tofuSideMaxG
      )
      if (altItems) {
        alternates.push({
          meal_label: styleEggBreakfast(altItems, mt, currentDay) ?? buildMealLabel(altItems, mt),
          calories:   Math.round(altItems.reduce((s, it) => s + it.calories,  0)),
          protein_g:  Math.round(altItems.reduce((s, it) => s + it.protein_g, 0) * 10) / 10,
          carbs_g:    Math.round(altItems.reduce((s, it) => s + it.carbs_g,   0) * 10) / 10,
          fat_g:      Math.round(altItems.reduce((s, it) => s + it.fat_g,     0) * 10) / 10,
          food_items: altItems,
        })
      }
    }
  } else {
    // Snack alternates (30 Sep 2026): rotate through remaining options each day
    // so swaps are not always the same two.
    const snackPool = pool.filter(id => id !== proteinId && !dayProteinUsed.has(id))
    const altOffset = (currentDay - 1) % Math.max(1, snackPool.length)
    const snackAlts = [
      ...snackPool.slice(altOffset),
      ...snackPool.slice(0, altOffset),
    ].slice(0, 2)
    snackAlts.forEach((altProteinId, i) => {
      const altItems = assembleMeal(
        altProteinId, primaryCarbId, primaryVegId,
        mt, calTarget, currentDay, ingredientRows, excluded, avoidBloatingTriggers, glucoseSensitive
      )
      if (!altItems) return
      addSnackExtras(altItems, altProteinId, i + 1)
      alternates.push({
        meal_label: buildMealLabel(altItems, mt),
        calories:   Math.round(altItems.reduce((s, it) => s + it.calories,  0)),
        protein_g:  Math.round(altItems.reduce((s, it) => s + it.protein_g, 0) * 10) / 10,
        carbs_g:    Math.round(altItems.reduce((s, it) => s + it.carbs_g,   0) * 10) / 10,
        fat_g:      Math.round(altItems.reduce((s, it) => s + it.fat_g,     0) * 10) / 10,
        food_items: altItems,
      })
    })
  }

  const totalCal  = Math.round(primaryItems.reduce((s, i) => s + i.calories,  0))
  const totalProt = Math.round(primaryItems.reduce((s, i) => s + i.protein_g, 0) * 10) / 10
  const totalCarb = Math.round(primaryItems.reduce((s, i) => s + i.carbs_g,   0) * 10) / 10
  const totalFat  = Math.round(primaryItems.reduce((s, i) => s + i.fat_g,     0) * 10) / 10

  return {
    meal_type:    mt,
    time:         mealTarget.time ?? '',
    recipe_id:    null,
    recipe_name:  null,
    meal_label:   styleEggBreakfast(primaryItems, mt, currentDay) ?? buildMealLabel(primaryItems, mt),
    display_mode: 'ingredient_based',
    calories:     totalCal,
    protein_g:    totalProt,
    carbs_g:      totalCarb,
    fat_g:        totalFat,
    cal_target:   Math.round(calTarget),
    food_items:   primaryItems,
    alternates,
  }
}

// ── Day-level top-up (29 Sep 2026) ────────────────────────────────────────────
// The fill step in assembleMeal works one meal at a time. On 3-meal glucose-
// sensitive days a legume+rice lunch can be stuck under target (carb budget
// full, no roti on rice) while dinner has room it never uses, because dinner
// is already near its own slot target. This runs after all of a day's meals
// are built and, if the day is under 90%, adds to lunch/dinner meals that
// have room, each up to 125% of its own slot target:
//   1. a katori of curd to a meal without one (exempt from the carb cap)
//   2. one roti at a time to roti meals (never rice meals), max 4,
//      within the glucose carb cap
// Mutates the meals in place. Returns true if anything was added.
export function topUpIngredientDay(
  meals: any[],
  dayTargetKcal: number,
  ingredientRows: Record<number, any>,
  excludedIngredientIds: number[] = [],
  glucoseSensitive: boolean = false,
): boolean {
  const excluded = new Set(excludedIngredientIds)
  const floor    = dayTargetKcal * 0.90
  // A meal may run past its own slot here because the DAY is short; it still
  // stops as soon as the day reaches 90%.
  const SLOT_CEIL = 1.25
  const dayKcal  = () => meals.reduce((s, m) => s + (m.calories || 0), 0)
  if (dayKcal() >= floor) return false

  const kcalOf  = (id: number, g: number) => Math.round((ingredientRows[id]?.energy_kcal || 0) * g / 100)
  const carbsOf = (id: number, g: number) => (ingredientRows[id]?.carbs_g || 0) * g / 100
  const isRice  = (id: number) => id === ID_RICE_BASMATI || id === ID_RICE_WHITE || id === ID_RICE_BROWN
  const recompute = (m: any) => {
    const it = m.food_items as FoodItem[]
    m.calories  = Math.round(it.reduce((s, i) => s + i.calories, 0))
    m.protein_g = Math.round(it.reduce((s, i) => s + i.protein_g, 0) * 10) / 10
    m.carbs_g   = Math.round(it.reduce((s, i) => s + i.carbs_g, 0) * 10) / 10
    m.fat_g     = Math.round(it.reduce((s, i) => s + i.fat_g, 0) * 10) / 10
    m.day_top_up = true
  }

  const mains = meals
    .filter(m => (m.meal_type === 'lunch' || m.meal_type === 'dinner') && Array.isArray(m.food_items))
    .sort((a, b) => ((b.cal_target || 0) * SLOT_CEIL - (b.calories || 0)) - ((a.cal_target || 0) * SLOT_CEIL - (a.calories || 0)))
  let changed = false

  // 1. Curd
  const curdIng = ingredientRows[ID_CURD_LOWFAT]
  if (curdIng?.energy_kcal && !excluded.has(ID_CURD_LOWFAT) && !excluded.has(ID_CURD_FULLFAT)) {
    const add = kcalOf(ID_CURD_LOWFAT, U.KATORI)
    for (const m of mains) {
      if (dayKcal() >= floor) break
      const items = m.food_items as FoodItem[]
      if (items.some(i => i.ingredient_id === ID_CURD_LOWFAT || i.ingredient_id === ID_CURD_FULLFAT)) continue
      if ((m.calories || 0) + add > (m.cal_target || 0) * SLOT_CEIL) continue
      items.push(makeItem(curdIng, ID_CURD_LOWFAT, U.KATORI, 'dairy'))
      recompute(m); changed = true
    }
  }

  // 2. Rotis on roti meals
  const rotiIng = ingredientRows[ID_ROTI]
  if (rotiIng?.energy_kcal && !excluded.has(ID_ROTI)) {
    const addK = kcalOf(ID_ROTI, U.ROTI)
    const addC = carbsOf(ID_ROTI, U.ROTI)
    for (const m of mains) {
      const items = m.food_items as FoodItem[]
      if (items.some(i => isRice(i.ingredient_id))) continue
      while (dayKcal() < floor) {
        const idx = items.findIndex(i => i.ingredient_id === ID_ROTI)
        if (idx < 0) break
        if (items[idx].quantity_grams + U.ROTI > 4 * U.ROTI) break
        if ((m.calories || 0) + addK > (m.cal_target || 0) * SLOT_CEIL) break
        if (glucoseSensitive && (m.carbs_g || 0) + addC > glucoseCapFor(m.cal_target || 0)) break
        items[idx] = makeItem(rotiIng, ID_ROTI, items[idx].quantity_grams + U.ROTI, 'carb')
        recompute(m); changed = true
      }
      if (dayKcal() >= floor) break
    }
  }

  return changed
}

// ── Swap calorie matching (1 Oct 2026) ────────────────────────────────────────
// Alternates were built once against the slot target and never adjusted, so a
// swap could be 10-40% off the primary it replaces, especially after the
// day-level top-up grew the primary. This runs after the day is finished and
// nudges each alternate toward the primary's final calories, within ±8% (the
// plan page flags anything past 10%). Only household steps are used, so labels
// and grams stay honest:
//   grow:   side katori of curd → +1 roti / +¼ cup poha → 2nd tsp ghee
//   shrink: −1 roti / −½ katori rice / −¼ cup poha → drop a side curd
//   snacks: resize the nut / makhana / murmura / chaach side in 5g steps,
//           else add a small handful of almonds or roasted chana
// Respects lactose/client exclusions, bloating triggers and the glucose carb caps.
// Mutates meal.alternates in place.
export function matchAlternates(
  meal: any,
  ingredientRows: Record<number, any>,
  excludedIngredientIds: number[] = [],
  avoidBloatingTriggers: boolean = false,
  glucoseSensitive: boolean = false,
): void {
  if (!meal || !Array.isArray(meal.alternates) || meal.alternates.length === 0) return
  const mt     = meal.meal_type as string
  const target = meal.calories || 0
  if (target <= 0) return
  const lo = target * 0.92
  const hi = target * 1.08
  const excluded = new Set(excludedIngredientIds)
  const ok = (id: number) => !excluded.has(id) && !!ingredientRows[id]?.energy_kcal
  const isRice = (id: number) => id === ID_RICE_BASMATI || id === ID_RICE_WHITE || id === ID_RICE_BROWN
  const carbCap = mt === 'snack' ? 35 : glucoseCapFor(target)

  for (const alt of meal.alternates) {
    const items: FoodItem[] = alt.food_items.map((i: FoodItem) => ({ ...i }))
    const kcal  = () => items.reduce((s, i) => s + i.calories, 0)
    const carbs = () => items.reduce((s, i) => s + (i.carbs_g || 0), 0)
    const idxOf = (id: number) => items.findIndex(i => i.ingredient_id === id)
    // Apply a candidate change only if it moves closer to target
    const tryChange = (apply: () => void, undo: () => void): boolean => {
      const before = Math.abs(kcal() - target)
      const carbsBefore = carbs()
      apply()
      const worseCarbs = glucoseSensitive && carbs() > carbCap && carbs() > carbsBefore
      if (Math.abs(kcal() - target) >= before || worseCarbs) { undo(); return false }
      return true
    }
    const setGrams = (idx: number, grams: number) => {
      const it = items[idx]
      items[idx] = makeItem(ingredientRows[it.ingredient_id], it.ingredient_id, grams, it.role)
    }
    const resize = (idx: number, grams: number) => {
      const prev = items[idx]
      return tryChange(() => setGrams(idx, grams), () => { items[idx] = prev })
    }
    const add = (id: number, grams: number, role: FoodItem['role']) =>
      tryChange(() => items.push(makeItem(ingredientRows[id], id, grams, role)), () => { items.pop() })

    let guard = 0
    if (mt === 'snack') {
      // Scalable item: a nut / makhana main, the murmura, or chaach's side
      const SCALE: Record<number, [number, number, number]> = { // min, max, step
        [ID_ALMOND]: [10, 30, 5], [ID_PEANUT]: [10, 35, 5], [ID_CASHEW]: [10, 30, 5],
        [ID_WALNUT]: [10, 30, 5], [ID_MAKHANA]: [15, glucoseSensitive ? 40 : 50, 5],
        [ID_ROASTED_CHANA]: [10, 40, 5], [ID_MURMURA]: [U.MURMURA_CUP, 3 * U.MURMURA_CUP, U.MURMURA_CUP / 2],
      }
      let sIdx = items.findIndex(i => SCALE[i.ingredient_id] && i.ingredient_id !== ID_PEANUT) // peanuts in bhel stay 15g
      if (sIdx < 0) sIdx = items.findIndex(i => SCALE[i.ingredient_id])
      if (sIdx < 0 && kcal() < lo) {
        // Nothing to scale (curd + fruit, egg, sprouts): add a small side
        const fillId = !avoidBloatingTriggers && !glucoseSensitive && ok(ID_ROASTED_CHANA) ? ID_ROASTED_CHANA
                     : ok(ID_ALMOND) ? ID_ALMOND : 0
        if (fillId && add(fillId, 10, fillId === ID_ALMOND ? 'fat' : 'protein')) sIdx = items.length - 1
      }
      if (sIdx >= 0) {
        const [mn, mx, st] = SCALE[items[sIdx].ingredient_id]
        while (kcal() < lo && items[sIdx].quantity_grams + st <= mx && guard++ < 20) {
          if (!resize(sIdx, items[sIdx].quantity_grams + st)) break
        }
        while (kcal() > hi && items[sIdx].quantity_grams - st >= mn && guard++ < 40) {
          if (!resize(sIdx, items[sIdx].quantity_grams - st)) break
        }
      }
    } else {
      const carbIdx = () => items.findIndex(i => i.role === 'carb')
      const roti = ingredientRows[ID_ROTI]
      // Grow
      if (kcal() < lo && ok(ID_CURD_LOWFAT) && !excluded.has(ID_CURD_FULLFAT) &&
          !items.some(i => i.ingredient_id === ID_CURD_LOWFAT || i.ingredient_id === ID_CURD_FULLFAT)) {
        add(ID_CURD_LOWFAT, U.KATORI, 'dairy')
      }
      while (kcal() < lo && guard++ < 10) {
        const ci = carbIdx()
        if (ci < 0) break
        const cid = items[ci].ingredient_id
        const g   = items[ci].quantity_grams
        let grew = false
        if (cid === ID_ROTI && g + U.ROTI <= (mt === 'breakfast' ? 3 : 4) * U.ROTI) {
          grew = resize(ci, g + U.ROTI)
        } else if (cid === ID_POHA && g + U.POHA_CUP / 4 <= 1.5 * U.POHA_CUP) {
          grew = resize(ci, g + U.POHA_CUP / 4)
        } else if (isRice(cid) && g + U.KATORI / 2 <= 2 * U.KATORI &&
                   resize(ci, g + U.KATORI / 2)) {
          grew = true   // carb cap enforced by tryChange for glucose-sensitive
        } else if (isRice(cid) && !glucoseSensitive && roti?.energy_kcal && ok(ID_ROTI) && idxOf(ID_ROTI) < 0) {
          grew = add(ID_ROTI, U.ROTI, 'carb')   // one roti on the side of a rice plate
        }
        if (!grew) {
          // Carb is maxed or capped: grow the dal itself, up to 2 katori
          const di = items.findIndex(i => i.role === 'protein' && DAL_IDS.has(i.ingredient_id))
          if (di >= 0 && items[di].quantity_grams + U.KATORI / 2 <= 2 * U.KATORI) grew = resize(di, items[di].quantity_grams + U.KATORI / 2)
        }
        if (!grew) break
      }
      const gi = idxOf(ID_GHEE)
      if (kcal() < lo && gi >= 0 && items[gi].quantity_grams < 2 * U.GHEE_TSP) {
        resize(gi, items[gi].quantity_grams + U.GHEE_TSP)
      }
      // Shrink
      while (kcal() > hi && guard++ < 20) {
        const ci = carbIdx()
        if (ci < 0) break
        const cid = items[ci].ingredient_id
        const g   = items[ci].quantity_grams
        const minG =
          cid === ID_ROTI ? (mt === 'breakfast' ? 1 : 2) * U.ROTI :
          isRice(cid)     ? U.KATORI / 2 :
          cid === ID_POHA ? U.POHA_CUP / 2 : g
        const step = cid === ID_ROTI ? U.ROTI : isRice(cid) ? U.KATORI / 2 : cid === ID_POHA ? U.POHA_CUP / 4 : 0
        if (!step || g - step < minG || !resize(ci, g - step)) {
          // Carb at its floor: shrink a 1½ katori dal back to 1 katori
          const di = items.findIndex(i => i.role === 'protein' && DAL_IDS.has(i.ingredient_id))
          if (di >= 0 && items[di].quantity_grams - U.KATORI / 2 >= U.KATORI &&
              resize(di, items[di].quantity_grams - U.KATORI / 2)) continue
          break
        }
      }
      const sideCurd = items.findIndex(i => i.ingredient_id === ID_CURD_LOWFAT && i.role === 'dairy')
      if (kcal() > hi && sideCurd >= 0) {
        const prev = items[sideCurd]
        tryChange(() => items.splice(sideCurd, 1), () => items.splice(sideCurd, 0, prev))
      }
    }

    alt.food_items = items
    alt.calories   = Math.round(kcal())
    alt.protein_g  = Math.round(items.reduce((s, i) => s + i.protein_g, 0) * 10) / 10
    alt.carbs_g    = Math.round(carbs() * 10) / 10
    alt.fat_g      = Math.round(items.reduce((s, i) => s + i.fat_g, 0) * 10) / 10
  }
}

// ── One meat/fish per day, including swaps (1 Oct 2026) ──────────────────────
// Lunch is built before dinner. A dal lunch can offer chicken/fish swaps, then
// dinner picks chicken as its primary, so swapping lunch gave two premium
// meals that day (6 swaps a week in non-veg test plans). After the day is
// built, any premium swap on a day where ANOTHER meal's primary is premium is
// replaced by a non-premium protein on the same carb and veg, or dropped if
// nothing fits. Run before matchAlternates.
export function enforceOnePremiumPerDay(
  dayMeals: any[],
  ingredientRows: Record<number, any>,
  dietType: string,
  excludedIngredientIds: number[] = [],
  avoidBloatingTriggers: boolean = false,
  excludeHighFat: boolean = false,
  glucoseSensitive: boolean = false,
): void {
  const diet = (dietType || 'non_vegetarian').toLowerCase()
  const excluded = new Set(excludedIngredientIds)
  if (excludeHighFat) excluded.add(ID_MUTTON)
  if (excludeHighFat && diet === 'non_vegetarian') excluded.add(ID_PANEER)
  if (avoidBloatingTriggers) [ID_RAJMA, ID_CHOLE, ID_SPROUTED_MOONG, ID_ROASTED_CHANA].forEach(id => excluded.add(id))

  const hasPremium = (items: FoodItem[]) => items.some(i => PREMIUM_IDS.has(i.ingredient_id))
  const mainProtein = (items: FoodItem[]) => items.find(i => i.role === 'protein')?.ingredient_id
  const usedToday = new Set<number>(dayMeals.map(m => mainProtein(m.food_items || [])).filter((x): x is number => x !== undefined))

  for (const m of dayMeals) {
    if (m.meal_type !== 'lunch' && m.meal_type !== 'dinner') continue
    if (!Array.isArray(m.alternates) || m.alternates.length === 0) continue
    const otherPremium = dayMeals.some(o => o !== m && hasPremium(o.food_items || []))
    if (!otherPremium) continue

    const offered = new Set<number>([mainProtein(m.food_items) ?? -1,
      ...m.alternates.map((a: any) => mainProtein(a.food_items) ?? -1)])
    const pool = (LUNCH_DINNER_PROTEINS[diet] ?? LUNCH_DINNER_PROTEINS.vegetarian)
      .filter(id => !excluded.has(id) && !PREMIUM_IDS.has(id) && !offered.has(id) && ingredientRows[id]?.energy_kcal)
    // Prefer proteins not eaten today, and no egg if egg was eaten today
    const ordered = [
      ...pool.filter(id => !usedToday.has(id) && !EGG_IDS.has(id)),
      ...pool.filter(id => !usedToday.has(id) && EGG_IDS.has(id) && ![...usedToday].some(u => EGG_IDS.has(u))),
      ...pool.filter(id => usedToday.has(id) && !EGG_IDS.has(id)),
    ]

    const kept: any[] = []
    for (const alt of m.alternates) {
      if (!hasPremium(alt.food_items)) { kept.push(alt); continue }
      const carbId = alt.food_items.find((i: FoodItem) => i.role === 'carb')?.ingredient_id ?? ID_ROTI
      const vegId  = alt.food_items.find((i: FoodItem) => i.role === 'vegetable')?.ingredient_id ?? VEG_OPTIONS[0]
      const newId  = ordered.find(id => !offered.has(id))
      if (newId === undefined) continue   // nothing safe: drop this swap
      const items = assembleMeal(newId, carbId, vegId, m.meal_type, m.cal_target || m.calories,
        0, ingredientRows, excluded, avoidBloatingTriggers, glucoseSensitive)
      if (!items) continue
      offered.add(newId)
      kept.push({
        meal_label: buildMealLabel(items, m.meal_type),
        calories:   Math.round(items.reduce((s, it) => s + it.calories,  0)),
        protein_g:  Math.round(items.reduce((s, it) => s + it.protein_g, 0) * 10) / 10,
        carbs_g:    Math.round(items.reduce((s, it) => s + it.carbs_g,   0) * 10) / 10,
        fat_g:      Math.round(items.reduce((s, it) => s + it.fat_g,     0) * 10) / 10,
        food_items: items,
      })
    }
    m.alternates = kept
  }
}

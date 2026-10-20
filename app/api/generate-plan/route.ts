// app/api/generate-plan/route.ts
// PSYNC diet plan generation. Ported from Nayamai's tested pipeline:
// targets -> clinical filters -> recipe pool -> coverage check -> weekly plan
// -> validation -> foods to avoid -> save.
//
// Psync changes from Nayamai:
// - Reads `members`, saves to `member_diet_plans`, scoped by org via user_roles
// - plan_mode 'protein_heavy': recipe mode with a 2.4 g/kg protein floor and a
//   recipe pool that prefers high-protein dishes
// - Default meal frequency is 4 (gym members eat more often than clinic clients)
// - No check-in adjustments yet (Psync has no check-ins)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculate, PROTEIN_HEAVY_G_PER_KG } from '@/lib/nutrition/calculations'
import { mapActivityLevel } from '@/lib/nutrition/intake'
import { allocateMealTargets } from '@/lib/nutrition/mealTargets'
import {
  buildClinicalFilters,
  buildFoodsToAvoidRules,
  applyRecipeFilters,
  passesSpiceFilter,
  passesExclusionFilter,
  passesSymptomFilter,
} from '@/lib/nutrition/clinicalFilters'
import { validateWeek, checkRecipeCoverage } from '@/lib/nutrition/planValidator'
import { buildIngredientWeeklyPlan } from '@/lib/generation/ingredientPlan'
import { buildRecipeWeeklyPlan, applyHeartburnDinnerFilter } from '@/lib/generation/recipePlan'
import { fetchGuidelines, insertPlan } from '@/lib/generation/savePlan'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Constants ──────────────────────────────────────────────────────────────
const MIN_PLAN_DAYS     = 1
const MAX_PLAN_DAYS     = 14
const MIN_MEAL_FREQ     = 2
const MAX_MEAL_FREQ     = 5
const DEFAULT_MEAL_FREQ = 4
const MIN_OVERRIDE_KCAL = 800
const MAX_OVERRIDE_KCAL = 5000
const AI_TIMEOUT_MS     = 8000
const PLAN_MODES        = ['recipe', 'ingredient', 'protein_heavy']

// Protein heavy pool: a recipe counts as high protein if flagged, or 20g+ per serving.
// Only applied to a meal slot when at least this many recipes remain, so a thin
// pool never empties.
const HIGH_PROTEIN_MIN_G     = 20
const HIGH_PROTEIN_MIN_POOL  = 10

// Required member fields, with labels the trainer will understand
const REQUIRED_FIELDS: Record<string, string> = {
  weight_kg:     'Weight',
  height_cm:     'Height',
  sex:           'Sex',
  date_of_birth: 'Date of birth',
  primary_goal:  'Primary goal',
  diet_type:     'Diet type',
  job_activity:  'Job activity',
}

// DB columns may come back as text[], a comma-separated string, or null
function toArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return []
}

function fail(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status })
}

export async function POST(req: NextRequest) {
  try {

    // ── 0. Authenticate caller ────────────────────────────────────────────
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return fail(401, 'Not signed in.')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return fail(401, 'Session expired. Log in again.')

    // ── 1. Parse body ─────────────────────────────────────────────────────
    let body: any
    try { body = await req.json() } catch { return fail(400, 'Invalid JSON in request body.') }

    const {
      member_id,
      plan_days: rawPlanDays = 7,
      override_kcal: rawOverride,
      plan_mode: rawMode = 'recipe',
      start_date: rawStartDate,
    } = body

    if (!member_id || typeof member_id !== 'string') return fail(400, 'member_id is required.')

    const plan_mode = PLAN_MODES.includes(rawMode) ? rawMode : 'recipe'
    const plan_days = Math.min(MAX_PLAN_DAYS, Math.max(MIN_PLAN_DAYS, Math.round(Number(rawPlanDays) || 7)))

    let override_kcal: number | undefined
    if (rawOverride !== undefined && rawOverride !== null && rawOverride !== '') {
      const parsed = Number(rawOverride)
      if (isNaN(parsed) || parsed < MIN_OVERRIDE_KCAL || parsed > MAX_OVERRIDE_KCAL) {
        return fail(400, `Calorie override must be between ${MIN_OVERRIDE_KCAL} and ${MAX_OVERRIDE_KCAL}.`)
      }
      override_kcal = parsed
    }

    const useIngredientMode = plan_mode === 'ingredient'
    const isProteinHeavy    = plan_mode === 'protein_heavy'

    const startDate = (typeof rawStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawStartDate))
      ? rawStartDate
      : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    const coachNotesIn = typeof body.coach_notes === 'string' ? body.coach_notes.trim().slice(0, 1000) : ''

    // ── 2. Fetch member and check org access ──────────────────────────────
    const { data: member, error: memberErr } = await supabase
      .from('members').select('*').eq('id', member_id).single()
    if (memberErr || !member) return fail(404, 'Member not found.')

    const { data: roles } = await supabase
      .from('user_roles').select('org_id').eq('user_id', user.id)
    const allowedOrgs = (roles ?? []).map((r: any) => r.org_id)
    if (!allowedOrgs.includes(member.org_id)) return fail(403, 'Access denied.')

    const missing = Object.entries(REQUIRED_FIELDS)
      .filter(([field]) => member[field] === null || member[field] === undefined || member[field] === '')
      .map(([, label]) => label)
    if (missing.length > 0) {
      return fail(422, `Member profile incomplete. Add: ${missing.join(', ')}.`, { missing })
    }

    const medical          = toArr(member.medical_conditions)
    const glucoseSensitive = medical.some(c => /diabet|insulin|pcos/i.test(c))

    // ── 2b. Activity level (always derived from job + exercise days) ──────
    const activity_level = mapActivityLevel(
      member.exercise_days_per_week, member.job_activity, !!member.trains_twice_daily)
    const client = { ...member, activity_level }

    // ── 3. Calculate nutrition targets ────────────────────────────────────
    let calcs: any
    try {
      calcs = calculate({
        weight_kg:          Number(member.weight_kg),
        height_cm:          Number(member.height_cm),
        date_of_birth:      member.date_of_birth,
        sex:                member.sex,
        activity_level,
        primary_goal:       member.primary_goal,
        medical_conditions: medical,
        diet_type:          member.diet_type,
        ckd_stage:          member.ckd_stage ?? undefined,
        dialysis_status:    member.dialysis_status ?? undefined,
      }, isProteinHeavy ? { proteinFloorGPerKg: PROTEIN_HEAVY_G_PER_KG } : {})
    } catch (calcErr: any) {
      return fail(422, 'Failed to calculate nutrition targets.', { detail: calcErr?.message })
    }

    if (!calcs.can_auto_generate) {
      const blockReasons = calcs.warnings.filter((w: any) => w.severity === 'block').map((w: any) => w.message)
      return fail(422, 'Plan generation blocked. ' + blockReasons.join(' '), { block_reasons: blockReasons })
    }

    // ── 4. Meal frequency and meal targets ────────────────────────────────
    const requestedFrequency = Math.min(MAX_MEAL_FREQ,
      Math.max(MIN_MEAL_FREQ, Math.round(Number(member.meal_frequency) || DEFAULT_MEAL_FREQ)))
    let mealFrequency = requestedFrequency
    const effectiveKcal = override_kcal || calcs.target_kcal
    if (effectiveKcal > 3500 && mealFrequency < 5) mealFrequency = 5
    else if (effectiveKcal > 2800 && mealFrequency < 4) mealFrequency = 4
    const frequencyNote = mealFrequency !== requestedFrequency
      ? `Meals raised from ${requestedFrequency} to ${mealFrequency} per day because of the high calorie target.`
      : ''

    // ── 5. Clinical filters ───────────────────────────────────────────────
    const intolerances = toArr(member.food_intolerances)
    const symptoms     = toArr(member.gut_symptoms)
    const dislikeNames = toArr(member.disliked_foods)
    const allergyNames = toArr(member.allergies)

    const filters = buildClinicalFilters(
      medical, member.diet_type, member.spice_tolerance || 'moderate',
      member.max_prep_time_minutes || 60, intolerances, [], symptoms
    )

    let dayTargets: any
    try {
      dayTargets = allocateMealTargets(calcs, mealFrequency, override_kcal, filters.requireHeartburnSafe)
    } catch (targErr: any) {
      return fail(422, 'Failed to allocate meal targets.', { detail: targErr?.message })
    }

    const cuisinePreference = toArr(member.cuisine_preference)

    // ── 6. Fetch eligible recipes (global + gym's own) ────────────────────
    const dietType = member.diet_type || 'non_vegetarian'

    // Fetch global recipes (org_id is null)
    let globalQuery = supabase.from('recipes').select('*')
      .is('org_id', null)
      .eq('is_active', true)
      .contains('diet_type', [dietType])
      .lt('calories_kcal', 2000)
      .lt('fat_g', 100)
    globalQuery = applyRecipeFilters(globalQuery, filters)
    const { data: globalRecipes, error: recipeErr } = await globalQuery
    if (recipeErr) return fail(500, 'Failed to fetch recipes.', { detail: recipeErr.message })

    // Fetch gym's own custom recipes (org_id = member's org)
    let gymQuery = supabase.from('recipes').select('*')
      .eq('org_id', member.org_id)
      .eq('is_active', true)
      .contains('diet_type', [dietType])
    gymQuery = applyRecipeFilters(gymQuery, filters)
    const { data: gymRecipes } = await gymQuery

    // Merge — gym recipes are added to the pool (they can override or supplement global ones)
    const recipes = [...(globalRecipes ?? []), ...(gymRecipes ?? [])]

    if (!useIngredientMode && (!recipes || recipes.length === 0)) {
      return fail(422, 'No recipes match this member\'s diet type and medical conditions.')
    }

    const isSimpleTreatMode = member.meal_complexity === 'simple_treat'
    const TREAT_DAYS        = new Set([3, 7])

    // ── 7. Fetch ingredients, resolve dislikes and allergies to IDs ───────
    const { data: ingredientData, error: ingErr } = await supabase.from('ingredients').select('*')
    if (ingErr) console.warn('Failed to fetch ingredients:', ingErr.message)

    const ingredientRows: Record<number, any> = {}
    ingredientData?.forEach((i: any) => { ingredientRows[i.id] = i })

    const avoidNames = [...dislikeNames, ...allergyNames].map(d => d.toLowerCase())
    if (avoidNames.length > 0 && ingredientData) {
      const resolved = ingredientData
        .filter((ing: any) => avoidNames.some(d =>
          ing.food_name?.toLowerCase().includes(d) || ing.common_name?.toLowerCase().includes(d)))
        .map((ing: any) => ing.id)
      if (resolved.length > 0) {
        filters.excludedIngredientIds = [...new Set([...filters.excludedIngredientIds, ...resolved])]
      }
    }

    // ── 8. Post-fetch filters: spice, exclusions, gut symptoms ────────────
    const filteredRecipes = (recipes ?? []).filter((r: any) =>
      passesSpiceFilter(r, filters) && passesExclusionFilter(r, filters) && passesSymptomFilter(r, filters))

    if (!useIngredientMode && filteredRecipes.length === 0) {
      return fail(422, 'No recipes remain after applying this member\'s spice, allergy and intolerance settings.')
    }

    // ── 9. Group recipes by meal type ─────────────────────────────────────
    let recipesByMealType: Record<string, any[]> = {}
    filteredRecipes.forEach((r: any) => {
      const mts = Array.isArray(r.meal_type) ? r.meal_type : [r.meal_type || 'lunch']
      mts.forEach((t: string) => {
        if (!recipesByMealType[t]) recipesByMealType[t] = []
        recipesByMealType[t].push(r)
      })
    })

    // Protein heavy: prefer high-protein recipes in each slot
    if (isProteinHeavy) {
      const preferred: Record<string, any[]> = {}
      for (const [mt, pool] of Object.entries(recipesByMealType)) {
        const high = pool.filter((r: any) => r.is_high_protein || (r.protein_g || 0) >= HIGH_PROTEIN_MIN_G)
        preferred[mt] = high.length >= HIGH_PROTEIN_MIN_POOL ? high : pool
      }
      recipesByMealType = preferred
    }

    // ── 10. Coverage check before generation ─────────────────────────────
    const coverageSource = applyHeartburnDinnerFilter(recipesByMealType, filters)
    const coveragePool: Record<string, any[]> = {}
    for (const [mt, pool] of Object.entries(coverageSource)) {
      const simple = isSimpleTreatMode ? pool.filter((r: any) => r.is_simple) : pool
      coveragePool[mt] = (isSimpleTreatMode && simple.length < 10) ? pool : simple
    }
    const coverageCheck = checkRecipeCoverage(coveragePool, dayTargets, { planDays: plan_days, glucoseSensitive })

    if (!useIngredientMode && !coverageCheck.can_generate) {
      return fail(422, 'Not enough recipes to reach this member\'s calorie target. Try a calorie override or fewer conditions.', {
        error_type: 'CONTENT_GAP',
        summary: coverageCheck.summary,
      })
    }

    // ── 11. Previous plan (variety) + version number ──────────────────────
    const { data: previousPlans } = await supabase
      .from('member_diet_plans')
      .select('plan_json, version_number')
      .eq('member_id', member_id)
      .in('status', ['active', 'superseded'])
      .order('version_number', { ascending: false })
      .limit(1)

    const nextVersion = previousPlans && previousPlans.length > 0
      ? (previousPlans[0].version_number || 0) + 1
      : 1

    // ── 12. Build the weekly plan ─────────────────────────────────────────
    let weeklyPlan: Record<string, any>
    let emptySlots: string[] = []
    let validationSummary: string

    if (useIngredientMode) {
      weeklyPlan = buildIngredientWeeklyPlan({
        client, plan_days, dayTargets, ingredientRows, filters,
        glucoseSensitive, previousPlans: previousPlans ?? null, nextVersion,
      })
      validationSummary = 'Ingredient-based plan generated'
    } else {
      const result = buildRecipeWeeklyPlan({
        client, plan_days, dayTargets, recipesByMealType, ingredientRows, filters,
        cuisinePreference, glucoseSensitive, isSimpleTreatMode, TREAT_DAYS,
        previousPlans: previousPlans ?? null,
      })
      weeklyPlan = result.weeklyPlan
      emptySlots = result.emptySlots

      // ── 13. Validate every day ─────────────────────────────────────────
      const weekValidation = validateWeek(weeklyPlan, dayTargets)
      weekValidation.days.forEach((dv: any) => {
        if (weeklyPlan[dv.day_key]) {
          weeklyPlan[dv.day_key].validation = {
            status:       dv.status,
            message:      dv.message,
            target_kcal:  dayTargets.total_kcal,
            planned_kcal: dv.macro_validation.calories.planned,
            cal_gap_pct:  dv.macro_validation.calories.gap_pct,
          }
          weeklyPlan[dv.day_key].macro_validation = dv.macro_validation
        }
      })

      if (!weekValidation.valid) {
        return fail(422, emptySlots.length > 0
          ? `No recipes available for: ${emptySlots.join(', ')}. Add recipes for these meal types.`
          : 'The plan could not hit this member\'s targets. Try generating again.', {
          error_type: 'OPTIMIZATION_FAILURE',
          failed_days: weekValidation.failed_days,
        })
      }
      validationSummary = weekValidation.summary
    }

    // ── 14. Foods to avoid (deterministic) + optional AI guidelines ───────
    const foodsToAvoid = buildFoodsToAvoidRules(medical, filters)

    const guidelinesPrompt = `You are a nutrition assistant for an Indian gym.

Member profile:
- Goal: ${member.primary_goal}${isProteinHeavy ? ' (high protein plan)' : ''}
- Diet type: ${member.diet_type}
- Medical conditions: ${medical.join(', ') || 'None'}
- Activity level: ${activity_level}
- Gut symptoms: ${symptoms.join(', ') || 'None'}

These food restrictions are already applied to the plan:
${foodsToAvoid.map((r: any) => `- ${r.category}: ${r.examples.join(', ')}`).join('\n') || 'None'}

${coachNotesIn ? `Trainer instructions for this plan:\n${coachNotesIn}\n\n` : ''}Generate 5 practical, member-friendly guidelines. Focus on Indian food context, meal timing around training, hydration, and habits relevant to their goal and conditions. Do not contradict the restrictions above.

Return ONLY valid JSON, no markdown:
{ "general_guidelines": ["string", "string", "string", "string", "string"] }`

    const generalGuidelines = await fetchGuidelines(guidelinesPrompt, AI_TIMEOUT_MS)

    // ── 15. Plan JSON ─────────────────────────────────────────────────────
    const proteinRefWarning = calcs.warnings.find((w: any) => w.code === 'PROTEIN_REF_WEIGHT')
    const planJson = {
      engine_version:          'nayamai-port-1',
      plan_type:               useIngredientMode ? 'ingredient_based' : 'recipe_based',
      plan_mode,
      weekly_plan:             weeklyPlan,
      general_guidelines:      generalGuidelines,
      foods_to_avoid:          foodsToAvoid,
      conditions_applied:      medical,
      calc: {
        age:              calcs.age,
        bmr:              calcs.bmr,
        tdee:             calcs.tdee,
        activity_level,
        target_fiber_g:   calcs.target_fiber_g,
        protein_g_per_kg: isProteinHeavy ? PROTEIN_HEAVY_G_PER_KG : undefined,
        warnings:         calcs.warnings,
      },
      protein_ref_note:        proteinRefWarning?.message,
      validation_summary:      validationSummary,
      coverage_summary:        coverageCheck.summary,
      meal_frequency_used:     mealFrequency,
      empty_slots_skipped:     emptySlots.length > 0 ? emptySlots : undefined,
      meal_complexity:         member.meal_complexity || 'standard',
      treat_days:              isSimpleTreatMode ? [3, 7] : [],
      generated_by:            user.id,
    }

    // ── 16. Save ──────────────────────────────────────────────────────────
    const { plan: newPlan, error: insertErr } = await insertPlan(supabase, member_id, {
      member_id,
      org_id:           member.org_id,
      version_number:   nextVersion,
      status:           'active',
      valid_from:       startDate,
      start_date:       startDate,
      plan_mode,
      plan_days,
      target_kcal:      dayTargets.total_kcal,
      target_protein_g: dayTargets.total_protein_g,
      target_carbs_g:   dayTargets.total_carbs_g,
      target_fat_g:     dayTargets.total_fat_g,
      plan_json:        planJson,
      coach_notes:      [frequencyNote, coachNotesIn].filter(Boolean).join('\n') || null,
    })

    if (!newPlan) return fail(500, 'Plan was generated but could not be saved.', { detail: insertErr })

    return NextResponse.json({
      plan_id:    newPlan.id,
      version:    nextVersion,
      validation: validationSummary,
    })

  } catch (err: any) {
    console.error('Plan generation unexpected error:', err)
    return fail(500, 'An unexpected error occurred.', { detail: err?.message })
  }
}

// lib/nutrition/calculations.ts (ported from Nayamai, Psync additions marked)
// Mifflin-St Jeor BMR + TDEE + macro targets
//
// Clinical references:
// - BMR: Mifflin MD et al. (1990) AJCN 51:241-247
//   Note: ICMR-NIN 2020 found lower BMR/activity costs in Indian adults vs
//   Western populations. Mifflin used as starting estimate; calibrate against
//   actual client weight trend.
// - Protein: Morton RW et al. (2018) BJSM — estimated breakpoint ~1.62g/kg/d
//   for FFM gains (95% CI 1.03-2.20). Indian RDA: 0.83g/kg (ICMR-NIN 2020).
//   Therapeutic targets above RDA used for body composition goals.
//   Maintenance/healthy eating use 1.0g/kg as a practical product target,
//   modestly above the ICMR-NIN adult RDA of 0.83g/kg.
// - Fat: Product defaults. ICMR-NIN 2024 dietary guidelines support ~30% fat.
// - Fiber: 14g/1000kcal planning heuristic — aligned with ICMR-NIN 2024
//   dietary guidelines and IOM. Adult sex/age minimums from IOM AI applied.
// - CKD protein: ADA Standards of Care 2026 — 0.8g/kg for CKD G3+ non-dialysis,
//   1.0-1.2g/kg for dialysis patients.

export type WarningSeverity = 'info' | 'review' | 'block'

export interface CalculationWarning {
  code: string
  severity: WarningSeverity
  message: string
}

export type Sex = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active'
export type PrimaryGoal = 'fat_loss' | 'muscle_gain' | 'weight_gain' | 'maintenance' | 'healthy_eating'
export type DietType = 'vegetarian' | 'eggetarian' | 'non_vegetarian' | 'vegan' | 'jain'
export type CKDStage = 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5'
export type DialysisStatus = 'none' | 'hemodialysis' | 'peritoneal'

// Future: replace medical_conditions string[] with this structured interface.
// medical_conditions is still used for thyroid, cholesterol, hypertension, GERD.
// CKD is already partially structured via ckd_stage/dialysis_status fields.
// Migrating to ClinicalProfile will make meal-generation rules safer to maintain.
export interface ClinicalProfile {
  diabetes?: boolean
  hypertension?: boolean
  dyslipidemia?: boolean
  hypothyroidism?: boolean
  hyperthyroidism?: boolean
  gerd?: boolean
  ckd?: {
    stage: CKDStage
    dialysis: DialysisStatus
  }
}

export interface ClientMetrics {
  weight_kg: number
  height_cm: number
  date_of_birth: string
  sex: Sex | string          // string fallback for runtime safety
  activity_level: ActivityLevel | string
  primary_goal: PrimaryGoal | string
  medical_conditions: string[]  // TODO: migrate to ClinicalProfile
  diet_type?: DietType
  ckd_stage?: CKDStage
  dialysis_status?: DialysisStatus
}

export interface CalculationResult {
  age: number
  bmr: number
  tdee: number
  target_kcal: number
  target_protein_g: number
  target_carbs_g: number
  target_fat_g: number
  target_fiber_g: number
  warnings: CalculationWarning[]
  can_auto_generate: boolean
}

// Psync addition (12 Oct 2026): protein heavy plan mode.
// Raises protein to at least 2.4 g/kg of reference weight, whatever the goal.
// Calories and fat still follow the member's goal, so carbs absorb the change.
// CKD limits still win: they are applied after this floor.
export const PROTEIN_HEAVY_G_PER_KG = 2.4

export interface CalculateOptions {
  proteinFloorGPerKg?: number
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary:         1.20,
  lightly_active:    1.375,
  moderately_active: 1.55,
  very_active:       1.725,
  extra_active:      1.90,
}

const CALORIE_ADJUSTMENTS: Record<string, number> = {
  fat_loss:      -400,
  muscle_gain:    300,
  weight_gain:    450,
  maintenance:      0,
  healthy_eating:   0,
}

const CALORIE_REVIEW_THRESHOLD: Record<string, number> = {
  fat_loss:       1200,
  muscle_gain:    1600,
  weight_gain:    1800,
  maintenance:    1200,
  healthy_eating: 1200,
}

const FAT_PCT: Record<string, number> = {
  fat_loss:       0.25,
  muscle_gain:    0.28,
  weight_gain:    0.30,
  maintenance:    0.27,
  healthy_eating: 0.27,
}

const PROTEIN_G_PER_KG: Record<string, number> = {
  fat_loss:       1.6,
  muscle_gain:    1.8,
  weight_gain:    1.4,
  maintenance:    1.0,
  healthy_eating: 1.0,
}

// Glucose-sensitive (28 Sep 2026): T2D, prediabetes, insulin resistance.
// PCOS added 5 Oct 2026.
// Same match as generate-plan route.ts so both agree on who is flagged.
// Product choice: protein floor 1.2 g/kg and fat 30%, so carbs (the residual)
// drop from ~58% to ~52% of calories for a healthy_eating client. Higher goal
// protein (e.g. fat_loss 1.6) is kept. CKD protein limits always win.
const GLUCOSE_PROTEIN_FLOOR = 1.2
const GLUCOSE_FAT_PCT       = 0.30
const isGlucoseSensitive = (conditions: string[]) =>
  conditions.some(c => /diabet|insulin|pcos/i.test(String(c)))

// Condition matching is case and format-proof (5 Oct 2026): the DB had
// 'pcos', 'hypertension', 'type_2_diabetes' mixed with proper case, and
// exact matches silently skipped rules for those clients.
const norm = (s: string) =>
  String(s).toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim()

// Protein reference weight (5 Oct 2026): protein is calculated on
// min(actual weight, weight at BMI 23 for the client's height). 23 is the
// Asia-Pacific overweight cutoff used by ICMR. Stops protein targets being
// inflated by fat mass for overweight clients.
const PROTEIN_REF_BMI = 23

// Exact match only — avoids false positives from "kidney stones",
// "family history of kidney disease", "kidney transplant" etc.
const CKD_CONDITIONS = [
  'Chronic Kidney Disease',
  'CKD',
  'Renal Failure',
  'Renal Insufficiency',
  'End Stage Renal Disease',
  'ESRD',
]

function isValidDateString(dob: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false
  const [year, month, day] = dob.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date()  // block future DOBs
  )
}

function validateClient(client: ClientMetrics): CalculationWarning[] {
  const errors: CalculationWarning[] = []

  if (!Number.isFinite(client.weight_kg) || client.weight_kg <= 0 || client.weight_kg > 500) {
    errors.push({ code: 'INVALID_WEIGHT', severity: 'block', message: 'Weight must be a positive number.' })
  }
  if (!Number.isFinite(client.height_cm) || client.height_cm <= 0 || client.height_cm > 300) {
    errors.push({ code: 'INVALID_HEIGHT', severity: 'block', message: 'Height must be a positive number.' })
  }
  if (!isValidDateString(client.date_of_birth)) {
    errors.push({ code: 'INVALID_DOB', severity: 'block', message: 'Date of birth is invalid or in the future.' })
  }
  if (!['male', 'female'].includes(client.sex)) {
    errors.push({ code: 'INVALID_SEX', severity: 'block', message: 'Sex must be specified as male or female. BMR calculation requires biological sex.' })
  }
  if (!ACTIVITY_MULTIPLIERS[client.activity_level]) {
    errors.push({ code: 'INVALID_ACTIVITY', severity: 'block', message: `Unrecognised activity level: "${client.activity_level}".` })
  }
  if (!Object.hasOwn(CALORIE_ADJUSTMENTS, client.primary_goal)) {
    errors.push({ code: 'INVALID_GOAL', severity: 'block', message: `Unrecognised primary goal: "${client.primary_goal}".` })
  }
  if (client.dialysis_status && client.dialysis_status !== 'none' && !client.ckd_stage) {
    errors.push({ code: 'DIALYSIS_WITHOUT_CKD_STAGE', severity: 'block', message: 'Dialysis status provided without CKD stage. Confirm clinical details before generating a plan.' })
  }

  return errors
}

function getAge(dob: string): number {
  const [year, month, day] = dob.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - year
  const birthdayPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day)
  if (!birthdayPassed) age--
  return age
}

function getFiberTarget(kcal: number, sex: string, age: number): number {
  const byCalories = Math.round((kcal / 1000) * 14)
  if (age < 18) return byCalories
  if (sex !== 'male' && sex !== 'female') return byCalories
  const adultMinimum = sex === 'male'
    ? (age >= 51 ? 30 : 38)
    : (age >= 51 ? 21 : 25)
  return Math.max(byCalories, adultMinimum)
}

export function calculate(client: ClientMetrics, options: CalculateOptions = {}): CalculationResult {
  const warnings: CalculationWarning[] = []

  // ── Input validation ─────────────────────────────────────────────────
  const validationErrors = validateClient(client)
  if (validationErrors.length > 0) {
    warnings.push(...validationErrors)
    if (validationErrors.some(e => e.severity === 'block')) {
      return {
        age: 0, bmr: 0, tdee: 0,
        target_kcal: 0, target_protein_g: 0,
        target_carbs_g: 0, target_fat_g: 0, target_fiber_g: 0,
        warnings,
        can_auto_generate: false,
      }
    }
  }

  const age = getAge(client.date_of_birth)
  const { weight_kg, height_cm, sex, activity_level, primary_goal, medical_conditions } = client
  const conditions = medical_conditions ?? []
  const condSet = conditions.map(norm)
  const has = (list: string[]) => list.some(x => condSet.includes(norm(x)))

  // ── Under-18 hard block ──────────────────────────────────────────────
  if (age < 18) {
    warnings.push({
      code: 'UNDER_18',
      severity: 'block',
      message: 'Client is under 18. Adult nutrition calculations must not be used. Refer to a paediatric dietitian.',
    })
    return {
      age, bmr: 0, tdee: 0,
      target_kcal: 0, target_protein_g: 0,
      target_carbs_g: 0, target_fat_g: 0, target_fiber_g: 0,
      warnings,
      can_auto_generate: false,
    }
  }

  // ── BMR (Mifflin-St Jeor) ────────────────────────────────────────────
  let bmr: number
  if (sex === 'female') {
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) - 161
  } else {
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age) + 5
  }

  // ── TDEE ─────────────────────────────────────────────────────────────
  const multiplier = ACTIVITY_MULTIPLIERS[activity_level] ?? 1.375
  const tdee = Math.round(bmr * multiplier)

  if (has(['Hypothyroidism', 'Hyperthyroidism'])) {
    warnings.push({
      code: 'THYROID_CONDITION',
      severity: 'review',
      message: 'Thyroid condition detected — calorie target may need adjustment based on treatment status and TSH levels. Review with client.',
    })
  }

  // ── Calorie target ───────────────────────────────────────────────────
  const adjustment = CALORIE_ADJUSTMENTS[primary_goal] ?? 0
  const target_kcal = tdee + adjustment

  const reviewThreshold = CALORIE_REVIEW_THRESHOLD[primary_goal] ?? 1200
  if (target_kcal < reviewThreshold) {
    warnings.push({
      code: 'CALORIE_BELOW_THRESHOLD',
      severity: 'block',
      message: `Calculated target (${target_kcal} kcal) is unusually low. Review client stats before generating a plan.`,
    })
  }

  // ── Protein ──────────────────────────────────────────────────────────
  let proteinPerKg = PROTEIN_G_PER_KG[primary_goal] ?? 1.0
  const glucoseSensitive = isGlucoseSensitive(conditions)
  if (options.proteinFloorGPerKg) {
    proteinPerKg = Math.max(proteinPerKg, options.proteinFloorGPerKg)
  }
  if (glucoseSensitive) {
    proteinPerKg = Math.max(proteinPerKg, GLUCOSE_PROTEIN_FLOOR)
    warnings.push({
      code: 'GLUCOSE_SENSITIVE',
      severity: 'info',
      message: 'Diabetes, insulin resistance or PCOS: protein raised to at least 1.2 g/kg and fat set to 30%, lowering the carb share. Spread carbs evenly across meals.',
    })
  }

  // CKD detection — structured fields take precedence over condition strings
  const hasCKD =
    has(CKD_CONDITIONS) ||
    client.ckd_stage !== undefined ||
    (client.dialysis_status !== undefined && client.dialysis_status !== 'none')

  if (hasCKD) {
    const ckdStage = client.ckd_stage
    const onDialysis = client.dialysis_status === 'hemodialysis' ||
                       client.dialysis_status === 'peritoneal'
    const isG3orHigher = ckdStage && ['G3a','G3b','G4','G5'].includes(ckdStage)

    if (onDialysis) {
      proteinPerKg = 1.0
      warnings.push({
        code: 'CKD_DIALYSIS',
        severity: 'block',
        message: 'Dialysis patient — protein target requires clinician review before plan generation. ADA 2026 supports 1.0-1.2g/kg/day for dialysis patients.',
      })
    } else if (isG3orHigher) {
      proteinPerKg = 0.8
      warnings.push({
        code: `CKD_${ckdStage}`,
        severity: 'block',
        message: `CKD ${ckdStage} (non-dialysis) — protein set to 0.8g/kg/day as a starting point per ADA 2026. Confirm target with treating clinician before generating a plan.`,
      })
    } else if (ckdStage) {
      warnings.push({
        code: 'CKD_EARLY_STAGE',
        severity: 'review',
        message: `CKD ${ckdStage} detected — no protein restriction applied at this stage, but clinical context should be confirmed. Monitor renal function regularly.`,
      })
    } else {
      proteinPerKg = 0.8
      warnings.push({
        code: 'CKD_STAGE_UNKNOWN',
        severity: 'block',
        message: 'CKD detected but stage is unknown. Confirm CKD stage and dialysis status before generating a plan.',
      })
    }
  }

  const refWeight = Math.min(weight_kg, PROTEIN_REF_BMI * (height_cm / 100) ** 2)
  if (refWeight < weight_kg) {
    warnings.push({
      code: 'PROTEIN_REF_WEIGHT',
      severity: 'info',
      message: `Protein calculated on ${refWeight.toFixed(1)} kg (BMI 23 reference weight), not actual weight.`,
    })
  }
  const target_protein_g = Math.round(refWeight * proteinPerKg)

  // ── Fat ──────────────────────────────────────────────────────────────
  const fatPct = glucoseSensitive
    ? Math.max(FAT_PCT[primary_goal] ?? 0.27, GLUCOSE_FAT_PCT)
    : (FAT_PCT[primary_goal] ?? 0.27)
  const target_fat_g = Math.round((target_kcal * fatPct) / 9)

  if (has(['High Cholesterol'])) {
    warnings.push({ code: 'HIGH_CHOLESTEROL', severity: 'info', message: 'High Cholesterol — prioritise unsaturated fats and limit saturated fat in food selection.' })
  }
  if (has(['Hypertension'])) {
    warnings.push({ code: 'HYPERTENSION', severity: 'info', message: 'Hypertension — limit sodium-rich foods in meal generation.' })
  }
  if (has(['GERD'])) {
    warnings.push({ code: 'GERD', severity: 'info', message: "GERD — use smaller meals and avoid the client's identified reflux triggers. Apply meal timing and food-selection rules during meal generation." })
  }

  // ── Carbs (residual after protein + fat) ────────────────────────────
  const proteinCals = target_protein_g * 4
  const fatCals = target_fat_g * 9
  const remainingCals = target_kcal - proteinCals - fatCals

  if (remainingCals < 0) {
    warnings.push({
      code: 'MACRO_OVERFLOW',
      severity: 'block',
      message: `Protein (${target_protein_g}g) and fat (${target_fat_g}g) targets exceed total calorie budget (${target_kcal} kcal). Macro targets require review.`,
    })
  }

  const target_carbs_g = Math.max(0, Math.round(remainingCals / 4))

  // ── Macro reconciliation ─────────────────────────────────────────────
  const macroCals = (target_protein_g * 4) + (target_carbs_g * 4) + (target_fat_g * 9)
  if (Math.abs(macroCals - target_kcal) > 10) {
    warnings.push({
      code: 'MACRO_RECONCILIATION',
      severity: 'review',
      message: `Macro calories (${macroCals} kcal) do not reconcile with calorie target (${target_kcal} kcal). Review macro distribution.`,
    })
  }

  // ── Fiber ────────────────────────────────────────────────────────────
  const target_fiber_g = getFiberTarget(target_kcal, sex, age)

  const can_auto_generate = !warnings.some(w => w.severity === 'block')

  return {
    age,
    bmr: Math.round(bmr),
    tdee,
    target_kcal,
    target_protein_g,
    target_carbs_g,
    target_fat_g,
    target_fiber_g,
    warnings,
    can_auto_generate,
  }
}

// lib/nutrition/intake.ts
// Activity level from job type + exercise days (same rules as Nayamai intake).
//
// Base by job:   desk = sedentary, on_feet = lightly_active, physical = moderately_active
// Exercise days: 0 = +0, 1-3 = +1, 4-6 = +2, 7 = +3
// Trains twice a day: +1
// Capped at extra_active.

const LEVELS = [
  'sedentary',
  'lightly_active',
  'moderately_active',
  'very_active',
  'extra_active',
] as const

export type ActivityLevel = typeof LEVELS[number]

const JOB_BASE: Record<string, number> = {
  desk: 0,
  on_feet: 1,
  physical: 2,
}

export function mapActivityLevel(
  exerciseDaysPerWeek: number | null | undefined,
  jobActivity: string | null | undefined,
  trainsTwiceDaily: boolean = false,
): ActivityLevel {
  const days = Math.max(0, Math.min(7, Math.round(Number(exerciseDaysPerWeek) || 0)))
  const base = JOB_BASE[jobActivity ?? 'desk'] ?? 0

  let bump = 0
  if (days >= 7) bump = 3
  else if (days >= 4) bump = 2
  else if (days >= 1) bump = 1

  if (trainsTwiceDaily) bump += 1

  const idx = Math.min(LEVELS.length - 1, base + bump)
  return LEVELS[idx]
}

export const JOB_ACTIVITY_OPTIONS = [
  { value: 'desk', label: 'Desk job (sedentary)' },
  { value: 'on_feet', label: 'On feet most of the day' },
  { value: 'physical', label: 'Physical / manual work' },
]

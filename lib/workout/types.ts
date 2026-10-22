// lib/workout/types.ts

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'arms'
  | 'legs' | 'core' | 'cardio' | 'full_body'

export type Equipment =
  | 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'
  | 'cardio_machine' | 'kettlebell' | 'resistance_band' | 'other'

export type MovementType = 'compound' | 'isolation' | 'cardio' | 'flexibility'

export type WorkoutGoal =
  | 'fat_loss' | 'muscle_gain' | 'strength'
  | 'endurance' | 'general_fitness'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

// Exercise category — multi-select, stored as text[] on workout_exercises.category.
// The 8 below are the suggested/known set (get an icon + a fixed label in the UI).
// Gyms can also add their own free-form tags (see "Custom" in the category picker) —
// those are just lowercase_snake strings, not part of this union, so ExerciseCategory
// is a hint for the common case, not an exhaustive type. Use `string` when reading
// `category` off a real row.
export const EXERCISE_CATEGORIES = [
  'strength', 'cardio', 'yoga', 'pilates',
  'mobility', 'functional_hiit', 'bodyweight', 'sports',
] as const
export type ExerciseCategory = typeof EXERCISE_CATEGORIES[number]

export interface WorkoutExercise {
  id: string
  org_id: string | null
  name: string
  muscle_group: MuscleGroup
  equipment: Equipment
  movement_type: MovementType
  category: string[]
  description: string | null
  image_url: string | null
  video_url: string | null
  is_active?: boolean          // false = archived (hidden from pickers, kept for old plans)
  created_at: string
}

// Category rows live in exercise_categories (org_id null = built-in, set = this gym's).
// workout_exercises.category stores the slugs; this table supplies name + colour.
export type CategoryColor = 'blue' | 'cyan' | 'sky' | 'teal' | 'indigo' | 'gray'
export const CATEGORY_COLORS: CategoryColor[] = ['blue', 'cyan', 'sky', 'teal', 'indigo', 'gray']

export interface ExerciseCategoryRow {
  id: string
  org_id: string | null
  slug: string
  name: string
  color: CategoryColor
  sort_order: number
  created_at: string
}

export interface WorkoutProgram {
  id: string
  org_id: string | null       // null = global template
  created_by: string | null
  name: string
  goal: WorkoutGoal
  difficulty: Difficulty
  days_per_week: number
  duration_weeks: number
  is_template: boolean
  notes: string | null
  status: 'active' | 'archived'
  created_at: string
  updated_at: string
  // joined
  days?: WorkoutProgramDay[]
  assigned_count?: number
}

export interface WorkoutProgramDay {
  id: string
  program_id: string
  day_number: number
  day_name: string
  focus: string | null
  created_at: string
  // joined
  items?: WorkoutProgramItem[]
}

export interface WorkoutProgramItem {
  id: string
  day_id: string
  exercise_id: string
  sort_order: number
  sets: number
  reps: string
  weight_kg: number | null
  duration_sec: number | null
  rest_sec: number
  notes: string | null
  created_at: string
  // joined
  exercise?: WorkoutExercise
}

export interface MemberWorkoutProgram {
  id: string
  org_id: string
  member_id: string
  program_id: string
  assigned_by: string | null
  valid_from: string
  valid_until: string | null
  status: 'active' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
}

// ---- UI helpers ----

export const GOAL_LABELS: Record<WorkoutGoal, string> = {
  fat_loss:        'Fat Loss',
  muscle_gain:     'Muscle Gain',
  strength:        'Strength',
  endurance:       'Endurance',
  general_fitness: 'General Fitness',
}

export const GOAL_BADGE: Record<WorkoutGoal, string> = {
  fat_loss:        'ps-badge--amber',
  muscle_gain:     'ps-badge--purple',
  strength:        'ps-badge--red',
  endurance:       'ps-badge--green',
  general_fitness: 'ps-badge--blue',
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner:     'Beginner',
  intermediate: 'Intermediate',
  advanced:     'Advanced',
}

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  arms: 'Arms', legs: 'Legs', core: 'Core',
  cardio: 'Cardio', full_body: 'Full Body',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barbell', dumbbell: 'Dumbbell', machine: 'Machine',
  cable: 'Cable', bodyweight: 'Bodyweight', cardio_machine: 'Cardio Machine',
  kettlebell: 'Kettlebell', resistance_band: 'Resistance Band', other: 'Other',
}

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  compound: 'Compound', isolation: 'Isolation', cardio: 'Cardio', flexibility: 'Flexibility',
}

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  yoga: 'Yoga',
  pilates: 'Pilates',
  mobility: 'Mobility',
  functional_hiit: 'Functional / HIIT',
  bodyweight: 'Bodyweight',
  sports: 'Sports',
}

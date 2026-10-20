// lib/workout/types.ts

export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'arms'
  | 'legs' | 'core' | 'cardio' | 'full_body'

export type Equipment =
  | 'barbell' | 'dumbbell' | 'machine'
  | 'cable' | 'bodyweight' | 'cardio_machine'

export type MovementType = 'compound' | 'isolation' | 'cardio' | 'flexibility'

export type WorkoutGoal =
  | 'fat_loss' | 'muscle_gain' | 'strength'
  | 'endurance' | 'general_fitness'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export interface WorkoutExercise {
  id: string
  org_id: string | null
  name: string
  muscle_group: MuscleGroup
  equipment: Equipment
  movement_type: MovementType
  description: string | null
  video_url: string | null
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
}

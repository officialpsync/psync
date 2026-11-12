// app/portal/types.ts
// Shared types for the client-facing Psync gym member portal.
// Compatible with existing Supabase tables (members, memberships, member_workout_programs,
// member_diet_plans, classes, class_bookings, attendance_logs, payments).

export type PortalTab = "pass" | "workout" | "diet" | "classes" | "profile";

export interface PortalMember {
  id: string;
  org_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  sex: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  primary_goal: string | null;
  medical_conditions: string[] | null;
  diet_type: string | null;
  job_activity: string | null;
  exercise_days_per_week: number | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  branches?: { name: string; address?: string | null; phone?: string | null } | null;
}

export interface PortalMembership {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  membership_plans?: {
    name: string;
    duration_days: number | null;
    price_paise?: number;
  } | null;
}

export interface PortalAttendanceLog {
  id: string;
  check_in_at: string;
  check_out_at: string | null;
  method: string | null;
}

export interface PortalPayment {
  id: string;
  amount_paise?: number;
  total_paise: number;
  paid_at: string;
  method: string | null;
  status: string;
  notes: string | null;
}

export interface PortalWorkoutItem {
  id: string;
  day_id: string;
  exercise_id: string;
  sort_order: number;
  sets: number;
  reps: string;
  weight_kg: number | null;
  duration_sec: number | null;
  rest_sec: number;
  notes?: string | null;
  exercise?: {
    id: string;
    name: string;
    muscle_group: string;
    equipment: string;
    movement_type: string;
    image_url: string | null;
    video_url: string | null;
    description: string | null;
  } | null;
}

export interface PortalWorkoutDay {
  id: string;
  program_id: string;
  day_number: number;
  day_name: string;
  focus: string | null;
  items?: PortalWorkoutItem[];
}

export interface PortalWorkoutProgram {
  id: string;
  program_id: string;
  status: string;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  workout_programs?: {
    id: string;
    name: string;
    goal: string;
    difficulty: string;
    days_per_week: number;
    duration_weeks: number;
    notes: string | null;
    days?: PortalWorkoutDay[];
  } | null;
}

export interface PortalDietAlternate {
  recipe_id?: string;
  recipe_name?: string;
  meal_label?: string;
  portion?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients?: { ingredient_name?: string; quantity_grams?: number }[];
}

export interface PortalDietMeal {
  meal_type: string;
  time?: string | null;
  recipe_name?: string | null;
  meal_label?: string;
  portion?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients?: { ingredient_name?: string; quantity_grams?: number; is_optional?: boolean }[];
  food_items?: { food_name: string; quantity_grams: number; natural_quantity?: string; calories: number }[];
  alternates?: PortalDietAlternate[];
}

export interface PortalDietPlan {
  id: string;
  member_id: string;
  version_number: number;
  status: string;
  start_date: string;
  target_kcal: number;
  target_protein_g: number;
  target_carbs_g: number;
  target_fat_g: number;
  coach_notes: string | null;
  plan_json?: {
    meals?: PortalDietMeal[];
    day_total?: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
    general_guidelines?: string[];
  } | null;
}

export interface PortalClass {
  id: string;
  org_id: string;
  name: string;
  trainer_name: string | null;
  schedule_day: string;
  start_time: string;
  duration_mins: number;
  capacity?: number;
  color: string;
  is_active: boolean;
}

export interface PortalClassBooking {
  id: string;
  class_id: string;
  member_id: string;
  booked_for: string;
  status: string;
  created_at: string;
  classes?: PortalClass | null;
}

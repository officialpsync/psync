// lib/workout/exerciseImages.ts
// Single source of truth for exercise images. Used by WorkoutDayTabs (plan view)
// and the template preview page. Every alias target below is a real folder in
// the exercise-images bucket (validated against lib/exerciseImageMap.ts).

import exerciseImageMap from "@/lib/exerciseImageMap"

export const EXERCISE_IMAGE_CDN =
  "https://kqtgunwyenhfzfwpjuyo.supabase.co/storage/v1/object/public/exercise-images"

/**
 * Gym-friendly names → bucket folder ID. Checked first.
 * Keys are written naturally; they are normalised before lookup, so
 * "Pull-Ups", "pull ups" and "pullup" all hit the same entry.
 */
const ALIASES: Record<string, string> = {
  // ── Chest ──
  "barbell bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "flat bench press": "Barbell_Bench_Press_-_Medium_Grip",
  "incline bench press": "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "incline barbell bench press": "Barbell_Incline_Bench_Press_-_Medium_Grip",
  "decline bench press": "Decline_Barbell_Bench_Press",
  "dumbbell bench press": "Dumbbell_Bench_Press",
  "dumbbell press": "Dumbbell_Bench_Press",
  "incline dumbbell press": "Incline_Dumbbell_Press",
  "incline dumbbell bench press": "Incline_Dumbbell_Press",
  "dumbbell fly": "Dumbbell_Flyes",
  "dumbbell flye": "Dumbbell_Flyes",
  "incline dumbbell fly": "Incline_Dumbbell_Flyes",
  "cable fly": "Cable_Crossover",
  "cable flye": "Cable_Crossover",
  "flat bench cable fly": "Flat_Bench_Cable_Flyes",
  "cable crossover": "Cable_Crossover",
  "pec deck": "Butterfly",
  "pec fly": "Butterfly",
  "machine fly": "Butterfly",
  "chest fly machine": "Butterfly",
  "chest press": "Leverage_Chest_Press",
  "machine chest press": "Leverage_Chest_Press",
  "chest press machine": "Leverage_Chest_Press",
  "push up": "Pushups",
  "pushup": "Pushups",
  "incline push up": "Incline_Push-Up",
  "decline push up": "Decline_Push-Up",
  "knee push up": "Incline_Push-Up",
  "chest dip": "Dips_-_Chest_Version",
  "dip": "Dips_-_Triceps_Version",
  "parallel bar dip": "Parallel_Bar_Dip",

  // ── Back ──
  "pull up": "Pullups",
  "pullup": "Pullups",
  "chin up": "Chin-Up",
  "assisted pull up": "Band_Assisted_Pull-Up",
  "lat pulldown": "Wide-Grip_Lat_Pulldown",
  "lat pull down": "Wide-Grip_Lat_Pulldown",
  "wide grip lat pulldown": "Wide-Grip_Lat_Pulldown",
  "close grip lat pulldown": "Close-Grip_Front_Lat_Pulldown",
  "barbell bent over row": "Bent_Over_Barbell_Row",
  "bent over row": "Bent_Over_Barbell_Row",
  "barbell row": "Bent_Over_Barbell_Row",
  "dumbbell row": "One-Arm_Dumbbell_Row",
  "one arm dumbbell row": "One-Arm_Dumbbell_Row",
  "single arm dumbbell row": "One-Arm_Dumbbell_Row",
  "dumbbell bent over row": "Bent_Over_Two-Dumbbell_Row",
  "seated cable row": "Seated_Cable_Rows",
  "cable row": "Seated_Cable_Rows",
  "seated row": "Seated_Cable_Rows",
  "t bar row": "T-Bar_Row_with_Handle",
  "inverted row": "Inverted_Row",
  "face pull": "Face_Pull",
  "straight arm pulldown": "Straight-Arm_Pulldown",
  "deadlift": "Barbell_Deadlift",
  "barbell deadlift": "Barbell_Deadlift",
  "conventional deadlift": "Barbell_Deadlift",
  "sumo deadlift": "Sumo_Deadlift",
  "trap bar deadlift": "Trap_Bar_Deadlift",
  "back extension": "Hyperextensions_Back_Extensions",
  "hyperextension": "Hyperextensions_Back_Extensions",
  "superman": "Superman",
  "shrug": "Barbell_Shrug",
  "barbell shrug": "Barbell_Shrug",
  "dumbbell shrug": "Dumbbell_Shrug",

  // ── Shoulders ──
  "overhead press": "Standing_Military_Press",
  "barbell overhead press": "Standing_Military_Press",
  "military press": "Standing_Military_Press",
  "ohp": "Standing_Military_Press",
  "shoulder press": "Dumbbell_Shoulder_Press",
  "dumbbell shoulder press": "Dumbbell_Shoulder_Press",
  "seated dumbbell press": "Seated_Dumbbell_Press",
  "machine shoulder press": "Machine_Shoulder_Military_Press",
  "arnold press": "Arnold_Dumbbell_Press",
  "lateral raise": "Side_Lateral_Raise",
  "dumbbell lateral raise": "Side_Lateral_Raise",
  "side lateral raise": "Side_Lateral_Raise",
  "cable lateral raise": "Cable_Seated_Lateral_Raise",
  "front raise": "Front_Dumbbell_Raise",
  "dumbbell front raise": "Front_Dumbbell_Raise",
  "rear delt fly": "Reverse_Flyes",
  "reverse fly": "Reverse_Flyes",
  "rear delt raise": "Seated_Bent-Over_Rear_Delt_Raise",
  "upright row": "Upright_Barbell_Row",

  // ── Arms ──
  "barbell curl": "Barbell_Curl",
  "bicep curl": "Dumbbell_Bicep_Curl",
  "biceps curl": "Dumbbell_Bicep_Curl",
  "dumbbell curl": "Dumbbell_Bicep_Curl",
  "dumbbell bicep curl": "Dumbbell_Bicep_Curl",
  "ez bar curl": "EZ-Bar_Curl",
  "hammer curl": "Hammer_Curls",
  "dumbbell hammer curl": "Hammer_Curls",
  "preacher curl": "Preacher_Curl",
  "concentration curl": "Concentration_Curls",
  "cable curl": "Standing_Biceps_Cable_Curl",
  "tricep pushdown": "Triceps_Pushdown",
  "triceps pushdown": "Triceps_Pushdown",
  "cable pushdown": "Triceps_Pushdown",
  "rope pushdown": "Triceps_Pushdown_-_Rope_Attachment",
  "tricep rope pushdown": "Triceps_Pushdown_-_Rope_Attachment",
  "skull crusher": "EZ-Bar_Skullcrusher",
  "skullcrusher": "EZ-Bar_Skullcrusher",
  "lying tricep extension": "Lying_Triceps_Press",
  "overhead tricep extension": "Standing_Dumbbell_Triceps_Extension",
  "tricep extension": "Standing_Dumbbell_Triceps_Extension",
  "triceps extension": "Standing_Dumbbell_Triceps_Extension",
  "tricep kickback": "Tricep_Dumbbell_Kickback",
  "close grip bench press": "Close-Grip_Barbell_Bench_Press",
  "bench dip": "Bench_Dips",
  "tricep dip": "Dips_-_Triceps_Version",

  // ── Legs ──
  "squat": "Barbell_Squat",
  "barbell squat": "Barbell_Squat",
  "back squat": "Barbell_Squat",
  "front squat": "Front_Squat_Clean_Grip",
  "goblet squat": "Goblet_Squat",
  "bodyweight squat": "Bodyweight_Squat",
  "air squat": "Bodyweight_Squat",
  "jump squat": "Freehand_Jump_Squat",
  "hack squat": "Hack_Squat",
  "leg press": "Leg_Press",
  "leg extension": "Leg_Extensions",
  "leg curl": "Lying_Leg_Curls",
  "lying leg curl": "Lying_Leg_Curls",
  "seated leg curl": "Seated_Leg_Curl",
  "romanian deadlift": "Romanian_Deadlift",
  "rdl": "Romanian_Deadlift",
  "stiff leg deadlift": "Stiff-Legged_Barbell_Deadlift",
  "lunge": "Dumbbell_Lunges",
  "dumbbell lunge": "Dumbbell_Lunges",
  "barbell lunge": "Barbell_Lunge",
  "walking lunge": "Bodyweight_Walking_Lunge",
  "reverse lunge": "Dumbbell_Rear_Lunge",
  "bulgarian split squat": "Split_Squat_with_Dumbbells",
  "split squat": "Split_Squats",
  "step up": "Dumbbell_Step_Ups",
  "box step up": "Dumbbell_Step_Ups",
  "hip thrust": "Barbell_Hip_Thrust",
  "barbell hip thrust": "Barbell_Hip_Thrust",
  "glute bridge": "Barbell_Glute_Bridge",
  "bodyweight glute bridge": "Butt_Lift_Bridge",
  "single leg glute bridge": "Single_Leg_Glute_Bridge",
  "glute kickback": "Glute_Kickback",
  "calf raise": "Standing_Calf_Raises",
  "standing calf raise": "Standing_Calf_Raises",
  "seated calf raise": "Seated_Calf_Raise",
  "hip adduction": "Thigh_Adductor",
  "hip abduction": "Thigh_Abductor",
  "good morning": "Good_Morning",
  "wall sit": "Chair_Squat",

  // ── Core ──
  "plank": "Plank",
  "side plank": "Side_Bridge",
  "crunch": "Crunches",
  "bicycle crunch": "Air_Bike",
  "reverse crunch": "Reverse_Crunch",
  "cable crunch": "Cable_Crunch",
  "sit up": "Sit-Up",
  "russian twist": "Russian_Twist",
  "hanging leg raise": "Hanging_Leg_Raise",
  "leg raise": "Flat_Bench_Lying_Leg_Raise",
  "lying leg raise": "Flat_Bench_Lying_Leg_Raise",
  "flutter kick": "Flutter_Kicks",
  "dead bug": "Dead_Bug",
  "ab wheel": "Ab_Roller",
  "ab rollout": "Ab_Roller",
  "toe touch": "Toe_Touchers",
  "v up": "Jackknife_Sit-Up",

  // ── Cardio / conditioning ──
  // No burpee exists in the dataset. Jump squat is the closest visual stand-in.
  // To use a real burpee image: upload Burpees/0.jpg + Burpees/1.jpg to the
  // bucket, then change this value to "Burpees".
  "burpee": "Freehand_Jump_Squat",
  "mountain climber": "Mountain_Climbers",
  "jump rope": "Rope_Jumping",
  "skipping": "Rope_Jumping",
  "skipping rope": "Rope_Jumping",
  "jumping jack": "Star_Jump",
  "star jump": "Star_Jump",
  "high knee": "Fast_Skipping",
  "butt kick": "Single_Leg_Butt_Kick",
  "tuck jump": "Knee_Tuck_Jump",
  "box jump": "Front_Box_Jump",
  "battle rope": "Battling_Ropes",
  "battling rope": "Battling_Ropes",
  "kettlebell swing": "One-Arm_Kettlebell_Swings",
  "treadmill": "Running_Treadmill",
  "treadmill run": "Running_Treadmill",
  "running": "Running_Treadmill",
  "treadmill walk": "Walking_Treadmill",
  "walking": "Walking_Treadmill",
  "incline walk": "Walking_Treadmill",
  "jogging": "Jogging_Treadmill",
  "cycling": "Bicycling_Stationary",
  "stationary bike": "Bicycling_Stationary",
  "spin bike": "Bicycling_Stationary",
  "recumbent bike": "Recumbent_Bike",
  "assault bike": "Bicycling_Stationary",
  "air bike": "Bicycling_Stationary",
  "rowing machine": "Rowing_Stationary",
  "rower": "Rowing_Stationary",
  "rowing": "Rowing_Stationary",
  "elliptical": "Elliptical_Trainer",
  "cross trainer": "Elliptical_Trainer",
  "stair climber": "Stairmaster",
  "stairmaster": "Stairmaster",
  "sprint": "Wind_Sprints",
  "sled push": "Sled_Push",
  "farmer walk": "Farmers_Walk",
  "farmers carry": "Farmers_Walk",

  // ── Olympic / full body ──
  "power clean": "Power_Clean",
  "hang clean": "Hang_Clean",
  "clean and press": "Clean_and_Press",
  "clean and jerk": "Clean_and_Jerk",
  "snatch": "Power_Snatch",
  "thruster": "Kettlebell_Thruster",
  "kettlebell thruster": "Kettlebell_Thruster",
}

// ─── Normalisation ───────────────────────────────────────────────────────────

function singular(w: string): string {
  if (w.length <= 3 || w.endsWith("ss")) return w
  if (/(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2) // crunches → crunch, presses → press
  if (w.endsWith("s")) return w.slice(0, -1)
  return w
}

/** "Pull-Ups" → ["pull","up"] ; "Farmer's Walk" → ["farmer","walk"] */
function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\(.*?\)/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singular)
}

/** Spacing/hyphen-insensitive key: "Pull-Ups", "pull ups", "pullups" → "pullup" */
function compact(name: string): string {
  return singular(tokens(name).join(""))
}

// ─── Indexes (built once per module load) ────────────────────────────────────

const aliasIndex = new Map<string, string>()
for (const [k, v] of Object.entries(ALIASES)) aliasIndex.set(compact(k), v)

const mapIndex = new Map<string, string>()
const mapTokens: { tokens: string[]; id: string }[] = []
for (const [k, v] of Object.entries(exerciseImageMap)) {
  const c = compact(k)
  if (!mapIndex.has(c)) mapIndex.set(c, v)
  mapTokens.push({ tokens: tokens(k), id: v })
}

const cache = new Map<string, string | null>()

// ─── Public API ──────────────────────────────────────────────────────────────

/** Returns the bucket folder ID for an exercise name, or null if none fits. */
export function resolveExerciseImageId(name: string | null | undefined): string | null {
  if (!name) return null
  const key = compact(name)
  if (cache.has(key)) return cache.get(key)!

  // 1. Curated alias  2. Exact dataset name (spacing/plural-insensitive)
  let id = aliasIndex.get(key) ?? mapIndex.get(key) ?? null

  // 3. Token match: every word of the name appears in a dataset entry.
  //    Pick the entry with the fewest extra words (closest variant).
  if (!id) {
    const q = tokens(name)
    let best: { id: string; extra: number } | null = null
    for (const e of mapTokens) {
      if (q.every((t) => e.tokens.includes(t))) {
        const extra = e.tokens.length - q.length
        if (!best || extra < best.extra) best = { id: e.id, extra }
      }
    }
    // Reject loose matches (e.g. "row" → a 6-word exercise)
    if (best && best.extra <= 3) id = best.id
  }

  cache.set(key, id)
  return id
}

export function exerciseImageUrl(name: string | null | undefined, frame: 0 | 1 = 0): string | null {
  const id = resolveExerciseImageId(name)
  return id ? `${EXERCISE_IMAGE_CDN}/${id}/${frame}.jpg` : null
}

/** Exported for the validation script only. */
export const __ALIASES_FOR_TEST = ALIASES

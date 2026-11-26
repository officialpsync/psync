// app/api/portal/onboarding/sync/route.ts
// Trainer Manual Review & Approval: Commits submitted form data into master member profile.

import { NextRequest, NextResponse } from "next/server";
import { adminClient, getStaffContext } from "@/lib/server/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function normalizeDietType(pref: string | string[]): string {
  if (Array.isArray(pref)) {
    const joined = pref.join(" ").toLowerCase();
    if (joined.includes("vegan")) return "vegan";
    if (joined.includes("jain")) return "jain";
    if (joined.includes("non-veg") || joined.includes("non_veg")) return "non_vegetarian";
    if (joined.includes("eggetarian")) return "eggetarian";
    if (joined.includes("vegetarian")) return "vegetarian";
    return pref[0] || "vegetarian";
  }
  const s = String(pref || "").toLowerCase();
  if (s.includes("vegan")) return "vegan";
  if (s.includes("jain")) return "jain";
  if (s.includes("non")) return "non_vegetarian";
  if (s.includes("egg")) return "eggetarian";
  return "vegetarian";
}

function normalizeJobActivity(act: string): string {
  const s = String(act || "").toLowerCase();
  if (s.includes("desk") || s.includes("home")) return "desk";
  if (s.includes("feet")) return "on_feet";
  if (s.includes("physical") || s.includes("labour")) return "physical";
  return "desk";
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const staff = await getStaffContext(authHeader);

    const body = await req.json();
    const {
      formId,
      memberId,
      approvedData,
      generateAiDiet = false,
      generateAiWorkout = false,
      trainerNotes,
    } = body;

    if (!memberId || !approvedData) {
      return NextResponse.json(
        { error: "memberId and approvedData are required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = adminClient();

    // 1. Fetch current member to verify org access
    const { data: member, error: memberErr } = await db
      .from("members")
      .select("*, branches(name)")
      .eq("id", memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json(
        { error: "Member not found." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Verify staff org if authenticated as staff
    if (staff.ok && staff.ctx.orgId !== member.org_id) {
      return NextResponse.json(
        { error: "Access denied for this organization." },
        { status: 403, headers: CORS_HEADERS }
      );
    }

    const d = approvedData;

    // Normalizing units & values
    let heightCm: number | null = member.height_cm;
    if (d.height_cm !== undefined && d.height_cm !== null && d.height_cm !== "") {
      heightCm = Number(d.height_cm);
    }

    let weightKg: number | null = member.weight_kg;
    if (d.weight_kg !== undefined && d.weight_kg !== null && d.weight_kg !== "") {
      weightKg = Number(d.weight_kg);
    }

    const dietType = d.dietary_preference
      ? normalizeDietType(d.dietary_preference)
      : member.diet_type || "vegetarian";

    const jobActivity = d.daily_activity_at_work
      ? normalizeJobActivity(d.daily_activity_at_work)
      : member.job_activity || "desk";

    const exerciseDays = d.workout_days_per_week
      ? parseInt(String(d.workout_days_per_week), 10) || 3
      : member.exercise_days_per_week || 3;

    const mealFreq = d.meals_per_day
      ? parseInt(String(d.meals_per_day).replace(/\D/g, ""), 10) || 4
      : member.meal_frequency || 4;

    const nowIso = new Date().toISOString();

    // 2. Prepare update payload for master members record
    const memberUpdatePayload: Record<string, any> = {
      updated_at: nowIso,
      onboarding_status: "synced",
      onboarding_completed_at: nowIso,
    };

    if (d.gender || d.sex) memberUpdatePayload.sex = String(d.gender || d.sex).toLowerCase();
    if (d.date_of_birth) memberUpdatePayload.date_of_birth = d.date_of_birth;
    if (heightCm) memberUpdatePayload.height_cm = heightCm;
    if (weightKg) memberUpdatePayload.weight_kg = weightKg;
    if (d.primary_goal) memberUpdatePayload.primary_goal = d.primary_goal;
    if (d.target_weight) memberUpdatePayload.target_weight_kg = Number(d.target_weight) || null;
    if (dietType) memberUpdatePayload.diet_type = dietType;
    if (jobActivity) memberUpdatePayload.job_activity = jobActivity;
    if (exerciseDays) memberUpdatePayload.exercise_days_per_week = exerciseDays;
    if (mealFreq) memberUpdatePayload.meal_frequency = mealFreq;

    if (d.medical_conditions) {
      memberUpdatePayload.medical_conditions = Array.isArray(d.medical_conditions)
        ? d.medical_conditions
        : [d.medical_conditions];
    }

    if (d.food_allergies) {
      memberUpdatePayload.food_intolerances = Array.isArray(d.food_allergies)
        ? d.food_allergies
        : [d.food_allergies];
    }

    if (d.foods_disliked) {
      memberUpdatePayload.disliked_foods = Array.isArray(d.foods_disliked)
        ? d.foods_disliked
        : [d.foods_disliked];
    }

    if (d.current_medications) memberUpdatePayload.medications = d.current_medications;
    if (d.whatsapp_number) memberUpdatePayload.whatsapp_number = d.whatsapp_number;
    if (d.address) memberUpdatePayload.address = d.address;
    if (d.city) memberUpdatePayload.city = d.city;
    if (d.state) memberUpdatePayload.state = d.state;
    if (d.pincode) memberUpdatePayload.pincode = String(d.pincode);
    if (d.emergency_contact) memberUpdatePayload.emergency_contact = d.emergency_contact;
    if (d.doctor_exercise_restriction !== undefined) {
      memberUpdatePayload.doctor_exercise_restriction = !!d.doctor_exercise_restriction;
    }

    if (d.preferred_cuisines) {
      memberUpdatePayload.cuisine_preference = Array.isArray(d.preferred_cuisines)
        ? d.preferred_cuisines
        : [d.preferred_cuisines];
    }

    if (trainerNotes) {
      memberUpdatePayload.notes = member.notes
        ? `${member.notes}\n[Trainer Review]: ${trainerNotes}`
        : `[Trainer Review]: ${trainerNotes}`;
    }

    // 3. Commit to members table
    const { error: updateErr } = await db
      .from("members")
      .update(memberUpdatePayload)
      .eq("id", memberId);

    if (updateErr) {
      console.error("Failed to update member master record:", updateErr);
      return NextResponse.json(
        { error: "Failed to update member profile: " + updateErr.message },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 4. Update member_onboarding_forms status to synced
    if (formId) {
      try {
        await db
          .from("member_onboarding_forms")
          .update({
            status: "synced",
            synced_at: nowIso,
            synced_by: staff.ok ? staff.ctx.userId : null,
            updated_at: nowIso,
          })
          .eq("id", formId);
      } catch (e) {
        console.warn("Could not update member_onboarding_forms:", e);
      }
    }

    // 5. Record activity log
    try {
      await db.from("member_onboarding_activities").insert({
        form_id: formId || crypto.randomUUID(),
        member_id: member.id,
        org_id: member.org_id,
        event_type: "profile_synced",
        actor_type: "trainer",
        actor_id: staff.ok ? staff.ctx.userId : null,
        actor_name: staff.ok ? "Trainer " + staff.ctx.role : "Trainer Reviewer",
        metadata: {
          doctor_exercise_restriction: !!d.doctor_exercise_restriction,
          generate_ai_diet: !!generateAiDiet,
          generate_ai_workout: !!generateAiWorkout,
          approved_at: nowIso,
        },
      });

      if (generateAiDiet) {
        await db.from("member_onboarding_activities").insert({
          form_id: formId || crypto.randomUUID(),
          member_id: member.id,
          org_id: member.org_id,
          event_type: "ai_diet_triggered",
          actor_type: "system",
          actor_name: "Psync AI Engine",
          metadata: {
            diet_type: dietType,
            meal_frequency: mealFreq,
            goal: d.primary_goal || member.primary_goal,
            doctor_exercise_restriction: !!d.doctor_exercise_restriction,
          },
        });
      }

      if (generateAiWorkout) {
        await db.from("member_onboarding_activities").insert({
          form_id: formId || crypto.randomUUID(),
          member_id: member.id,
          org_id: member.org_id,
          event_type: "ai_workout_triggered",
          actor_type: "system",
          actor_name: "Psync AI Planner",
          metadata: {
            goal: d.primary_goal || member.primary_goal,
            experience: d.training_experience,
            days_per_week: exerciseDays,
            doctor_restriction: !!d.doctor_exercise_restriction,
            intensity_mode: !!d.doctor_exercise_restriction ? "low_intensity_rehab" : "standard",
          },
        });
      }
    } catch {
      // Non-blocking
    }

    return NextResponse.json(
      {
        ok: true,
        synced: true,
        memberId: member.id,
        doctorRestrictionNoted: !!d.doctor_exercise_restriction,
        message: "Member profile successfully synced and approved by trainer.",
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("Sync approval error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to approve and sync onboarding profile" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

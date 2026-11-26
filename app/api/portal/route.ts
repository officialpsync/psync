// app/api/portal/route.ts
// Member Portal backend API for Psync mobile app and web portal.
// Uses adminClient to safely fetch member profile, workouts, diet, and attendance
// without client-side RLS blocking, scoped strictly to the requested member.

import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("m");
  const phone = searchParams.get("phone");
  const occupancyOnly = searchParams.get("occupancy_only") === "true";

  if (!memberId && !phone) {
    return NextResponse.json(
      { error: "Provide either member ID (?m=) or phone (?phone=)" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const db = adminClient();

    // 1. Fetch Member Profile (supports full UUID, short UUID prefix, member_code, phone, or email)
    let member: any = null;

    if (memberId) {
      const cleanId = memberId.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      
      if (isUuid) {
        const { data } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .eq("id", cleanId)
          .maybeSingle();
        member = data;
      }

      // If not UUID or not found, try matching by member_code (case-insensitive)
      if (!member) {
        const { data } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .ilike("member_code", cleanId)
          .limit(1)
          .maybeSingle();
        member = data;
      }

      // If not found and input is 6+ hex characters (UUID prefix or code)
      if (!member && cleanId.length >= 6) {
        const { data: allMembers } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .limit(500);
        const match = (allMembers || []).find((m: any) =>
          m.id.toLowerCase().startsWith(cleanId.toLowerCase()) ||
          (m.member_code && m.member_code.toLowerCase() === cleanId.toLowerCase())
        );
        if (match) member = match;
      }

      // Fallback: check if memberId is a phone number or email
      if (!member) {
        const cleanDigits = cleanId.replace(/\D/g, "");
        if (cleanDigits.length >= 10) {
          const c10 = cleanDigits.slice(-10);
          const { data } = await db
            .from("members")
            .select("*, branches(name, address, phone)")
            .or(`phone.eq.${c10},phone.eq.+91${c10},phone.ilike.%${c10}%`)
            .limit(1)
            .maybeSingle();
          member = data;
        } else if (cleanId.includes("@")) {
          const { data } = await db
            .from("members")
            .select("*, branches(name, address, phone)")
            .ilike("email", cleanId)
            .limit(1)
            .maybeSingle();
          member = data;
        }
      }
    } else if (phone) {
      const cleanPhone = phone.replace(/\D/g, "").slice(-10);
      const { data } = await db
        .from("members")
        .select("*, branches(name, address, phone)")
        .or(`phone.eq.${cleanPhone},phone.eq.+91${cleanPhone},phone.ilike.%${cleanPhone}%`)
        .limit(1)
        .maybeSingle();
      member = data;
    }

    if (!member) {
      return NextResponse.json(
        { error: "Member not found. Check your Member ID or phone number." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const targetId = member.id;
    const orgId = member.org_id;
    const todayIso = new Date().toISOString().slice(0, 10);

    // 2. Fetch all related entities in parallel
    const [
      { data: membership },
      { data: attendance },
      { data: payments },
      { data: diet },
      { data: assignedWorkout },
      { data: classes },
      { data: bookings },
      { data: recipes },
    ] = await Promise.all([
      db
        .from("memberships")
        .select("*, membership_plans(name, duration_days, price_paise)")
        .eq("member_id", targetId)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("attendance_logs")
        .select("*")
        .eq("member_id", targetId)
        .order("check_in_at", { ascending: false })
        .limit(40),
      db
        .from("payments")
        .select("*")
        .eq("member_id", targetId)
        .order("paid_at", { ascending: false })
        .limit(30),
      db
        .from("member_diet_plans")
        .select("*")
        .eq("member_id", targetId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("member_workout_programs")
        .select("*, workout_programs(*)")
        .eq("member_id", targetId)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("classes")
        .select("*")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .order("start_time"),
      db
        .from("class_bookings")
        .select("*, classes(*)")
        .eq("member_id", targetId)
        .eq("status", "booked")
        .gte("booked_for", todayIso)
        .order("booked_for", { ascending: true }),
      db
        .from("recipes")
        .select("recipe_id, recipe_name, cuisine, meal_type, diet_type, serving_size_description, calories_kcal, protein_g, carbs_g, fat_g, fiber_g, ingredients, prep_time_minutes, is_high_protein, is_low_gi, method, servings_per_batch, tags")
        .or(`org_id.is.null,org_id.eq.${orgId}`)
        .eq("is_active", true)
        .order("recipe_name")
        .limit(100),
    ]);

    // 3. Hydrate Workout Program Days and Exercise Items if active
    let fullWorkout = null;
    if (assignedWorkout && assignedWorkout.workout_programs) {
      const progId = assignedWorkout.workout_programs.id;
      const { data: days } = await db
        .from("workout_program_days")
        .select("*")
        .eq("program_id", progId)
        .order("day_number");

      const dayIds = (days ?? []).map((d) => d.id);
      const { data: items } = dayIds.length
        ? await db
            .from("workout_program_items")
            .select("*, exercise:workout_exercises(*)")
            .in("day_id", dayIds)
            .order("sort_order")
        : { data: [] };

      const fullDays = (days ?? []).map((d) => ({
        ...d,
        items: (items ?? []).filter((it) => it.day_id === d.id),
      }));

      fullWorkout = {
        ...assignedWorkout,
        workout_programs: {
          ...assignedWorkout.workout_programs,
          days: fullDays,
        },
      };
    }

    // 4. Calculate Live Gym Occupancy by attendance
    let gymOccupancy = {
      activeMembersPresent: 0,
      totalCheckInsToday: 0,
      branchName: member.branches?.name || "Psync Fitness Club",
    };

    try {
      const startOfTodayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
      let attQuery = db
        .from("attendance_logs")
        .select("id, member_id, check_in_at, check_out_at, branch_id")
        .eq("org_id", orgId)
        .gte("check_in_at", startOfTodayIso);

      if (member.branch_id) {
        attQuery = attQuery.or(`branch_id.eq.${member.branch_id},branch_id.is.null`);
      }

      const { data: gymLogs } = await attQuery;
      if (gymLogs && gymLogs.length > 0) {
        const insideSet = new Set(
          gymLogs.filter((l) => !l.check_out_at).map((l) => l.member_id)
        );
        gymOccupancy.activeMembersPresent = insideSet.size;
        gymOccupancy.totalCheckInsToday = gymLogs.length;
      }
    } catch (e) {
      console.warn("Failed to calculate gym occupancy:", e);
    }

    if (occupancyOnly) {
      return NextResponse.json({ gymOccupancy }, { headers: CORS_HEADERS });
    }

    let onboardingForm: any = null;
    try {
      const { data: obData } = await db
        .from("member_onboarding_forms")
        .select("id, status, access_token, custom_config, submitted_at, viewed_at, prefilled_data, draft_data")
        .eq("member_id", targetId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      onboardingForm = obData;
    } catch {
      // Table might not exist yet
    }

    return NextResponse.json(
      {
        member,
        membership: membership || null,
        attendance: attendance || [],
        payments: payments || [],
        diet: diet || null,
        workout: fullWorkout,
        classes: classes || [],
        bookings: bookings || [],
        recipes: recipes || [],
        gymOccupancy,
        onboarding: onboardingForm || {
          status: member.onboarding_status || "unassigned",
          token: member.onboarding_token || null,
        },
      },
      { headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Portal API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, memberId, orgId, classId, bookingId, bookedFor } = body;

    const db = adminClient();

    if (action === "book_class") {
      if (!memberId || !orgId || !classId) {
        return NextResponse.json(
          { error: "Missing required booking fields" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const todayIso = bookedFor || new Date().toISOString().slice(0, 10);
      const { data, error } = await db
        .from("class_bookings")
        .insert({
          org_id: orgId,
          member_id: memberId,
          class_id: classId,
          booked_for: todayIso,
          status: "booked",
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400, headers: CORS_HEADERS });
      }

      return NextResponse.json({ success: true, booking: data }, { headers: CORS_HEADERS });
    }

    if (action === "cancel_booking") {
      if (!bookingId) {
        return NextResponse.json(
          { error: "Missing bookingId" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const { error } = await db
        .from("class_bookings")
        .update({ status: "cancelled" })
        .eq("id", bookingId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400, headers: CORS_HEADERS });
      }

      return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
    }

    return NextResponse.json(
      { error: "Unknown action" },
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (err) {
    console.error("Portal API POST error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

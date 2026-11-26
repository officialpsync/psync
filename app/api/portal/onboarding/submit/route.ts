// app/api/portal/onboarding/submit/route.ts
// Handles final member submission of onboarding form.

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { formId, memberId, responses, disclaimerAccepted } = body;

    if (!memberId || !responses) {
      return NextResponse.json(
        { error: "memberId and responses are required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (!disclaimerAccepted) {
      return NextResponse.json(
        { error: "You must accept the confirmation disclaimer before submitting." },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    const db = adminClient();

    // Verify member exists
    const { data: member, error: memberErr } = await db
      .from("members")
      .select("id, org_id, full_name")
      .eq("id", memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json(
        { error: "Member not found." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const nowIso = new Date().toISOString();

    // 1. Update member_onboarding_forms if table exists
    if (formId) {
      try {
        await db
          .from("member_onboarding_forms")
          .update({
            submitted_data: responses,
            status: "submitted",
            submitted_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", formId);
      } catch (e) {
        console.warn("Could not update member_onboarding_forms table:", e);
      }
    }

    // 2. Mark member status as submitted (Pending Review)
    try {
      await db
        .from("members")
        .update({
          onboarding_status: "submitted",
          onboarding_last_submitted_at: nowIso,
          disclaimer_accepted: true,
          disclaimer_accepted_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", memberId);
    } catch (e) {
      console.warn("Could not update member onboarding_status:", e);
    }

    // 3. Log activity record
    try {
      await db.from("member_onboarding_activities").insert({
        form_id: formId || crypto.randomUUID(),
        member_id: member.id,
        org_id: member.org_id,
        event_type: "submitted",
        actor_type: "member",
        actor_name: member.full_name || "Member",
        metadata: {
          doctor_exercise_restriction: !!responses.doctor_exercise_restriction,
          medical_conditions_count: Array.isArray(responses.medical_conditions) ? responses.medical_conditions.length : 0,
          has_medical_reports: Array.isArray(responses.medical_report_urls) && responses.medical_report_urls.length > 0,
          submitted_at: nowIso,
        },
      });
    } catch {
      // Non-blocking
    }

    return NextResponse.json(
      {
        ok: true,
        status: "submitted",
        message: "Your onboarding details have been submitted for trainer review.",
        submittedAt: nowIso,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("Submission error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to submit onboarding form" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

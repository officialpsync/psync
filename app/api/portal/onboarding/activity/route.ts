// app/api/portal/onboarding/activity/route.ts
// Logs and fetches immutable activity records for onboarding lifecycle.

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
  const memberId = searchParams.get("memberId");
  const formId = searchParams.get("formId");

  if (!memberId && !formId) {
    return NextResponse.json(
      { error: "memberId or formId required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const db = adminClient();
    let query = db.from("member_onboarding_activities").select("*").order("created_at", { ascending: false });

    if (formId) {
      query = query.eq("form_id", formId);
    } else if (memberId) {
      query = query.eq("member_id", memberId);
    }

    const { data, error } = await query.limit(50);
    if (error) {
      return NextResponse.json({ activities: [] }, { status: 200, headers: CORS_HEADERS });
    }

    return NextResponse.json({ activities: data || [] }, { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ activities: [] }, { status: 200, headers: CORS_HEADERS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      formId,
      memberId,
      orgId,
      eventType,
      actorType = "member",
      actorName = "Member",
      draftData,
      metadata = {},
    } = body;

    if (!memberId || !eventType) {
      return NextResponse.json(
        { error: "memberId and eventType are required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = adminClient();

    // 1. If draftData provided, update draft in member_onboarding_forms
    if (draftData && formId) {
      try {
        await db
          .from("member_onboarding_forms")
          .update({
            draft_data: draftData,
            status: "in_progress",
            updated_at: new Date().toISOString(),
          })
          .eq("id", formId);
      } catch {
        // Table might not exist yet
      }
    }

    // 2. Insert into activity log
    try {
      await db.from("member_onboarding_activities").insert({
        form_id: formId || crypto.randomUUID(),
        member_id: memberId,
        org_id: orgId || "00000000-0000-0000-0000-000000000000",
        event_type: eventType,
        actor_type: actorType,
        actor_name: actorName,
        metadata: {
          ...metadata,
          received_at: new Date().toISOString(),
        },
      });
    } catch {
      // Table might not exist yet
    }

    return NextResponse.json({ ok: true, eventType }, { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    console.error("Activity logging error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to log activity" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

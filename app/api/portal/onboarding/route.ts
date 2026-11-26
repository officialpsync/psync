// app/api/portal/onboarding/route.ts
// Handles onboarding form fetch (GET) and dispatch/creation (POST).

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
  const token = searchParams.get("token");

  if (!memberId && !token) {
    return NextResponse.json(
      { error: "Provide either memberId (?m=) or token (?token=)" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const db = adminClient();

    // 1. Locate member
    let member: any = null;
    if (memberId) {
      const { data } = await db
        .from("members")
        .select("*, branches(name, address, phone)")
        .eq("id", memberId)
        .maybeSingle();
      member = data;
    }

    // 2. Fetch existing form record if table exists
    let formRecord: any = null;
    try {
      let query = db.from("member_onboarding_forms").select("*");
      if (token) {
        query = query.eq("access_token", token);
      } else if (memberId) {
        query = query.eq("member_id", memberId).order("created_at", { ascending: false }).limit(1);
      }
      const { data } = await query.maybeSingle();
      formRecord = data;

      if (!member && formRecord?.member_id) {
        const { data: mData } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .eq("id", formRecord.member_id)
          .maybeSingle();
        member = mData;
      }
    } catch {
      // Table might not exist yet, fallback below
    }

    if (!member) {
      return NextResponse.json(
        { error: "Member not found." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    // Default prefilled client details
    const prefilledData = formRecord?.prefilled_data || {
      full_name: member.full_name || "",
      member_code: member.member_code || "",
      phone: member.phone || "",
      email: member.email || "",
      assigned_trainer: member.trainer_name || member.branches?.name || "Psync Fitness Staff",
    };

    const customConfig = formRecord?.custom_config || {
      include_personal: true,
      include_health: true,
      include_goals: true,
      include_diet: true,
      excluded_fields: [],
    };

    const status = formRecord?.status || (member.onboarding_status || "sent");
    const draftData = formRecord?.draft_data || {};
    const submittedData = formRecord?.submitted_data || null;

    return NextResponse.json(
      {
        formId: formRecord?.id || null,
        token: formRecord?.access_token || member.onboarding_token || member.id,
        status,
        member: {
          id: member.id,
          org_id: member.org_id,
          full_name: member.full_name,
          phone: member.phone,
          email: member.email,
          branch_name: member.branches?.name || "Psync Fitness",
        },
        prefilledData,
        customConfig,
        draftData,
        submittedData,
        expiresAt: formRecord?.expires_at || null,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("GET onboarding form error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load onboarding form" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      member_id,
      custom_config,
      prefilled_data,
      assigned_trainer_id,
      created_by,
    } = body;

    if (!member_id) {
      return NextResponse.json(
        { error: "member_id is required" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = adminClient();

    // Verify member
    const { data: member, error: memberErr } = await db
      .from("members")
      .select("id, org_id, full_name, phone, email, member_code")
      .eq("id", member_id)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const prefilled = prefilled_data || {
      full_name: member.full_name || "",
      member_code: member.member_code || "",
      phone: member.phone || "",
      email: member.email || "",
      assigned_trainer: "Psync Fitness Trainer",
    };

    const config = custom_config || {
      include_personal: true,
      include_health: true,
      include_goals: true,
      include_diet: true,
      excluded_fields: [],
    };

    let formId = crypto.randomUUID();
    let accessToken = crypto.randomUUID();

    try {
      const { data: inserted, error: insertErr } = await db
        .from("member_onboarding_forms")
        .insert({
          id: formId,
          org_id: member.org_id,
          member_id: member.id,
          created_by: created_by || null,
          assigned_trainer_id: assigned_trainer_id || null,
          version: "1.0",
          custom_config: config,
          status: "sent",
          prefilled_data: prefilled,
          access_token: accessToken,
        })
        .select()
        .single();

      if (!insertErr && inserted) {
        formId = inserted.id;
        accessToken = inserted.access_token;
      }
    } catch {
      // Graceful fallback if table is pending execution
    }

    // Also update member's onboarding token & status
    await db
      .from("members")
      .update({
        onboarding_token: accessToken,
        onboarding_status: "sent",
        updated_at: new Date().toISOString(),
      })
      .eq("id", member.id);

    // Record activity log
    try {
      await db.from("member_onboarding_activities").insert({
        form_id: formId,
        member_id: member.id,
        org_id: member.org_id,
        event_type: "dispatched",
        actor_type: "trainer",
        actor_id: created_by || null,
        actor_name: "Trainer",
        metadata: {
          custom_config: config,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      // Non-blocking
    }

    const host = process.env.NEXT_PUBLIC_SITE_URL || "https://psync.club";
    const universalLink = `${host}/portal/onboarding?token=${accessToken}&m=${member.id}`;
    const deepLink = `psync://onboarding?token=${accessToken}&m=${member.id}`;

    return NextResponse.json(
      {
        ok: true,
        formId,
        accessToken,
        universalLink,
        deepLink,
        status: "sent",
      },
      { status: 201, headers: CORS_HEADERS }
    );
  } catch (err: any) {
    console.error("POST dispatch onboarding error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to dispatch onboarding form" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

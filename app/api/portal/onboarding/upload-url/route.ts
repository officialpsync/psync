// app/api/portal/onboarding/upload-url/route.ts
// Issues an S3 presigned URL for gym member medical report uploads.

import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/auth";
import { createPresignedUploadUrl } from "@/lib/s3";

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
    const { memberId, token, contentType, size } = body;

    if (!memberId || !contentType || !size) {
      return NextResponse.json(
        { error: "memberId, contentType, and size are required." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const db = adminClient();

    // Verify member exists
    const { data: member, error: memberErr } = await db
      .from("members")
      .select("id, org_id")
      .eq("id", memberId)
      .maybeSingle();

    if (memberErr || !member) {
      return NextResponse.json(
        { error: "Member not found." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    const result = await createPresignedUploadUrl({
      orgId: member.org_id,
      memberId: member.id,
      contentType,
      size: Number(size),
      folder: "medical-reports",
    });

    return NextResponse.json(result, { status: 200, headers: CORS_HEADERS });
  } catch (err: any) {
    console.error("Presigned URL error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to generate upload URL" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

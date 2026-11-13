// app/api/portal/otp/route.ts
// MSG91 OTP Backend Service for Psync Member Portal and Mobile App.
// Keeps MSG91 Authkey strictly secret on the server.

import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/server/auth";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, authkey",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function normalizePhone(raw: string): { clean10: string; countryCodePhone: string } {
  const digits = (raw || "").replace(/\D/g, "");
  const clean10 = digits.slice(-10);
  const countryCodePhone = clean10.length === 10 ? `91${clean10}` : digits;
  return { clean10, countryCodePhone };
}

export async function POST(req: NextRequest) {
  const authkey = process.env.MSG91_AUTH_KEY || "589371Aasm21aadS6af75071P1";

  try {
    const body = await req.json();
    const { action, phone, otp, accessToken, retryChannel } = body;

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: verify_token (Verifies JWT access token from MSG91 OTP widget)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "verify_token") {
      if (!accessToken) {
        return NextResponse.json(
          { success: false, error: "Access token is required" },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const verifyRes = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authkey: authkey,
        },
        body: JSON.stringify({
          authkey: authkey,
          "access-token": accessToken,
        }),
      });

      const verifyData = await verifyRes.json();
      console.log("[MSG91 Backend] verifyAccessToken response:", verifyData);

      if (verifyData?.type === "success" && verifyData?.message) {
        const verifiedNumber = String(verifyData.message).replace(/\D/g, "");
        const clean10 = verifiedNumber.slice(-10);

        // Fetch gym member by verified phone
        const db = adminClient();
        const { data: member } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .or(`phone.eq.${clean10},phone.eq.+91${clean10},phone.ilike.%${clean10}%`)
          .limit(1)
          .maybeSingle();

        if (member) {
          return NextResponse.json(
            {
              success: true,
              memberId: member.id,
              member,
              verifiedPhone: clean10,
            },
            { headers: CORS_HEADERS }
          );
        } else {
          return NextResponse.json(
            {
              success: false,
              error: `Phone +91 ${clean10} verified, but no member account is registered with this number. Please check with your gym admin.`,
              verifiedPhone: clean10,
            },
            { status: 404, headers: CORS_HEADERS }
          );
        }
      }

      return NextResponse.json(
        {
          success: false,
          error: verifyData?.message || "Invalid or expired access token.",
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: send (Dispatches OTP to registered member via MSG91)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "send") {
      if (!phone) {
        return NextResponse.json(
          { success: false, error: "Phone number is required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const { clean10, countryCodePhone } = normalizePhone(phone);
      if (clean10.length < 10) {
        return NextResponse.json(
          { success: false, error: "Please enter a valid 10-digit mobile number." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      // Check if member exists in gym database
      const db = adminClient();
      const { data: member } = await db
        .from("members")
        .select("id, full_name, phone")
        .or(`phone.eq.${clean10},phone.eq.+91${clean10},phone.ilike.%${clean10}%`)
        .limit(1)
        .maybeSingle();

      // Send OTP via MSG91 v5 OTP API
      const url = `https://control.msg91.com/api/v5/otp?mobile=${countryCodePhone}&authkey=${encodeURIComponent(authkey)}`;
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      console.log("[MSG91 Backend] send OTP response:", data);

      if (data?.type === "success" || data?.request_id) {
        return NextResponse.json(
          {
            success: true,
            reqId: data.request_id || "sent",
            message: "OTP sent successfully",
            memberName: member?.full_name || null,
            isRegisteredMember: !!member,
          },
          { headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: data?.message || "Failed to dispatch verification code.",
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: verify (Verifies code via MSG91)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "verify") {
      if (!phone || !otp) {
        return NextResponse.json(
          { success: false, error: "Phone number and OTP are required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const { clean10, countryCodePhone } = normalizePhone(phone);
      const cleanOtp = String(otp).trim();

      const url = `https://control.msg91.com/api/v5/otp/verify?otp=${encodeURIComponent(cleanOtp)}&mobile=${countryCodePhone}&authkey=${encodeURIComponent(authkey)}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log("[MSG91 Backend] verify OTP response:", data);

      if (data?.type === "success" || data?.message === "OTP verified success") {
        const db = adminClient();
        const { data: member } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .or(`phone.eq.${clean10},phone.eq.+91${clean10},phone.ilike.%${clean10}%`)
          .limit(1)
          .maybeSingle();

        if (member) {
          return NextResponse.json(
            {
              success: true,
              memberId: member.id,
              member,
              phone: clean10,
            },
            { headers: CORS_HEADERS }
          );
        }

        return NextResponse.json(
          {
            success: true,
            memberId: clean10,
            phone: clean10,
          },
          { headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: data?.message || "Invalid verification code. Please check and retry.",
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: resend (Retries OTP delivery via SMS or Voice)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "resend") {
      if (!phone) {
        return NextResponse.json(
          { success: false, error: "Phone number is required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const { countryCodePhone } = normalizePhone(phone);
      const retryType =
        retryChannel === 4 || retryChannel === "voice" || retryChannel === "call" ? "voice" : "text";

      const url = `https://control.msg91.com/api/v5/otp/retry?authkey=${encodeURIComponent(authkey)}&retrytype=${retryType}&mobile=${countryCodePhone}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log("[MSG91 Backend] retry OTP response:", data);

      if (data?.type === "success") {
        return NextResponse.json({ success: true, message: "OTP resent successfully" }, { headers: CORS_HEADERS });
      }

      return NextResponse.json(
        { success: false, error: data?.message || "Failed to resend OTP" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      { success: false, error: `Invalid action: ${action}` },
      { status: 400, headers: CORS_HEADERS }
    );
  } catch (e: any) {
    console.error("[MSG91 Backend] Route error:", e);
    return NextResponse.json(
      { success: false, error: e?.message || "Server error processing OTP" },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

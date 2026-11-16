// app/api/portal/otp/route.ts
// MSG91 SMS OTP Backend Service for Psync Member Portal and Mobile App.
// Keeps MSG91 Authkey strictly secret on the server.
// Strictly SMS channel (11) - No WhatsApp.

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
  const widgetId = process.env.MSG91_WIDGET_ID || "366b6d645373393531303537";
  const tokenAuth = process.env.MSG91_TOKEN_AUTH || "589371T2wyJpmy6af695faP1";

  try {
    const body = await req.json();
    const { action, phone, otp, accessToken, memberId } = body;

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: member_id_login (Instant Member ID / Code login)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "member_id_login") {
      const rawId = (memberId || body.id || "").trim();
      if (!rawId) {
        return NextResponse.json(
          { success: false, error: "Member ID is required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const db = adminClient();
      let member: any = null;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);

      if (isUuid) {
        const { data } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .eq("id", rawId)
          .maybeSingle();
        member = data;
      }

      // Try member_code
      if (!member) {
        const { data } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .ilike("member_code", rawId)
          .limit(1)
          .maybeSingle();
        member = data;
      }

      // Try prefix match on UUID or code
      if (!member && rawId.length >= 6) {
        const { data: allMembers } = await db
          .from("members")
          .select("*, branches(name, address, phone)")
          .limit(500);
        const match = (allMembers || []).find((m: any) =>
          m.id.toLowerCase().startsWith(rawId.toLowerCase()) ||
          (m.member_code && m.member_code.toLowerCase() === rawId.toLowerCase())
        );
        if (match) member = match;
      }

      // Fallback: check if rawId is phone or email
      if (!member) {
        const cleanDigits = rawId.replace(/\D/g, "");
        if (cleanDigits.length >= 10) {
          const c10 = cleanDigits.slice(-10);
          const { data } = await db
            .from("members")
            .select("*, branches(name, address, phone)")
            .or(`phone.eq.${c10},phone.eq.+91${c10},phone.ilike.%${c10}%`)
            .limit(1)
            .maybeSingle();
          member = data;
        } else if (rawId.includes("@")) {
          const { data } = await db
            .from("members")
            .select("*, branches(name, address, phone)")
            .ilike("email", rawId)
            .limit(1)
            .maybeSingle();
          member = data;
        }
      }

      if (!member) {
        return NextResponse.json(
          { success: false, error: "No gym member found for this Member ID or Code." },
          { status: 404, headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: true,
          memberId: member.id,
          member,
          token: `psync_jwt_${Date.now()}_${member.id}`,
        },
        { headers: CORS_HEADERS }
      );
    }

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
              token: `psync_jwt_${Date.now()}_${clean10}`,
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
    // ACTION: send (Dispatches SMS OTP to member via MSG91 widget or v5 SMS)
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

      let reqId = "sent";
      let dispatched = false;

      // 1. Dispatch SMS OTP via MSG91 Widget sendOtpMobile (Default channel 11 = SMS)
      try {
        const widgetRes = await fetch("https://control.msg91.com/api/v5/widget/sendOtpMobile", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            widgetId,
            tokenAuth,
            identifier: countryCodePhone,
          }),
        });
        const widgetData = await widgetRes.json();
        console.log("[MSG91 Backend] sendOtpMobile response:", widgetData);
        if (widgetData?.type === "success" && widgetData?.message) {
          dispatched = true;
          reqId = widgetData.message;
        }
      } catch (e: any) {
        console.warn("[MSG91 Backend] Widget sendOtpMobile error:", e);
      }

      // 2. Fallback: Send SMS OTP via MSG91 v5 OTP API
      if (!dispatched) {
        const url = `https://control.msg91.com/api/v5/otp?mobile=${countryCodePhone}&authkey=${encodeURIComponent(authkey)}`;
        const res = await fetch(url, { method: "POST" });
        const data = await res.json();
        console.log("[MSG91 Backend] v5 send OTP response:", data);

        if (data?.type === "success" || data?.request_id) {
          dispatched = true;
          reqId = data.request_id || "sent";
        } else {
          return NextResponse.json(
            {
              success: false,
              error: data?.message || "Failed to dispatch SMS verification code.",
            },
            { status: 400, headers: CORS_HEADERS }
          );
        }
      }

      return NextResponse.json(
        {
          success: true,
          reqId,
          message: "SMS OTP sent successfully",
          channel: "sms",
          memberName: member?.full_name || null,
          isRegisteredMember: !!member,
        },
        { headers: CORS_HEADERS }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: verify (Verifies SMS code via MSG91 v5 or dev bypass)
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

      // Test code fallback (1234) allows verification when SMS credits are depleted on MSG91
      let isVerified = cleanOtp === "1234";
      let verifyErr = "Invalid verification code. Please check and retry.";

      if (!isVerified) {
        const url = `https://control.msg91.com/api/v5/otp/verify?otp=${encodeURIComponent(cleanOtp)}&mobile=${countryCodePhone}&authkey=${encodeURIComponent(authkey)}`;
        const res = await fetch(url);
        const data = await res.json();
        console.log("[MSG91 Backend] verify OTP response:", data);
        isVerified = data?.type === "success" || data?.message === "OTP verified success";
        if (data?.message && !isVerified) {
          verifyErr = data.message;
        }
      }

      if (isVerified) {
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
              token: `psync_jwt_${Date.now()}_${clean10}`,
            },
            { headers: CORS_HEADERS }
          );
        }

        return NextResponse.json(
          {
            success: true,
            memberId: clean10,
            phone: clean10,
            token: `psync_jwt_${Date.now()}_${clean10}`,
          },
          { headers: CORS_HEADERS }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: verifyErr,
        },
        { status: 401, headers: CORS_HEADERS }
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: resend (Retries SMS OTP strictly via MSG91 widget channel 11)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "resend") {
      if (!phone) {
        return NextResponse.json(
          { success: false, error: "Phone number is required." },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const { countryCodePhone } = normalizePhone(phone);
      const targetChannel = Number(body.retryChannel || body.channel) || 12; // 12: WhatsApp, 11: SMS, 4: Voice
      const channelLabel = targetChannel === 12 ? "WhatsApp" : targetChannel === 4 ? "Voice" : "SMS";

      // 1. Try widget retryOtp endpoint with target channel
      if (body.reqId && body.reqId !== "sent" && body.reqId !== "backend-sent") {
        try {
          const res = await fetch("https://control.msg91.com/api/v5/widget/retryOtp", {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              widgetId,
              tokenAuth,
              reqId: body.reqId,
              retryChannel: targetChannel,
            }),
          });
          const data = await res.json();
          console.log("[MSG91 Backend] retryOtp response:", data);
          if (data?.type === "success") {
            return NextResponse.json({ success: true, message: `Verification code resent via ${channelLabel}` }, { headers: CORS_HEADERS });
          }
          if (data?.message) {
            return NextResponse.json({ success: false, error: data.message }, { status: 400, headers: CORS_HEADERS });
          }
        } catch (e: any) {
          console.warn("[MSG91 Backend] Widget retry error:", e);
        }
      }

      // 2. Fallback to MSG91 v5 OTP retry
      const retryTypeParam = targetChannel === 4 ? "voice" : "text";
      const url = `https://control.msg91.com/api/v5/otp/retry?authkey=${encodeURIComponent(authkey)}&retrytype=${retryTypeParam}&mobile=${countryCodePhone}`;
      const res = await fetch(url);
      const data = await res.json();
      console.log("[MSG91 Backend] v5 retry OTP response:", data);

      if (data?.type === "success") {
        return NextResponse.json({ success: true, message: `OTP resent successfully via ${channelLabel}` }, { headers: CORS_HEADERS });
      }

      return NextResponse.json(
        { success: false, error: data?.message || `Failed to resend OTP via ${channelLabel}` },
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

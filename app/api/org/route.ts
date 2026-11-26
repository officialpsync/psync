// app/api/org/route.ts
// Secure server-side updates for organization settings, logo, and branding.
// Bypasses browser-level RLS restrictions safely using adminClient after validating staff auth.

import { NextRequest } from "next/server";
import { getStaffContext, adminClient } from "@/lib/server/auth";
import { fail, ok, readJson, sameOrigin } from "@/lib/server/http";

export const maxDuration = 30;

export async function PATCH(req: NextRequest) {
  if (!sameOrigin(req)) return fail(403, "Cross-origin requests are forbidden.");

  const auth = await getStaffContext(req.headers.get("authorization"));
  if (!auth.ok) return fail(auth.status, auth.error);

  const { ctx } = auth;
  const canManageSettings = ctx.role === "owner" || ctx.role === "manager" || ctx.permissions.settings;
  if (!canManageSettings) {
    return fail(403, "You do not have permission to manage gym settings.");
  }

  const body = await readJson(req, 64_000);
  if (!body) return fail(400, "Invalid JSON body.");

  const patch: Record<string, unknown> = {};

  if (body.logo_url !== undefined) {
    patch.logo_url = body.logo_url === null ? null : String(body.logo_url);
  }
  if (body.brand !== undefined) {
    patch.brand = body.brand;
  }
  if (body.brand_color !== undefined) {
    patch.brand_color = body.brand_color ? String(body.brand_color) : null;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return fail(400, "Gym name cannot be empty.");
    patch.name = name;
  }
  if (body.email !== undefined) {
    patch.email = body.email ? String(body.email).trim() : null;
  }
  if (body.phone !== undefined) {
    patch.phone = body.phone ? String(body.phone).trim() : null;
  }
  if (body.address !== undefined) {
    patch.address = body.address ? String(body.address).trim() : null;
  }
  if (body.gst_number !== undefined) {
    patch.gst_number = body.gst_number ? String(body.gst_number).trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return fail(400, "No valid fields provided to update.");
  }

  const db = adminClient();
  const { data, error } = await db
    .from("organizations")
    .update(patch)
    .eq("id", ctx.orgId)
    .select()
    .single();

  if (error) {
    console.error("Failed to update organization:", error);
    return fail(500, error.message || "Failed to update organization.");
  }

  return ok({ ok: true, org: data });
}

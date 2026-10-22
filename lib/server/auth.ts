// lib/server/auth.ts
// Server-side identity: who is calling, which gym, and what they may do.
// Never trust org ids, roles or permissions sent by the browser.
import "./guard"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { resolvePermissions, type Permissions, type StaffRole } from "@/lib/permissions"

let admin: SupabaseClient | null = null

/** Service-role client. Bypasses RLS, so every query must scope by org itself. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error("Supabase server credentials are not configured")
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

export interface StaffContext {
  userId: string
  orgId: string
  role: StaffRole
  permissions: Permissions
}

export type AuthResult = { ok: true; ctx: StaffContext } | { ok: false; status: number; error: string }

export async function getStaffContext(authHeader: string | null): Promise<AuthResult> {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim()
  // Supabase access tokens are JWTs; reject obvious junk before a network call
  if (!token || token.length > 4096 || token.split(".").length !== 3) {
    return { ok: false, status: 401, error: "Not signed in." }
  }

  const db = adminClient()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return { ok: false, status: 401, error: "Session expired. Log in again." }

  const { data: row } = await db
    .from("user_roles")
    .select("org_id, staff_role, role, permissions")
    .eq("user_id", user.id)
    .maybeSingle()
  if (!row?.org_id) return { ok: false, status: 403, error: "No gym found for this account." }

  const { role, permissions } = resolvePermissions(row)
  if (!role) return { ok: false, status: 403, error: "Access denied." }

  return { ok: true, ctx: { userId: user.id, orgId: row.org_id, role, permissions } }
}

// app/api/staff/accept-invite/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@supabase/supabase-js"

const anon = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const admin = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? ""
    const token = authHeader.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    // Verify the token belongs to a real, currently-authenticated user
    const { data: { user }, error: userError } = await anon.auth.getUser(token)
    if (userError || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

    const meta = user.user_metadata as {
      staff_id?: string
      org_id?: string
      branch_id?: string
      staff_role?: string
    }
    if (!meta.staff_id || !meta.org_id) {
      return NextResponse.json({ error: "This account was not invited as staff" }, { status: 400 })
    }

    // Re-read the staff row server-side — don't trust stale invite-time metadata for permissions
    const { data: staffRow, error: staffError } = await admin
      .from("staff")
      .select("id, org_id, branch_id, role, permissions, user_id")
      .eq("id", meta.staff_id)
      .single()

    if (staffError || !staffRow) {
      return NextResponse.json({ error: "Staff record no longer exists" }, { status: 404 })
    }
    if (staffRow.user_id && staffRow.user_id !== user.id) {
      return NextResponse.json({ error: "This staff slot is already linked to a different account" }, { status: 400 })
    }

    // Write user_roles FIRST. If this fails, staff.invite_status stays "invited"
    // and the owner can just resend — no orphaned "active" staff row with no role.
    const { error: roleError } = await admin
      .from("user_roles")
      .upsert(
        {
          user_id: user.id,
          org_id: staffRow.org_id,
          branch_id: staffRow.branch_id,
          role: "staff",              // legacy column has its own fixed enum; staff_role carries the real role
          staff_role: staffRow.role,
          permissions: staffRow.permissions,
        },
        { onConflict: "user_id" }
      )
    if (roleError) throw roleError

    const { error: linkError } = await admin
      .from("staff")
      .update({ user_id: user.id, invite_status: "active" })
      .eq("id", staffRow.id)
    if (linkError) throw linkError

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Accept invite error:", err)
    return NextResponse.json({ error: "Couldn't finish setting up your account" }, { status: 500 })
  }
}

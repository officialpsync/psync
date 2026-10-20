// app/api/staff/invite/route.ts
import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@supabase/supabase-js"

// Service-role client — server only, never exposed to the browser
const admin = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { staff_id } = await req.json()
    if (!staff_id) {
      return NextResponse.json({ error: "staff_id is required" }, { status: 400 })
    }

    const { data: staffRow, error: fetchError } = await admin
      .from("staff")
      .select("id, org_id, branch_id, name, email, role, permissions, invite_status")
      .eq("id", staff_id)
      .single()

    if (fetchError || !staffRow) {
      return NextResponse.json({ error: "Staff record not found" }, { status: 404 })
    }
    if (!staffRow.email) {
      return NextResponse.json({ error: "This staff member has no email on file" }, { status: 400 })
    }
    if (staffRow.invite_status === "active") {
      return NextResponse.json({ error: "This staff member already has a login" }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"

    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(staffRow.email, {
      redirectTo: `${siteUrl}/accept-invite`,
      data: {
        staff_id: staffRow.id,
        org_id: staffRow.org_id,
        branch_id: staffRow.branch_id,
        staff_role: staffRow.role,
      },
    })

    if (inviteError) {
      // Supabase returns this when the email is already a registered auth user
      const alreadyRegistered = /already.*registered|already.*exists/i.test(inviteError.message)
      return NextResponse.json(
        {
          error: alreadyRegistered
            ? "This email already has an account. Check if they're already staff elsewhere, or use a different email."
            : inviteError.message,
        },
        { status: 400 }
      )
    }

    await admin
      .from("staff")
      .update({ invite_status: "invited", invited_at: new Date().toISOString() })
      .eq("id", staff_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("Staff invite error:", err)
    return NextResponse.json({ error: "Something went wrong sending the invite" }, { status: 500 })
  }
}

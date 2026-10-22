"use client"
// app/dashboard/components/useRole.ts
// Browser-side role + permissions, used to show/hide UI. Real enforcement lives
// in RLS policies and server routes, which resolve permissions with the same
// rules from lib/permissions.ts.

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import {
  ROLE_DEFAULTS, NO_PERMISSIONS, resolvePermissions,
  type StaffRole, type Permissions,
} from "@/lib/permissions"

export { ROLE_DEFAULTS }
export type { StaffRole, Permissions }

export interface RoleData {
  user_id: string
  org_id: string
  branch_id: string
  staff_role: StaffRole
  permissions: Permissions
  loading: boolean
}

const LOADING: RoleData = {
  user_id: "",
  org_id: "",
  branch_id: "",
  staff_role: "owner",
  permissions: ROLE_DEFAULTS.owner,
  loading: true,
}

export function useRole(): RoleData {
  const [data, setData] = useState<RoleData>(LOADING)

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setData({ ...LOADING, permissions: { ...NO_PERMISSIONS }, loading: false })
        return
      }

      const { data: row } = await supabase
        .from("user_roles")
        .select("org_id, branch_id, role, staff_role, permissions")
        .eq("user_id", user.id)
        .single()

      if (!row) {
        // No user_roles row: fail closed, never default to owner.
        setData({
          user_id: user.id, org_id: "", branch_id: "",
          staff_role: "general_staff", permissions: { ...NO_PERMISSIONS }, loading: false,
        })
        return
      }

      const { role, permissions } = resolvePermissions(row)
      setData({
        user_id: user.id,
        org_id: row.org_id,
        branch_id: row.branch_id,
        staff_role: role ?? "general_staff",
        permissions,
        loading: false,
      })
    }

    load()
  }, [])

  return data
}

// Helper: does this role see full health profile?
export function canSeeHealthData(role: StaffRole): boolean {
  return ["owner", "manager", "trainer", "dietitian"].includes(role)
}

// Helper: is owner?
export function isOwner(role: StaffRole): boolean {
  return role === "owner"
}

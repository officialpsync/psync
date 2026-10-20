"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"

export type StaffRole =
  | "owner"
  | "manager"
  | "trainer"
  | "dietitian"
  | "receptionist"
  | "accounts"
  | "general_staff"

export interface Permissions {
  members: boolean
  attendance: boolean
  classes: boolean
  workouts: boolean
  diet: boolean
  recipes: boolean
  leads: boolean
  payments: boolean
  membership_plans: boolean
  reports: boolean
  settings: boolean
}

export interface RoleData {
  user_id: string
  org_id: string
  branch_id: string
  staff_role: StaffRole
  permissions: Permissions
  loading: boolean
}

export const ROLE_DEFAULTS: Record<StaffRole, Permissions> = {
  owner: {
    members: true, attendance: true, classes: true, workouts: true,
    diet: true, recipes: true, leads: true, payments: true,
    membership_plans: true, reports: true, settings: true,
  },
  manager: {
    members: true, attendance: true, classes: true, workouts: true,
    diet: true, recipes: true, leads: true, payments: true,
    membership_plans: true, reports: true, settings: false,
  },
  trainer: {
    members: true, attendance: true, classes: true, workouts: true,
    diet: false, recipes: false, leads: false, payments: false,
    membership_plans: false, reports: false, settings: false,
  },
  dietitian: {
    members: true, attendance: false, classes: false, workouts: false,
    diet: true, recipes: true, leads: false, payments: false,
    membership_plans: false, reports: false, settings: false,
  },
  receptionist: {
    members: true, attendance: true, classes: false, workouts: false,
    diet: false, recipes: false, leads: true, payments: true,
    membership_plans: false, reports: false, settings: false,
  },
  accounts: {
    members: false, attendance: false, classes: false, workouts: false,
    diet: false, recipes: false, leads: false, payments: true,
    membership_plans: true, reports: true, settings: false,
  },
  general_staff: {
    members: true, attendance: true, classes: false, workouts: false,
    diet: false, recipes: false, leads: false, payments: false,
    membership_plans: false, reports: false, settings: false,
  },
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
        setData({ ...LOADING, loading: false })
        return
      }

      const { data: row } = await supabase
        .from("user_roles")
        .select("org_id, branch_id, role, staff_role, permissions")
        .eq("user_id", user.id)
        .single()

      if (!row) {
        // No user_roles row found — fail closed (no access), never default to owner.
        setData({
          user_id: user.id,
          org_id: "",
          branch_id: "",
          staff_role: "general_staff",
          permissions: {
            members: false, attendance: false, classes: false, workouts: false,
            diet: false, recipes: false, leads: false, payments: false,
            membership_plans: false, reports: false, settings: false,
          },
          loading: false,
        })
        return
      }

      // staff_role takes priority; fall back to legacy `role` column
      // If neither is set, treat as owner (existing gym owner accounts)
      const rawRole = row.staff_role ?? row.role ?? "owner"

      // Normalise: legacy value "owner" maps directly; anything unrecognised → owner
      const validRoles: StaffRole[] = [
        "owner","manager","trainer","dietitian","receptionist","accounts","general_staff"
      ]
      const role: StaffRole = validRoles.includes(rawRole) ? rawRole : "owner"

      // Owners always get full access — ignore any stored overrides
      if (role === "owner") {
        setData({
          user_id: user.id,
          org_id: row.org_id,
          branch_id: row.branch_id,
          staff_role: "owner",
          permissions: ROLE_DEFAULTS.owner,
          loading: false,
        })
        return
      }

      // Non-owners: merge role defaults with any per-staff overrides stored in DB
      const base = ROLE_DEFAULTS[role]
      const overrides = (row.permissions ?? {}) as Partial<Permissions>
      const permissions: Permissions = { ...base, ...overrides }

      setData({
        user_id: user.id,
        org_id: row.org_id,
        branch_id: row.branch_id,
        staff_role: role,
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

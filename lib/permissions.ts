// lib/permissions.ts
// One source of truth for staff roles and permissions. Pure code (no React, no
// Supabase), so the browser (useRole) and server routes resolve permissions the
// same way. The server's answer is the one that counts; the browser's only hides UI.

export type StaffRole =
  | "owner" | "manager" | "trainer" | "dietitian" | "receptionist" | "accounts" | "general_staff"

export interface Permissions {
  members: boolean
  attendance: boolean
  classes: boolean
  workouts: boolean
  diet: boolean
  recipes: boolean
  ai_recipes: boolean
  leads: boolean
  payments: boolean
  membership_plans: boolean
  reports: boolean
  settings: boolean
}

export const PERMISSION_KEYS: (keyof Permissions)[] = [
  "members", "attendance", "classes", "workouts", "diet", "recipes", "ai_recipes",
  "leads", "payments", "membership_plans", "reports", "settings",
]

export const VALID_ROLES: StaffRole[] = [
  "owner", "manager", "trainer", "dietitian", "receptionist", "accounts", "general_staff",
]

export const NO_PERMISSIONS: Permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, false])) as unknown as Permissions

export const ROLE_DEFAULTS: Record<StaffRole, Permissions> = {
  owner: {
    members: true, attendance: true, classes: true, workouts: true,
    diet: true, recipes: true, ai_recipes: true, leads: true, payments: true,
    membership_plans: true, reports: true, settings: true,
  },
  manager: {
    members: true, attendance: true, classes: true, workouts: true,
    diet: true, recipes: true, ai_recipes: true, leads: true, payments: true,
    membership_plans: true, reports: true, settings: false,
  },
  trainer: {
    members: true, attendance: true, classes: true, workouts: true,
    diet: false, recipes: false, ai_recipes: false, leads: false, payments: false,
    membership_plans: false, reports: false, settings: false,
  },
  dietitian: {
    members: true, attendance: false, classes: false, workouts: false,
    diet: true, recipes: true, ai_recipes: true, leads: false, payments: false,
    membership_plans: false, reports: false, settings: false,
  },
  receptionist: {
    members: true, attendance: true, classes: false, workouts: false,
    diet: false, recipes: false, ai_recipes: false, leads: true, payments: true,
    membership_plans: false, reports: false, settings: false,
  },
  accounts: {
    members: false, attendance: false, classes: false, workouts: false,
    diet: false, recipes: false, ai_recipes: false, leads: false, payments: true,
    membership_plans: true, reports: true, settings: false,
  },
  general_staff: {
    members: true, attendance: true, classes: false, workouts: false,
    diet: false, recipes: false, ai_recipes: false, leads: false, payments: false,
    membership_plans: false, reports: false, settings: false,
  },
}

export interface RoleRow {
  staff_role?: string | null
  role?: string | null
  permissions?: unknown
}

/**
 * staff_role wins, then the legacy `role` column. Neither set = an original
 * gym-owner account. (user_roles can only be written by the server, so these
 * values are never user-controlled.)
 */
export function resolveRole(row: RoleRow): StaffRole {
  const raw = row.staff_role ?? row.role ?? "owner"
  return (VALID_ROLES as string[]).includes(raw) ? (raw as StaffRole) : "owner"
}

/** Role defaults + per-person overrides. Only real boolean flags for known keys are accepted. */
export function resolvePermissions(row: RoleRow | null | undefined): { role: StaffRole | null; permissions: Permissions } {
  if (!row) return { role: null, permissions: { ...NO_PERMISSIONS } } // no row = no access
  const role = resolveRole(row)
  if (role === "owner") return { role, permissions: { ...ROLE_DEFAULTS.owner } }

  const permissions = { ...ROLE_DEFAULTS[role] }
  const overrides = row.permissions
  if (overrides && typeof overrides === "object" && !Array.isArray(overrides)) {
    for (const key of PERMISSION_KEYS) {
      const v = (overrides as Record<string, unknown>)[key]
      if (typeof v === "boolean") permissions[key] = v
    }
  }
  return { role, permissions }
}

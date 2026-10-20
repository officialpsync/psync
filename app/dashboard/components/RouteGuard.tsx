"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useRole, type Permissions } from "./useRole"

// Longest prefix wins, so a more specific path (e.g. /dashboard/diet/recipes)
// can require a different permission than its parent (/dashboard/diet).
const ROUTE_PERMISSIONS: { prefix: string; permission: keyof Permissions }[] = [
  { prefix: "/dashboard/diet/recipes", permission: "recipes" },
  { prefix: "/dashboard/diet", permission: "diet" },
  { prefix: "/dashboard/members", permission: "members" },
  { prefix: "/dashboard/attendance", permission: "attendance" },
  { prefix: "/dashboard/classes", permission: "classes" },
  { prefix: "/dashboard/workouts", permission: "workouts" },
  { prefix: "/dashboard/leads", permission: "leads" },
  { prefix: "/dashboard/payments", permission: "payments" },
  { prefix: "/dashboard/membership-plans", permission: "membership_plans" },
  { prefix: "/dashboard/reports", permission: "reports" },
  { prefix: "/dashboard/settings", permission: "settings" },
].sort((a, b) => b.prefix.length - a.prefix.length)

// Routes with no entry in Permissions — gated by role instead of a toggle.
const OWNER_MANAGER_ONLY_PREFIXES = ["/dashboard/staff"]

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const roleData = useRole()

  useEffect(() => {
    if (roleData.loading) return

    const isManager = roleData.staff_role === "owner" || roleData.staff_role === "manager"

    if (OWNER_MANAGER_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
      if (!isManager) router.replace("/dashboard")
      return
    }

    const match = ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix))
    if (match && !roleData.permissions[match.permission]) {
      router.replace("/dashboard")
    }
  }, [pathname, roleData.loading, roleData.staff_role, roleData.permissions, router])

  // Render nothing while role is resolving on a gated route, to avoid a flash
  // of restricted content before the redirect fires.
  const isGated =
    OWNER_MANAGER_ONLY_PREFIXES.some((p) => pathname.startsWith(p)) ||
    ROUTE_PERMISSIONS.some((r) => pathname.startsWith(r.prefix))
  if (isGated && roleData.loading) return null

  return <>{children}</>
}

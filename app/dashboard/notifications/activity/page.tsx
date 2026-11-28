"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Activity, UserCheck, IndianRupee, CalendarDays, ShieldCheck,
  UserPlus, Sparkles, RefreshCw, Search, Filter, Clock,
  CheckCircle2, ArrowRight, User, ExternalLink, Calendar
} from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useRole } from "../../components/useRole";
import { Skeleton, useToast } from "../../components/ui";

const supabase = createClient();

type FeedItem = {
  id: string;
  category: "check_in" | "booking" | "payment" | "membership" | "onboarding" | "member";
  title: string;
  desc: string;
  memberName: string;
  memberId?: string;
  timestamp: string;
  metaBadge?: string;
  isLive?: boolean;
};

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (isNaN(diff)) return "";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityFeedPage() {
  const roleData = useRole();
  const { show } = useToast();

  const [activities, setActivities] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<"all" | "today" | "week">("all");

  // Metrics
  const [metrics, setMetrics] = useState({
    todayCheckins: 0,
    totalPayments: 0,
    activeBookings: 0,
    totalMembers: 0,
  });

  async function loadFeed(isManual = false) {
    if (!roleData.org_id) return;
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [attRes, bkRes, payRes, memsRes, mshipsRes, onbRes] = await Promise.allSettled([
        // 1. Attendance logs
        supabase
          .from("attendance_logs")
          .select("id, check_in_at, check_out_at, method, member_id, members(id, full_name, phone)")
          .eq("org_id", roleData.org_id)
          .order("check_in_at", { ascending: false })
          .limit(30),

        // 2. Class bookings
        supabase
          .from("class_bookings")
          .select("id, booked_for, status, created_at, member_id, members(id, full_name, phone), classes(name, start_time)")
          .eq("org_id", roleData.org_id)
          .order("created_at", { ascending: false })
          .limit(25),

        // 3. Payments
        supabase
          .from("payments")
          .select("id, paid_at, total_paise, method, notes, member_id, members(id, full_name, phone)")
          .eq("org_id", roleData.org_id)
          .order("paid_at", { ascending: false })
          .limit(25),

        // 4. Members
        supabase
          .from("members")
          .select("id, full_name, phone, created_at, status")
          .eq("org_id", roleData.org_id)
          .order("created_at", { ascending: false })
          .limit(20),

        // 5. Memberships
        supabase
          .from("memberships")
          .select("id, start_date, end_date, status, created_at, member_id, members(id, full_name, phone), membership_plans(name)")
          .eq("org_id", roleData.org_id)
          .order("created_at", { ascending: false })
          .limit(20),

        // 6. Onboarding activities
        supabase
          .from("member_onboarding_activities")
          .select("id, event_type, actor_name, actor_type, created_at, member_id")
          .eq("org_id", roleData.org_id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      const items: FeedItem[] = [];
      let todayCheckinCount = 0;

      // 1. Attendance
      if (attRes.status === "fulfilled" && attRes.value.data) {
        attRes.value.data.forEach((a: any) => {
          const name = a.members?.full_name || "Member";
          const methodStr = a.method ? `${a.method.toUpperCase()} Pass` : "Check-in";
          const isCurrentlyIn = !a.check_out_at;

          if (a.check_in_at && new Date(a.check_in_at) >= todayStart) {
            todayCheckinCount++;
          }

          items.push({
            id: `att-${a.id}`,
            category: "check_in",
            title: `${name} checked in`,
            desc: `${methodStr} · ${isCurrentlyIn ? "Currently on gym floor" : "Session completed"}`,
            memberName: name,
            memberId: a.member_id,
            timestamp: a.check_in_at,
            metaBadge: isCurrentlyIn ? "In Gym" : "Checked Out",
            isLive: isCurrentlyIn,
          });
        });
      }

      // 2. Class bookings
      let activeBkCount = 0;
      if (bkRes.status === "fulfilled" && bkRes.value.data) {
        bkRes.value.data.forEach((b: any) => {
          const name = b.members?.full_name || "Member";
          const className = b.classes?.name || "Fitness Class";
          const isCancelled = b.status === "cancelled";
          if (!isCancelled) activeBkCount++;

          items.push({
            id: `bk-${b.id}`,
            category: "booking",
            title: `${name} ${isCancelled ? "cancelled reservation for" : "booked"} ${className}`,
            desc: `Reserved for ${b.booked_for}${b.classes?.start_time ? ` at ${b.classes.start_time}` : ""}`,
            memberName: name,
            memberId: b.member_id,
            timestamp: b.created_at || `${b.booked_for}T09:00:00Z`,
            metaBadge: isCancelled ? "Cancelled" : "Confirmed",
          });
        });
      }

      // 3. Payments
      let payCount = 0;
      if (payRes.status === "fulfilled" && payRes.value.data) {
        payCount = payRes.value.data.length;
        payRes.value.data.forEach((p: any) => {
          const name = p.members?.full_name || "Member";
          const inr = `₹${((p.total_paise || 0) / 100).toLocaleString("en-IN")}`;
          const method = p.method ? p.method.toUpperCase() : "Online";

          items.push({
            id: `pay-${p.id}`,
            category: "payment",
            title: `Payment of ${inr} from ${name}`,
            desc: `${p.notes || "Gym membership collection"} (${method})`,
            memberName: name,
            memberId: p.member_id,
            timestamp: p.paid_at,
            metaBadge: method,
          });
        });
      }

      // 4. Memberships
      if (mshipsRes.status === "fulfilled" && mshipsRes.value.data) {
        mshipsRes.value.data.forEach((m: any) => {
          const name = m.members?.full_name || "Member";
          const plan = m.membership_plans?.name || "Membership Plan";

          items.push({
            id: `ms-${m.id}`,
            category: "membership",
            title: `${plan} active for ${name}`,
            desc: `Valid: ${m.start_date} to ${m.end_date || "Ongoing"}`,
            memberName: name,
            memberId: m.member_id,
            timestamp: m.created_at || `${m.start_date}T00:00:00Z`,
            metaBadge: m.status === "active" ? "Active Plan" : m.status,
          });
        });
      }

      // 5. New members
      let memTotal = 0;
      if (memsRes.status === "fulfilled" && memsRes.value.data) {
        memTotal = memsRes.value.data.length;
        memsRes.value.data.forEach((m: any) => {
          items.push({
            id: `mem-${m.id}`,
            category: "member",
            title: `New member enrolled: ${m.full_name}`,
            desc: `Contact: ${m.phone || "No phone recorded"} · Status: ${m.status || "active"}`,
            memberName: m.full_name,
            memberId: m.id,
            timestamp: m.created_at,
            metaBadge: "New Member",
          });
        });
      }

      // 6. Onboarding
      if (onbRes.status === "fulfilled" && onbRes.value.data) {
        onbRes.value.data.forEach((o: any) => {
          const actor = o.actor_name || "Staff";
          const eventLabel = (o.event_type || "form_updated").replace(/_/g, " ");

          items.push({
            id: `onb-${o.id}`,
            category: "onboarding",
            title: `Onboarding: ${eventLabel}`,
            desc: `Handled by ${actor} (${o.actor_type || "system"})`,
            memberName: actor,
            memberId: o.member_id,
            timestamp: o.created_at,
            metaBadge: "Onboarding",
          });
        });
      }

      // Sort all items descending by timestamp
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(items);

      setMetrics({
        todayCheckins: todayCheckinCount,
        totalPayments: payCount,
        activeBookings: activeBkCount,
        totalMembers: memTotal,
      });

      if (isManual) {
        show({ title: "Activity feed updated live", type: "success" });
      }
    } catch (err) {
      console.error("Error loading activities feed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, [roleData.org_id]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    const now = Date.now();
    return activities.filter((item) => {
      // Category filter
      if (filterCategory !== "all" && item.category !== filterCategory) return false;

      // Time filter
      if (timeFilter === "today") {
        const itemDate = new Date(item.timestamp);
        const today = new Date();
        if (
          itemDate.getDate() !== today.getDate() ||
          itemDate.getMonth() !== today.getMonth() ||
          itemDate.getFullYear() !== today.getFullYear()
        ) {
          return false;
        }
      } else if (timeFilter === "week") {
        const itemTime = new Date(item.timestamp).getTime();
        if (now - itemTime > 7 * 86400 * 1000) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.title.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          item.memberName.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [activities, filterCategory, timeFilter, searchQuery]);

  // Category styles
  const categoryConfig: Record<string, { icon: any; color: string; bg: string; border: string }> = {
    check_in: { icon: UserCheck, color: "#10b981", bg: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.25)" },
    payment: { icon: IndianRupee, color: "#0ea5e9", bg: "rgba(14, 165, 233, 0.12)", border: "rgba(14, 165, 233, 0.25)" },
    booking: { icon: CalendarDays, color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.12)", border: "rgba(139, 92, 246, 0.25)" },
    membership: { icon: ShieldCheck, color: "#f59e0b", bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.25)" },
    member: { icon: UserPlus, color: "#6366f1", bg: "rgba(99, 102, 241, 0.12)", border: "rgba(99, 102, 241, 0.25)" },
    onboarding: { icon: Sparkles, color: "#ec4899", bg: "rgba(236, 72, 153, 0.12)", border: "rgba(236, 72, 153, 0.25)" },
  };

  return (
    <div style={{ padding: "28px 32px 64px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: "#ec4899", textTransform: "uppercase" }}>
              NOTIFICATIONS & AUDIT
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 12, backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#10b981", fontSize: 11, fontWeight: 700 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981" }} />
              LIVE FEED
            </span>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>
            Facility Activity Feed
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: 4, margin: 0 }}>
            Real-time chronological timeline of all member check-ins, payments, class bookings, and gym events.
          </p>
        </div>

        <button
          onClick={() => loadFeed(true)}
          disabled={refreshing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            borderRadius: 10,
            border: "1px solid var(--border-color, #e5e7eb)",
            backgroundColor: "var(--card-bg, #ffffff)",
            color: "var(--text-primary)",
            fontSize: 13,
            fontWeight: 600,
            cursor: refreshing ? "not-allowed" : "pointer",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          <span>{refreshing ? "Syncing..." : "Refresh Feed"}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Check-ins Today</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(16, 185, 129, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10b981" }}>
              <UserCheck size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : metrics.todayCheckins}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Recorded via member check-in log
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Recent Payments</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(14, 165, 233, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
              <IndianRupee size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : metrics.totalPayments}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Invoices and fee collections
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Class Bookings</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(139, 92, 246, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#8b5cf6" }}>
              <CalendarDays size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : metrics.activeBookings}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Class reservations made
          </div>
        </div>

        <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)" }}>Total Facility Events</span>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "rgba(236, 72, 153, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ec4899" }}>
              <Activity size={16} />
            </div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--text-primary)" }}>
            {loading ? <Skeleton style={{ width: 45, height: 32 }} /> : activities.length}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", marginTop: 4 }}>
            Aggregated audit entries
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div style={{ backgroundColor: "var(--card-bg, #ffffff)", border: "1px solid var(--border-color, #e5e7eb)", borderRadius: 14, overflow: "hidden" }}>
        {/* Filter Bar */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color, #e5e7eb)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 360 }}>
            <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
            <input
              type="text"
              placeholder="Search member, activity, or keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 34px",
                borderRadius: 8,
                border: "1px solid var(--border-color, #e5e7eb)",
                backgroundColor: "var(--bg-secondary, #f9fafb)",
                fontSize: 13,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { id: "all", label: "All" },
              { id: "check_in", label: "Check-ins" },
              { id: "payment", label: "Payments" },
              { id: "booking", label: "Bookings" },
              { id: "membership", label: "Memberships" },
              { id: "member", label: "Registrations" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => setFilterCategory(cat.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  border: filterCategory === cat.id ? "1px solid #ec4899" : "1px solid var(--border-color, #e5e7eb)",
                  backgroundColor: filterCategory === cat.id ? "rgba(236, 72, 153, 0.1)" : "transparent",
                  color: filterCategory === cat.id ? "#ec4899" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {(["all", "today", "week"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: 11.5,
                  fontWeight: 600,
                  textTransform: "capitalize",
                  border: timeFilter === tf ? "1px solid var(--accent-color, #3b82f6)" : "1px solid transparent",
                  backgroundColor: timeFilter === tf ? "var(--bg-secondary, #f3f4f6)" : "transparent",
                  color: timeFilter === tf ? "var(--text-primary)" : "var(--text-tertiary)",
                  cursor: "pointer",
                }}
              >
                {tf === "week" ? "Last 7 Days" : tf}
              </button>
            ))}
          </div>
        </div>

        {/* Feed List */}
        {loading ? (
          <div style={{ padding: 32 }}>
            <Skeleton style={{ height: 50, width: "100%", marginBottom: 12 }} />
            <Skeleton style={{ height: 50, width: "100%", marginBottom: 12 }} />
            <Skeleton style={{ height: 50, width: "100%" }} />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div style={{ padding: "64px 20px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(236, 72, 153, 0.12)", color: "#ec4899", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <Activity size={26} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px" }}>
              No activities found
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", maxWidth: 440, margin: "0 auto" }}>
              {searchQuery || filterCategory !== "all"
                ? "Try clearing filters to view more events."
                : "New member check-ins, payments, and class reservations will appear here in real-time."}
            </p>
          </div>
        ) : (
          <div style={{ padding: "16px 20px" }}>
            {filteredActivities.map((act) => {
              const cfg = categoryConfig[act.category] || categoryConfig.check_in;
              const Icon = cfg.icon;

              return (
                <div
                  key={act.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 14,
                    padding: "14px 16px",
                    borderRadius: 10,
                    marginBottom: 8,
                    backgroundColor: "var(--card-bg, #ffffff)",
                    border: "1px solid var(--border-color, #e5e7eb)",
                    transition: "background-color 150ms ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-secondary, #f9fafb)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--card-bg, #ffffff)")}
                >
                  <div style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    backgroundColor: cfg.bg,
                    color: cfg.color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 2,
                  }}>
                    <Icon size={18} />
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                          {act.title}
                        </span>
                        {act.metaBadge && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 7px",
                            borderRadius: 4,
                            backgroundColor: act.isLive ? "rgba(16, 185, 129, 0.12)" : "var(--bg-secondary, #f3f4f6)",
                            color: act.isLive ? "#10b981" : "var(--text-secondary)",
                          }}>
                            {act.metaBadge}
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: 12, color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                        {formatTimeAgo(act.timestamp)}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                      {act.desc}
                    </div>
                  </div>

                  {act.memberId && (
                    <Link
                      href={`/dashboard/members?id=${act.memberId}`}
                      title="View Member Details"
                      style={{
                        color: "var(--text-tertiary)",
                        padding: 6,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 2,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-tertiary)")}
                    >
                      <ExternalLink size={15} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

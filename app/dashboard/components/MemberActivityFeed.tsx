"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Info, X, RefreshCw, UserCheck, LogOut, CalendarDays,
  IndianRupee, ShieldCheck, UserPlus, Sparkles, ExternalLink,
  Clock, CheckCheck, ChevronRight, Activity, Bell
} from "lucide-react";
import { createClient } from "@/lib/supabase";

export type ActivityCategory = "all" | "check_in" | "booking" | "payment" | "membership" | "onboarding";

export type RealActivityItem = {
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

const supabase = createClient();
const STORAGE_KEY = "psync_last_activity_read";

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

export function MemberActivityFeed({ orgId }: { orgId: string | null }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const [activities, setActivities] = useState<RealActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<ActivityCategory>("all");
  const [lastRead, setLastRead] = useState<string>("");
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function updateCoords() {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const popoverWidth = 420;
    let r = Math.max(12, window.innerWidth - rect.right);
    if (window.innerWidth - r < popoverWidth + 12) {
      r = Math.max(12, window.innerWidth - popoverWidth - 12);
    }
    setCoords({
      top: rect.bottom + 8,
      right: r,
    });
  }

  // Update coords on window resize / scroll when open
  useEffect(() => {
    if (!open) return;
    updateCoords();
    window.addEventListener("resize", updateCoords, { passive: true });
    window.addEventListener("scroll", updateCoords, { passive: true });
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords);
    };
  }, [open]);

  // Initialize lastRead from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || "";
      setLastRead(stored);
    } catch {}
  }, []);

  // Fetch real activities from Supabase tables
  async function loadActivities() {
    if (!orgId) return;
    setLoading(true);

    try {
      const [attRes, bkRes, payRes, memsRes, mshipsRes, onbRes] = await Promise.allSettled([
        // 1. Attendance check-ins & check-outs
        supabase
          .from("attendance_logs")
          .select("id, check_in_at, check_out_at, method, member_id, members(id, full_name, phone)")
          .eq("org_id", orgId)
          .order("check_in_at", { ascending: false })
          .limit(20),

        // 2. Class bookings by members in app
        supabase
          .from("class_bookings")
          .select("id, booked_for, status, created_at, member_id, members(id, full_name, phone), classes(name, start_time)")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(20),

        // 3. Payments made
        supabase
          .from("payments")
          .select("id, paid_at, total_paise, method, notes, member_id, members(id, full_name, phone)")
          .eq("org_id", orgId)
          .order("paid_at", { ascending: false })
          .limit(20),

        // 4. New member registrations
        supabase
          .from("members")
          .select("id, full_name, phone, created_at")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(15),

        // 5. Memberships activated / renewed
        supabase
          .from("memberships")
          .select("id, start_date, end_date, status, created_at, member_id, members(id, full_name, phone), membership_plans(name)")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(15),

        // 6. Member Onboarding Activities (if table exists)
        supabase
          .from("member_onboarding_activities")
          .select("id, event_type, actor_name, actor_type, created_at, member_id")
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(15),
      ]);

      const items: RealActivityItem[] = [];

      // Process Attendance
      if (attRes.status === "fulfilled" && attRes.value.data) {
        attRes.value.data.forEach((a: any) => {
          const name = a.members?.full_name || "Member";
          const methodStr = a.method ? `${a.method.toUpperCase()} pass` : "Check-in";
          const isCurrentlyIn = !a.check_out_at;

          items.push({
            id: `att-${a.id}`,
            category: "check_in",
            title: `${name} checked in`,
            desc: `${methodStr} · ${isCurrentlyIn ? "Currently in gym" : "Checked out"}`,
            memberName: name,
            memberId: a.member_id,
            timestamp: a.check_in_at,
            metaBadge: isCurrentlyIn ? "In Gym" : undefined,
            isLive: isCurrentlyIn,
          });
        });
      }

      // Process Class Bookings
      if (bkRes.status === "fulfilled" && bkRes.value.data) {
        bkRes.value.data.forEach((b: any) => {
          const name = b.members?.full_name || "Member";
          const className = b.classes?.name || "Fitness Class";
          const isCancelled = b.status === "cancelled";

          items.push({
            id: `bk-${b.id}`,
            category: "booking",
            title: `${name} ${isCancelled ? "cancelled booking for" : "booked"} ${className}`,
            desc: `Scheduled for ${b.booked_for}${b.classes?.start_time ? ` at ${b.classes.start_time}` : ""}`,
            memberName: name,
            memberId: b.member_id,
            timestamp: b.created_at || `${b.booked_for}T09:00:00Z`,
            metaBadge: isCancelled ? "Cancelled" : "Booked",
          });
        });
      }

      // Process Payments
      if (payRes.status === "fulfilled" && payRes.value.data) {
        payRes.value.data.forEach((p: any) => {
          const name = p.members?.full_name || "Member";
          const inr = `₹${((p.total_paise || 0) / 100).toLocaleString("en-IN")}`;
          const method = p.method ? p.method.toUpperCase() : "Online";

          items.push({
            id: `pay-${p.id}`,
            category: "payment",
            title: `Payment of ${inr} from ${name}`,
            desc: `${p.notes || "Gym membership fee"} (${method})`,
            memberName: name,
            memberId: p.member_id,
            timestamp: p.paid_at,
            metaBadge: method,
          });
        });
      }

      // Process Memberships
      if (mshipsRes.status === "fulfilled" && mshipsRes.value.data) {
        mshipsRes.value.data.forEach((m: any) => {
          const name = m.members?.full_name || "Member";
          const plan = m.membership_plans?.name || "Membership";

          items.push({
            id: `ms-${m.id}`,
            category: "membership",
            title: `${plan} active for ${name}`,
            desc: `Valid from ${m.start_date} to ${m.end_date || "Ongoing"}`,
            memberName: name,
            memberId: m.member_id,
            timestamp: m.created_at || `${m.start_date}T00:00:00Z`,
            metaBadge: m.status === "active" ? "Active Plan" : m.status,
          });
        });
      }

      // Process New Member Registrations
      if (memsRes.status === "fulfilled" && memsRes.value.data) {
        memsRes.value.data.forEach((m: any) => {
          items.push({
            id: `mem-${m.id}`,
            category: "member",
            title: `New member registered: ${m.full_name}`,
            desc: `Account activated${m.phone ? ` · ${m.phone}` : ""}`,
            memberName: m.full_name,
            memberId: m.id,
            timestamp: m.created_at,
            metaBadge: "New Member",
          });
        });
      }

      // Process Onboarding Activities (if table present)
      if (onbRes.status === "fulfilled" && onbRes.value.data) {
        onbRes.value.data.forEach((o: any) => {
          const actor = o.actor_name || "Member";
          let label = "Updated onboarding details";
          if (o.event_type === "form_submitted" || o.event_type === "submitted") label = "Submitted onboarding health form";
          else if (o.event_type === "form_viewed" || o.event_type === "viewed") label = "Opened onboarding in app";
          else if (o.event_type === "synced") label = "Onboarding synced to profile";

          items.push({
            id: `onb-${o.id}`,
            category: "onboarding",
            title: `${actor}: ${label}`,
            desc: `Digital Onboarding Event (${o.actor_type})`,
            memberName: actor,
            memberId: o.member_id,
            timestamp: o.created_at,
            metaBadge: "Onboarding",
          });
        });
      }

      // Sort strictly descending by timestamp
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(items);
    } catch (err) {
      console.error("Failed to load member activities:", err);
    } finally {
      setLoading(false);
    }
  }

  // Load when orgId changes or popover opens
  useEffect(() => {
    if (orgId) {
      loadActivities();
    }
  }, [orgId]);

  // Realtime subscription to live updates
  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("dashboard-member-activity")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_logs", filter: `org_id=eq.${orgId}` },
        () => loadActivities()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_bookings", filter: `org_id=eq.${orgId}` },
        () => loadActivities()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `org_id=eq.${orgId}` },
        () => loadActivities()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  // Click outside to dismiss
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  // Unread items count (items newer than lastRead)
  const unreadCount = useMemo(() => {
    if (!lastRead) return activities.length;
    const lastReadTime = new Date(lastRead).getTime();
    return activities.filter((a) => new Date(a.timestamp).getTime() > lastReadTime).length;
  }, [activities, lastRead]);

  // Mark all read
  function markAllRead() {
    const nowIso = new Date().toISOString();
    setLastRead(nowIso);
    try {
      localStorage.setItem(STORAGE_KEY, nowIso);
    } catch {}
  }

  // Handle open
  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        updateCoords();
        loadActivities();
      }
      return next;
    });
  }

  // Filtered activities list
  const filteredActivities = useMemo(() => {
    if (filter === "all") return activities;
    if (filter === "check_in") return activities.filter((a) => a.category === "check_in");
    if (filter === "booking") return activities.filter((a) => a.category === "booking");
    if (filter === "payment") return activities.filter((a) => a.category === "payment");
    if (filter === "membership") return activities.filter((a) => a.category === "membership" || a.category === "member");
    if (filter === "onboarding") return activities.filter((a) => a.category === "onboarding");
    return activities;
  }, [activities, filter]);

  const countsByCategory = useMemo(() => {
    return {
      all: activities.length,
      check_in: activities.filter((a) => a.category === "check_in").length,
      booking: activities.filter((a) => a.category === "booking").length,
      payment: activities.filter((a) => a.category === "payment").length,
      membership: activities.filter((a) => a.category === "membership" || a.category === "member").length,
      onboarding: activities.filter((a) => a.category === "onboarding").length,
    };
  }, [activities]);

  // Helper to render activity icon
  function renderIcon(cat: RealActivityItem["category"]) {
    switch (cat) {
      case "check_in":
        return <UserCheck size={15} style={{ color: "#10b981" }} />;
      case "booking":
        return <CalendarDays size={15} style={{ color: "#8b5cf6" }} />;
      case "payment":
        return <IndianRupee size={15} style={{ color: "#0a66d6" }} />;
      case "membership":
        return <ShieldCheck size={15} style={{ color: "#f59e0b" }} />;
      case "onboarding":
        return <Sparkles size={15} style={{ color: "#ec4899" }} />;
      case "member":
      default:
        return <UserPlus size={15} style={{ color: "#3b82f6" }} />;
    }
  }

  return (
    <div className="af-container">
      <style>{FEED_CSS}</style>

      {/* ── Bell Trigger Button ── */}
      <button
        ref={buttonRef}
        type="button"
        className={`ps-btn db-btn-icon af-trigger ${open ? "af-trigger--active" : ""}`}
        onClick={toggleOpen}
        title="Member Activity & Live App Notifications"
        aria-label="Member Activity & Live App Notifications"
        aria-expanded={open}
      >
        <Bell size={16} strokeWidth={2.4} />
        {unreadCount > 0 && (
          <span className="af-unread-dot" title={`${unreadCount} new member updates`} />
        )}
      </button>

      {/* ── Popover Feed Panel (Portal to body to float above all widgets) ── */}
      {mounted && open && coords && createPortal(
        <>
          <div className="af-backdrop" onClick={() => setOpen(false)} />
          <div
            ref={popoverRef}
            className="af-popover"
            style={{
              position: "fixed",
              top: coords.top,
              right: coords.right,
              zIndex: 999999,
            }}
            role="dialog"
            aria-label="Member Activity & Updates"
          >
          {/* Header */}
          <div className="af-header">
            <div className="af-header-title">
              <span className="af-icon-wrap">
                <Bell size={16} />
              </span>
              <div>
                <strong>Member Activity & Updates</strong>
              </div>
            </div>

            <div className="af-header-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="af-action-link"
                  onClick={markAllRead}
                  title="Mark all updates as seen"
                >
                  <CheckCheck size={13} />
                  <span>Mark read</span>
                </button>
              )}
              <button
                type="button"
                className={`af-icon-btn ${loading ? "af-spin" : ""}`}
                onClick={loadActivities}
                title="Refresh live activity"
              >
                <RefreshCw size={14} />
              </button>
              <button
                type="button"
                className="af-icon-btn"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Filter Chips Bar */}
          <div className="af-filters">
            <button
              type="button"
              className={`af-chip ${filter === "all" ? "af-chip--active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All <span className="af-chip-count">{countsByCategory.all}</span>
            </button>
            <button
              type="button"
              className={`af-chip ${filter === "check_in" ? "af-chip--active" : ""}`}
              onClick={() => setFilter("check_in")}
            >
              Check-ins <span className="af-chip-count">{countsByCategory.check_in}</span>
            </button>
            <button
              type="button"
              className={`af-chip ${filter === "booking" ? "af-chip--active" : ""}`}
              onClick={() => setFilter("booking")}
            >
              Bookings <span className="af-chip-count">{countsByCategory.booking}</span>
            </button>
            <button
              type="button"
              className={`af-chip ${filter === "payment" ? "af-chip--active" : ""}`}
              onClick={() => setFilter("payment")}
            >
              Payments <span className="af-chip-count">{countsByCategory.payment}</span>
            </button>
            <button
              type="button"
              className={`af-chip ${filter === "membership" ? "af-chip--active" : ""}`}
              onClick={() => setFilter("membership")}
            >
              Plans <span className="af-chip-count">{countsByCategory.membership}</span>
            </button>
            {countsByCategory.onboarding > 0 && (
              <button
                type="button"
                className={`af-chip ${filter === "onboarding" ? "af-chip--active" : ""}`}
                onClick={() => setFilter("onboarding")}
              >
                Onboarding <span className="af-chip-count">{countsByCategory.onboarding}</span>
              </button>
            )}
          </div>

          {/* Activities List */}
          <div className="af-list">
            {loading && activities.length === 0 ? (
              <div className="af-loading">
                <RefreshCw size={18} className="af-spin" />
                <span>Loading real member activity...</span>
              </div>
            ) : filteredActivities.length === 0 ? (
              <div className="af-empty">
                <Bell size={28} style={{ color: "var(--text-tertiary)", opacity: 0.6, margin: "0 auto 8px" }} />
                <strong>No activities in this category</strong>
                <p>Real check-ins, bookings, and payments will appear here as members interact with the app.</p>
              </div>
            ) : (
              filteredActivities.map((act) => {
                const isNew = lastRead ? new Date(act.timestamp).getTime() > new Date(lastRead).getTime() : false;

                return (
                  <div key={act.id} className={`af-row ${isNew ? "af-row--new" : ""}`}>
                    <div className="af-row-icon" data-cat={act.category}>
                      {renderIcon(act.category)}
                    </div>

                    <div className="af-row-content">
                      <div className="af-row-top">
                        {act.memberId ? (
                          <Link
                            href={`/dashboard/members/${act.memberId}`}
                            className="af-row-title af-row-link"
                            onClick={() => setOpen(false)}
                          >
                            <span>{act.title}</span>
                          </Link>
                        ) : (
                          <span className="af-row-title">{act.title}</span>
                        )}
                        <span className="af-row-time">{formatTimeAgo(act.timestamp)}</span>
                      </div>

                      <div className="af-row-bottom">
                        <span className="af-row-desc">{act.desc}</span>
                        {act.metaBadge && (
                          <span className={`af-badge af-badge--${act.category}`}>
                            {act.isLive && <span className="af-live-dot" />}
                            {act.metaBadge}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </>,
      document.body
    )}
    </div>
  );
}

const FEED_CSS = `
.af-container {
  position: relative;
  display: inline-flex;
}

.af-trigger {
  position: relative;
  border-radius: 9px;
  color: var(--text-secondary);
  transition: all 140ms ease;
}
.af-trigger:hover,
.af-trigger--active {
  background: var(--surface-3, rgba(118, 118, 128, 0.12)) !important;
  color: var(--text-primary) !important;
}

.af-unread-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #0a66d6;
  box-shadow: 0 0 6px rgba(10, 102, 214, 0.9);
  border: 1.5px solid var(--surface, #ffffff);
}

.af-backdrop {
  position: fixed;
  inset: 0;
  z-index: 999998 !important;
  background: rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(1px);
  animation: af-fade-in 100ms ease-out;
}

.af-popover {
  position: fixed;
  width: 420px;
  max-width: calc(100vw - 24px);
  background: var(--surface, #ffffff);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 60px -8px rgba(0, 0, 0, 0.35), 0 0 1px rgba(0, 0, 0, 0.18);
  z-index: 999999 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: af-fade-in 140ms ease-out;
}

@media (max-width: 600px) {
  .af-popover {
    top: 60px !important;
    left: 10px !important;
    right: 10px !important;
    width: auto !important;
    max-width: none !important;
  }
}

@keyframes af-fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.af-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface, #ffffff);
}

.af-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}
.af-header-title strong {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.2;
}

.af-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-dim, rgba(10, 102, 214, 0.1));
  color: var(--accent, #0a66d6);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}


.af-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.af-action-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent, #0a66d6);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
}
.af-action-link:hover {
  background: var(--accent-dim, rgba(10, 102, 214, 0.08));
}

.af-icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 120ms ease;
}
.af-icon-btn:hover {
  background: var(--surface-2, rgba(0,0,0,0.06));
  color: var(--text-primary);
}

.af-spin {
  animation: af-rotating 1s linear infinite;
}
@keyframes af-rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.af-filters {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--surface-2, rgba(0,0,0,0.02));
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}
.af-filters::-webkit-scrollbar {
  display: none;
}

.af-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 550;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  transition: all 120ms ease;
}
.af-chip:hover {
  background: var(--surface, #ffffff);
  color: var(--text-primary);
}
.af-chip--active {
  background: var(--surface, #ffffff);
  color: var(--accent, #0a66d6);
  border-color: var(--border-mid, rgba(0,0,0,0.14));
  font-weight: 650;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.af-chip-count {
  font-size: 10.5px;
  opacity: 0.75;
}

.af-list {
  max-height: 420px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px 0;
}

.af-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-light, rgba(0,0,0,0.04));
  transition: background 120ms ease;
}
.af-row:last-child {
  border-bottom: none;
}
.af-row:hover {
  background: var(--surface-2, rgba(0,0,0,0.03));
}
.af-row--new {
  background: var(--accent-dim, rgba(10, 102, 214, 0.04));
}

.af-row-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--surface-2, rgba(0,0,0,0.05));
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.af-row-icon[data-cat="check_in"] {
  background: rgba(16, 185, 129, 0.12);
}
.af-row-icon[data-cat="booking"] {
  background: rgba(139, 92, 246, 0.12);
}
.af-row-icon[data-cat="payment"] {
  background: rgba(10, 102, 214, 0.12);
}
.af-row-icon[data-cat="membership"] {
  background: rgba(245, 158, 11, 0.12);
}
.af-row-icon[data-cat="onboarding"] {
  background: rgba(236, 72, 153, 0.12);
}

.af-row-content {
  flex: 1;
  min-width: 0;
}

.af-row-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.af-row-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.af-row-link {
  text-decoration: none;
}
.af-row-link:hover {
  color: var(--accent, #0a66d6);
  text-decoration: underline;
}

.af-row-time {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
}

.af-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
}

.af-row-desc {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.af-badge {
  font-size: 10.5px;
  font-weight: 650;
  padding: 1px 6px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  background: var(--surface-2, rgba(0,0,0,0.06));
  color: var(--text-secondary);
}
.af-badge--check_in {
  background: rgba(16, 185, 129, 0.14);
  color: #059669;
}
.af-badge--booking {
  background: rgba(139, 92, 246, 0.14);
  color: #7c3aed;
}
.af-badge--payment {
  background: rgba(10, 102, 214, 0.14);
  color: #0a66d6;
}

.af-live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10b981;
}

.af-loading, .af-empty {
  padding: 36px 20px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.af-empty strong {
  color: var(--text-primary);
  font-size: 13.5px;
}
.af-empty p {
  margin: 0;
  font-size: 12px;
  color: var(--text-tertiary);
  max-width: 280px;
}

/* Dark mode overrides */
.dark .af-popover {
  background: var(--surface, #1c1c1e);
  box-shadow: 0 24px 56px rgba(0,0,0,0.65), 0 0 1px rgba(255,255,255,0.15);
}
.dark .af-chip--active {
  background: var(--surface-3, #2c2c2e);
  color: #3b99fc;
}
.dark .af-unread-dot {
  border-color: #1c1c1e;
}
`;

"use client";
// app/dashboard/classes/bookings/page.tsx
// Active bookings dashboard: view and manage member class reservations across dates and trainers.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, Ticket, Search, Plus, Trash2, CheckCircle,
  Clock, User, AlertCircle, RefreshCw, X, ChevronRight,
  ArrowLeft, Phone, CalendarCheck, Check
} from "lucide-react";
import { DesignStyles } from "../../components/DesignSystem";
import { Skeleton, useToast } from "../../components/ui";
import { createClient } from "@/lib/supabase";

const supabase = createClient();

interface BookingItem {
  id: string;
  class_id: string;
  member_id: string;
  booked_for: string; // YYYY-MM-DD
  status: "booked" | "cancelled" | "attended";
  session_deducted: boolean;
  created_at: string;
  members: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
  } | null;
  classes: {
    id: string;
    name: string;
    trainer_name: string | null;
    schedule_day: string;
    start_time: string;
    duration_mins: number;
    color: string;
    capacity: number;
  } | null;
}

interface GymClassOption {
  id: string;
  name: string;
  trainer_name: string | null;
  start_time: string;
  capacity: number;
}

interface MemberOption {
  id: string;
  full_name: string;
  phone: string | null;
}

type DateTab = "all_active" | "today" | "upcoming" | "history";

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ActiveBookingsPage() {
  const { toast, show } = useToast();
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [classesList, setClassesList] = useState<GymClassOption[]>([]);
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<DateTab>("all_active");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // New Booking Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => toLocalIso(new Date()));
  const [submitting, setSubmitting] = useState(false);

  const todayIso = useMemo(() => toLocalIso(new Date()), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase.from("user_roles").select("org_id").eq("user_id", user.id).single();
      if (!roleData?.org_id) return;
      setOrgId(roleData.org_id);

      const [bookingsRes, classesRes, membersRes] = await Promise.all([
        supabase
          .from("class_bookings")
          .select("id, class_id, member_id, booked_for, status, session_deducted, created_at, members(id, full_name, phone, email), classes(id, name, trainer_name, schedule_day, start_time, duration_mins, color, capacity)")
          .eq("org_id", roleData.org_id)
          .order("booked_for", { ascending: true })
          .limit(1000),
        supabase
          .from("classes")
          .select("id, name, trainer_name, start_time, capacity")
          .eq("org_id", roleData.org_id)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("members")
          .select("id, full_name, phone")
          .eq("org_id", roleData.org_id)
          .eq("status", "active")
          .order("full_name")
          .limit(500),
      ]);

      if (bookingsRes.data) setBookings(bookingsRes.data as unknown as BookingItem[]);
      if (classesRes.data) setClassesList(classesRes.data as GymClassOption[]);
      if (membersRes.data) setMembersList(membersRes.data as MemberOption[]);
    } catch (err) {
      console.error("Error loading bookings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Cancel Booking
  async function handleCancelBooking(booking: BookingItem) {
    const memberName = booking.members?.full_name ?? "Member";
    if (!confirm(`Cancel class booking for ${memberName}?`)) return;

    setCancellingId(booking.id);
    try {
      const { error } = await supabase
        .from("class_bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);
      if (error) throw error;

      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: "cancelled" } : b))
      );
      show(`Reservation for ${memberName} cancelled`);
    } catch (err: unknown) {
      show("Failed to cancel booking: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setCancellingId(null);
    }
  }

  // Create Booking
  async function handleCreateBooking() {
    if (!orgId || !selectedClassId || !selectedMemberId || !bookingDate) {
      show("Please select a class, member, and date", "error");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("class_bookings")
        .insert({
          org_id: orgId,
          class_id: selectedClassId,
          member_id: selectedMemberId,
          booked_for: bookingDate,
          status: "booked",
          session_deducted: false,
        })
        .select("id, class_id, member_id, booked_for, status, session_deducted, created_at, members(id, full_name, phone, email), classes(id, name, trainer_name, schedule_day, start_time, duration_mins, color, capacity)")
        .single();

      if (error) throw error;
      if (data) {
        setBookings((prev) => [...prev, data as unknown as BookingItem]);
      }
      show("Member booked successfully");
      setIsModalOpen(false);
      setSelectedMemberId("");
    } catch (err: unknown) {
      show("Could not create booking: " + (err instanceof Error ? err.message : String(err)), "error");
    } finally {
      setSubmitting(false);
    }
  }

  // Filtered Bookings
  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      // Tab filter
      const isBooked = b.status === "booked";
      if (tab === "all_active" && !isBooked) return false;
      if (tab === "today" && (!isBooked || b.booked_for !== todayIso)) return false;
      if (tab === "upcoming" && (!isBooked || b.booked_for <= todayIso)) return false;
      if (tab === "history" && isBooked && b.booked_for >= todayIso) return false;

      // Class filter
      if (classFilter !== "all" && b.class_id !== classFilter) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const memberMatch = b.members?.full_name?.toLowerCase().includes(q);
        const phoneMatch = b.members?.phone?.includes(q);
        const classMatch = b.classes?.name?.toLowerCase().includes(q);
        const trainerMatch = b.classes?.trainer_name?.toLowerCase().includes(q);
        if (!memberMatch && !phoneMatch && !classMatch && !trainerMatch) return false;
      }

      return true;
    });
  }, [bookings, tab, classFilter, search, todayIso]);

  // Counts
  const counts = useMemo(() => {
    const active = bookings.filter((b) => b.status === "booked");
    const todayCount = active.filter((b) => b.booked_for === todayIso).length;
    const upcomingCount = active.filter((b) => b.booked_for > todayIso).length;
    const uniqueMembers = new Set(active.map((b) => b.member_id)).size;
    return {
      all_active: active.length,
      today: todayCount,
      upcoming: upcomingCount,
      uniqueMembers,
      history: bookings.filter((b) => b.status === "cancelled" || b.booked_for < todayIso).length,
    };
  }, [bookings, todayIso]);

  return (
    <div className="ps-page db">
      <DesignStyles />
      {toast}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Link href="/dashboard/classes" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, color: "var(--text-tertiary)", textDecoration: "none" }}>
              <ArrowLeft size={14} /> Back to Classes calendar
            </Link>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Active Bookings
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Monitor real-time class enrollments, today’s attendees, and manage reservations.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="ps-btn ps-btn--secondary" onClick={loadData}>
            <RefreshCw size={15} /> <span>Refresh</span>
          </button>
          <Link href="/dashboard/classes" className="ps-btn ps-btn--secondary">
            <CalendarDays size={16} /> <span>Classes Calendar</span>
          </Link>
          <button type="button" className="ps-btn ps-btn--primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={16} strokeWidth={2.4} /> <span>Book Member</span>
          </button>
        </div>
      </header>

      {/* KPI Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div
          onClick={() => setTab("all_active")}
          style={{
            background: "var(--surface)",
            border: tab === "all_active" ? "2px solid var(--accent)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Active Bookings</span>
            <Ticket size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.all_active}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Across upcoming sessions</div>
        </div>

        <div
          onClick={() => setTab("today")}
          style={{
            background: "var(--surface)",
            border: tab === "today" ? "2px solid var(--green)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Booked For Today</span>
            <CalendarCheck size={18} style={{ color: "var(--green)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: counts.today > 0 ? "var(--green)" : "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.today}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Scheduled for today</div>
        </div>

        <div
          onClick={() => setTab("upcoming")}
          style={{
            background: "var(--surface)",
            border: tab === "upcoming" ? "2px solid var(--purple)" : "1px solid var(--border)",
            borderRadius: 14,
            padding: "16px 18px",
            cursor: "pointer",
            transition: "all 150ms",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Upcoming Future</span>
            <Clock size={18} style={{ color: "var(--purple)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.upcoming}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Days ahead</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Unique Members</span>
            <User size={18} style={{ color: "var(--amber)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            {loading ? <Skeleton width={40} height={28} /> : counts.uniqueMembers}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Members participating</div>
        </div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
          background: "var(--surface)",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: 9 }}>
          {(["all_active", "today", "upcoming", "history"] as DateTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                border: "none",
                background: tab === t ? "var(--surface)" : "transparent",
                color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: tab === t ? 650 : 500,
                fontSize: 13,
                padding: "6px 12px",
                borderRadius: 7,
                cursor: "pointer",
                boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              }}
            >
              {t === "all_active"
                ? `All Active (${counts.all_active})`
                : t === "today"
                ? `Today (${counts.today})`
                : t === "upcoming"
                ? `Upcoming (${counts.upcoming})`
                : `Past / Cancelled (${counts.history})`}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookings by member or class name..."
            className="ps-input"
            style={{ width: "100%", paddingLeft: 32, height: 36, fontSize: 13 }}
          />
        </div>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All classes</option>
          {classesList.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Bookings Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 24 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "center", padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                <Skeleton width={180} height={18} />
                <Skeleton width={120} height={16} />
                <Skeleton width={100} height={16} />
                <div style={{ marginLeft: "auto" }}><Skeleton width={80} height={28} /></div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 20px" }}>
            <Ticket size={36} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>No bookings found</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, margin: "0 0 16px" }}>
              {tab === "today"
                ? "There are no member reservations scheduled for today."
                : "Book members into class sessions to see them here."}
            </p>
            <button type="button" className="ps-btn ps-btn--primary" onClick={() => setIsModalOpen(true)}>
              <Plus size={15} /> Book a Member
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 650 }}>
                  <th style={{ padding: "12px 16px" }}>Member</th>
                  <th style={{ padding: "12px 14px" }}>Class</th>
                  <th style={{ padding: "12px 14px" }}>Booked For</th>
                  <th style={{ padding: "12px 14px" }}>Time & Trainer</th>
                  <th style={{ padding: "12px 14px" }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const isToday = b.booked_for === todayIso;
                  const isCancelled = b.status === "cancelled";

                  return (
                    <tr
                      key={b.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        opacity: isCancelled ? 0.6 : 1,
                      }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <Link
                          href={`/dashboard/members/${b.member_id}`}
                          style={{ fontWeight: 650, color: "var(--text-primary)", textDecoration: "none" }}
                        >
                          {b.members?.full_name ?? "Unknown Member"}
                        </Link>
                        {b.members?.phone && (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                            {b.members.phone}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                          {b.classes?.name ?? "Class"}
                        </div>
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: isToday ? 700 : 500, color: isToday ? "var(--green)" : "var(--text-primary)" }}>
                          <CalendarDays size={14} />
                          <span>{b.booked_for}</span>
                        </div>
                        {isToday && (
                          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "var(--green)", background: "rgba(34, 197, 94, 0.12)", padding: "1px 6px", borderRadius: 4 }}>
                            Today
                          </span>
                        )}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <div>{b.classes?.start_time ?? "—"} ({b.classes?.duration_mins ?? 60}m)</div>
                        {b.classes?.trainer_name && (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2 }}>
                            with {b.classes.trainer_name}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 12,
                            background: isCancelled
                              ? "var(--surface-2)"
                              : isToday
                              ? "rgba(34, 197, 94, 0.12)"
                              : "var(--accent-dim)",
                            color: isCancelled
                              ? "var(--text-tertiary)"
                              : isToday
                              ? "var(--green)"
                              : "var(--accent)",
                            textTransform: "capitalize",
                          }}
                        >
                          {b.status}
                        </span>
                      </td>

                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {!isCancelled && (
                            <button
                              type="button"
                              className="ps-btn ps-btn--secondary"
                              style={{ height: 28, padding: "0 10px", fontSize: 12, color: "var(--red)" }}
                              disabled={cancellingId === b.id}
                              onClick={() => handleCancelBooking(b)}
                            >
                              Cancel
                            </button>
                          )}
                          <Link
                            href={`/dashboard/members/${b.member_id}`}
                            className="ps-btn ps-btn--secondary"
                            style={{ height: 28, padding: "0 8px" }}
                            title="View member profile"
                          >
                            <ChevronRight size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Book Member Modal */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              maxWidth: 440,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Book Member into Class</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Select Class *
                </label>
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="ps-select"
                  style={{ width: "100%", height: 38 }}
                >
                  <option value="">-- Choose a class --</option>
                  {classesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.trainer_name ? `(${c.trainer_name})` : ""} - {c.start_time}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Select Member *
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="ps-select"
                  style={{ width: "100%", height: 38 }}
                >
                  <option value="">-- Choose active member --</option>
                  {membersList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} {m.phone ? `(${m.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Booking Date *
                </label>
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="ps-input"
                  style={{ width: "100%", height: 38 }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  className="ps-btn ps-btn--secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn--primary"
                  disabled={submitting}
                  onClick={handleCreateBooking}
                >
                  {submitting ? "Booking..." : "Confirm Booking"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

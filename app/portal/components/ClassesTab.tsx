"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  Loader2,
  Sparkles,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import type { PortalMember, PortalClass, PortalClassBooking } from "../types";
import { supabase } from "@/lib/supabase";

interface ClassesTabProps {
  member: PortalMember;
}

export function ClassesTab({ member }: ClassesTabProps) {
  const [classes, setClasses] = useState<PortalClass[]>([]);
  const [bookings, setBookings] = useState<PortalClassBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookingClassId, setBookingClassId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const todayIso = new Date().toISOString().slice(0, 10);
      const [{ data: clsData }, { data: bData }] = await Promise.all([
        supabase
          .from("classes")
          .select("*")
          .eq("org_id", member.org_id)
          .eq("is_active", true)
          .order("start_time"),
        supabase
          .from("class_bookings")
          .select("*, classes(*)")
          .eq("member_id", member.id)
          .eq("status", "booked")
          .gte("booked_for", todayIso)
          .order("booked_for", { ascending: true }),
      ]);

      setClasses((clsData as PortalClass[]) || []);
      setBookings((bData as unknown as PortalClassBooking[]) || []);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [member.id, member.org_id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleBook(cls: PortalClass) {
    setBookingClassId(cls.id);
    setMessage(null);

    // Calculate next occurrence date for this class
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    try {
      const { error } = await supabase.from("class_bookings").insert({
        org_id: member.org_id,
        member_id: member.id,
        class_id: cls.id,
        booked_for: todayIso,
        status: "booked",
      });

      if (error) {
        setMessage({ text: "Could not book class. Try again.", type: "error" });
      } else {
        setMessage({ text: `Spot confirmed for ${cls.name}!`, type: "success" });
        await loadData();
      }
    } catch {
      setMessage({ text: "Network error booking class.", type: "error" });
    } finally {
      setBookingClassId(null);
    }
  }

  async function handleCancel(bookingId: string, className: string) {
    try {
      await supabase.from("class_bookings").update({ status: "cancelled" }).eq("id", bookingId);
      setMessage({ text: `Reservation for ${className} cancelled.`, type: "success" });
      await loadData();
    } catch {
      setMessage({ text: "Failed to cancel booking.", type: "error" });
    }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
        <Loader2 size={24} className="ps-spin" style={{ color: "var(--accent)" }} />
      </div>
    );
  }

  const bookedClassIds = new Set(bookings.map((b) => b.class_id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── NOTIFICATION BANNER ── */}
      {message && (
        <div
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: message.type === "success" ? "var(--green-dim)" : "var(--red-dim)",
            color: message.type === "success" ? "var(--green)" : "var(--red)",
          }}
        >
          {message.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── MY UPCOMING BOOKINGS ── */}
      {bookings.length > 0 && (
        <div className="portal-card" style={{ gap: 10 }}>
          <div className="portal-card-title" style={{ fontSize: 14 }}>
            <Calendar size={16} style={{ color: "var(--accent)" }} />
            <span>My Bookings ({bookings.length})</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bookings.map((b) => {
              const cls = b.classes;
              return (
                <div
                  key={b.id}
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{cls?.name || "Group Class"}</div>
                    <div style={{ fontSize: 11.5, color: "var(--text-secondary)", marginTop: 2 }}>
                      {b.booked_for} • {cls?.start_time || "TBD"} ({cls?.duration_mins || 45} mins)
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleCancel(b.id, cls?.name || "Class")}
                    className="ps-btn ps-btn--sm"
                    style={{
                      background: "rgba(255, 59, 48, 0.1)",
                      color: "var(--red)",
                      border: "none",
                      fontSize: 11.5,
                      fontWeight: 600,
                      padding: "4px 8px",
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── ALL AVAILABLE CLASSES ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Group Schedule</div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{classes.length} classes available</div>
      </div>

      {classes.length === 0 ? (
        <div className="portal-card" style={{ padding: "36px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>No group classes scheduled yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {classes.map((cls) => {
            const isBooked = bookedClassIds.has(cls.id);
            const isBookingThis = bookingClassId === cls.id;

            return (
              <div key={cls.id} className="portal-card" style={{ gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        color: "var(--accent)",
                      }}
                    >
                      {cls.schedule_day || "Everyday"}
                    </span>
                    <div style={{ fontSize: 16, fontWeight: 750, marginTop: 2 }}>{cls.name}</div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      fontWeight: 650,
                      color: "var(--text-secondary)",
                      background: "var(--fill)",
                      padding: "4px 8px",
                      borderRadius: 8,
                    }}
                  >
                    <Clock size={13} />
                    <span>{cls.start_time}</span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)" }}>
                    <User size={13} />
                    <span>Trainer: <b>{cls.trainer_name || "Gym Instructor"}</b></span>
                    <span>•</span>
                    <span>{cls.duration_mins} mins</span>
                  </div>

                  {isBooked ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        color: "var(--green)",
                        background: "var(--green-dim)",
                        padding: "6px 12px",
                        borderRadius: 999,
                      }}
                    >
                      <CheckCircle2 size={14} /> Booked
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isBookingThis}
                      onClick={() => handleBook(cls)}
                      className="ps-btn ps-btn--primary ps-btn--sm"
                      style={{
                        padding: "6px 14px",
                        borderRadius: 999,
                        fontSize: 12.5,
                        fontWeight: 650,
                        cursor: "pointer",
                      }}
                    >
                      {isBookingThis ? <Loader2 size={14} className="ps-spin" /> : "Book Spot"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

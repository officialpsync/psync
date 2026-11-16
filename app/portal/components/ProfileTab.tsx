"use client";

import { useState } from "react";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Receipt,
  Clock,
  LogOut,
  Target,
  Activity,
  Heart,
  Scale,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import type {
  PortalMember,
  PortalMembership,
  PortalAttendanceLog,
  PortalPayment,
} from "../types";

interface ProfileTabProps {
  member: PortalMember;
  membership: PortalMembership | null;
  attendance: PortalAttendanceLog[];
  payments: PortalPayment[];
  onLogout: () => void;
}

export function ProfileTab({
  member,
  membership,
  attendance,
  payments,
  onLogout,
}: ProfileTabProps) {
  const [copiedId, setCopiedId] = useState(false);

  const shortId = member.id ? member.id.slice(0, 8).toUpperCase() : "";

  function handleCopyId() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(member.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  }

  // BMI calculation
  const bmi =
    member.height_cm && member.weight_kg
      ? Math.round((member.weight_kg / Math.pow(member.height_cm / 100, 2)) * 10) / 10
      : null;

  const bmiCategory = bmi
    ? bmi < 18.5
      ? "Underweight"
      : bmi < 25
      ? "Healthy Weight"
      : bmi < 30
      ? "Overweight"
      : "High BMI"
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── PROFILE HEADER CARD ── */}
      <div className="portal-card" style={{ alignItems: "center", textAlign: "center", padding: "24px 16px" }}>
        <div className="portal-avatar" style={{ width: 68, height: 68, borderRadius: 20, fontSize: 24 }}>
          {member.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photo_url} alt={member.full_name} />
          ) : (
            <span>{member.full_name.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800 }}>{member.full_name}</h2>
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", marginTop: 2 }}>
            {member.branches?.name || "Psync Member"}
          </div>
        </div>

        {/* Member tags */}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {member.primary_goal && (
            <span className="ps-tag" style={{ textTransform: "capitalize" }}>
              <Target size={11} /> {member.primary_goal.replace(/_/g, " ")}
            </span>
          )}
          {member.diet_type && (
            <span className="ps-tag" style={{ textTransform: "capitalize" }}>
              <Heart size={11} /> {member.diet_type.replace(/_/g, " ")}
            </span>
          )}
          {bmi && (
            <span className="ps-tag">
              <Scale size={11} /> BMI {bmi} ({bmiCategory})
            </span>
          )}
        </div>
      </div>

      {/* ── PHYSICAL METRICS ── */}
      <div className="portal-stat-grid">
        <div className="portal-stat-tile">
          <div className="portal-stat-head">
            <span>Body Weight</span>
            <Scale size={14} style={{ color: "var(--accent)" }} />
          </div>
          <div className="portal-stat-value">
            {member.weight_kg ? `${member.weight_kg} kg` : "—"}
          </div>
          <div className="portal-stat-sub">Registered profile weight</div>
        </div>

        <div className="portal-stat-tile">
          <div className="portal-stat-head">
            <span>Height</span>
            <Activity size={14} style={{ color: "var(--green)" }} />
          </div>
          <div className="portal-stat-value">
            {member.height_cm ? `${member.height_cm} cm` : "—"}
          </div>
          <div className="portal-stat-sub">Registered profile height</div>
        </div>
      </div>

      {/* ── MEMBER IDENTIFIER BADGE ── */}
      <div
        className="portal-card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          background: "linear-gradient(135deg, rgba(0, 113, 227, 0.08), rgba(52, 199, 89, 0.04))",
          borderColor: "rgba(0, 113, 227, 0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "rgba(0, 113, 227, 0.15)",
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "0.05em" }}>
              GYM MEMBER ID
            </div>
            <div style={{ fontSize: 14, fontWeight: 750, color: "var(--text-primary)", fontFamily: "monospace" }}>
              {shortId}
              <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 6, fontWeight: 400 }}>
                ({member.id.slice(0, 18)}...)
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-mid)",
            background: "var(--surface-2)",
            color: copiedId ? "var(--green)" : "var(--text-secondary)",
            fontSize: 12,
            fontWeight: 650,
            cursor: "pointer",
          }}
        >
          {copiedId ? (
            <>
              <Check size={13} />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={13} />
              <span>Copy ID</span>
            </>
          )}
        </button>
      </div>

      {/* ── CONTACT DETAILS ── */}
      <div className="portal-card" style={{ gap: 10 }}>
        <div className="portal-card-title" style={{ fontSize: 13.5 }}>
          <User size={15} style={{ color: "var(--text-secondary)" }} />
          <span>Contact Information</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
          {member.phone && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)" }}>
              <Phone size={14} style={{ color: "var(--text-tertiary)" }} />
              <span>{member.phone}</span>
            </div>
          )}
          {member.email && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)" }}>
              <Mail size={14} style={{ color: "var(--text-tertiary)" }} />
              <span>{member.email}</span>
            </div>
          )}
          {member.branches?.address && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-primary)" }}>
              <MapPin size={14} style={{ color: "var(--text-tertiary)" }} />
              <span>{member.branches.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── RECENT VISITS LOG ── */}
      <div className="portal-card" style={{ gap: 10 }}>
        <div className="portal-card-header">
          <div className="portal-card-title" style={{ fontSize: 13.5 }}>
            <Clock size={15} style={{ color: "var(--accent)" }} />
            <span>Recent Check-ins</span>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {attendance.length} total visits
          </span>
        </div>

        {attendance.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 0" }}>
            No check-in logs recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {attendance.slice(0, 5).map((log) => {
              const inDate = new Date(log.check_in_at);
              const dateStr = inDate.toLocaleDateString("en-IN", {
                weekday: "short",
                day: "numeric",
                month: "short",
              });
              const timeStr = inDate.toLocaleTimeString("en-IN", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              });

              let durationStr = "In progress";
              if (log.check_out_at) {
                const mins = Math.round(
                  (new Date(log.check_out_at).getTime() - inDate.getTime()) / 60000
                );
                durationStr = mins < 60 ? `${mins}m session` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
              }

              return (
                <div
                  key={log.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    background: "var(--surface-2)",
                    borderRadius: 10,
                    fontSize: 12.5,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650 }}>{dateStr}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{timeStr}</div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-secondary)" }}>
                    {durationStr}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── PAYMENT INVOICES HISTORY ── */}
      <div className="portal-card" style={{ gap: 10 }}>
        <div className="portal-card-header">
          <div className="portal-card-title" style={{ fontSize: 13.5 }}>
            <Receipt size={15} style={{ color: "var(--green)" }} />
            <span>Payment Receipts</span>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
            {payments.length} transactions
          </span>
        </div>

        {payments.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--text-secondary)", padding: "10px 0" }}>
            No payment history recorded.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {payments.map((p) => {
              const amountINR = Math.round(p.total_paise / 100);
              const paidDate = new Date(p.paid_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 10px",
                    background: "var(--surface-2)",
                    borderRadius: 10,
                    fontSize: 12.5,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 650 }}>₹{amountINR.toLocaleString("en-IN")}</div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                      {paidDate} • {(p.method || "Paid").toUpperCase()}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      color: "var(--green)",
                      background: "var(--green-dim)",
                      padding: "2px 7px",
                      borderRadius: 6,
                    }}
                  >
                    {p.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SWITCH MEMBER / LOG OUT BUTTON ── */}
      <div style={{ marginTop: 8 }}>
        <button
          type="button"
          onClick={onLogout}
          className="ps-btn ps-btn--block ps-btn--secondary"
          style={{
            padding: "12px",
            borderRadius: 12,
            fontSize: 13.5,
            fontWeight: 650,
            display: "flex",
            justifyContent: "center",
            gap: 8,
            color: "var(--red)",
          }}
        >
          <LogOut size={16} />
          <span>Switch Member Account</span>
        </button>
      </div>
    </div>
  );
}
